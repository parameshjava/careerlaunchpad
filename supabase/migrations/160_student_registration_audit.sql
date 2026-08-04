-- ============================================================================
-- 160_student_registration_audit.sql
-- Student registration audit (issue #83). Spec: docs/STUDENT_REGISTRATION_AUDIT.md
--
-- WHAT THIS ANSWERS
--   For any student profile: when did they start, when did they finish, from what
--   IP, who created the record (themselves? an admin? an Excel import?), who
--   touched it last, and how many times have they re-submitted it.
--
-- WHY IT IS ALL TRIGGER/RPC-DRIVEN, NEVER ROUTE-DRIVEN
--   student_profile is written from four provisioning functions and two API
--   surfaces (the student's own form and the staff mirror). Audit stamped at each
--   call site would drift the first time a seventh writer appears — so:
--     • BEFORE INSERT/UPDATE trigger  → started_at / created_by / created_via /
--       updated_by / updated_at, on EVERY write, no matter who writes it.
--     • record_registration_activity()→ the two things a trigger cannot see: the
--       client IP (an HTTP header, so only a route handler knows it) and the
--       submit that bumps `revision`.
--   The trigger also PINS the audit columns for untrusted writers. Without that a
--   student could PATCH a forged created_via/last_ip straight through PostgREST,
--   and an audit trail you can forge is worse than none.
--
-- THE ACTOR IS DERIVED, NOT DECLARED (the impersonation trap)
--   `enterImpersonation` mints the TARGET's real Supabase session, so during a
--   "View as" auth.uid() IS the student — a naive `updated_by := auth.uid()` would
--   credit the student for an admin's edit, i.e. the audit lies in exactly the
--   case it exists for. `acting_user()` resolves the real actor from
--   impersonation_log (migration 101) — server-side truth. The marker cookie is
--   deliberately NOT consulted: cookies are attacker-supplied (httpOnly stops
--   browser JS, not a crafted request), so trusting one would re-open the forgery
--   hole. Every write path inherits the fix because the trigger calls it.
--
-- SIX PIECES
--   1. audit columns on student_profile
--   2. student_registration_event — the append-only timeline (submits, re-registers)
--   3. helpers — acting_user() / impersonating_admin() / infer_registration_source()
--   4. backfill for pre-audit rows (runs BEFORE the triggers exist, so the pins
--      don't block it; marked 'unknown' rather than guessed)
--   5. triggers — stamp on every write, 'created' event, re-registration event
--   6. record_registration_activity() RPC + RLS
--
-- Additive + idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Audit columns on student_profile.
--
-- Note the split between the three timestamps — "end time" is ambiguous once a
-- student can be sent back for corrections (#82) and re-submit:
--   registration_started_at   — first ever write. Immutable.
--   registration_completed_at — FIRST successful submit = the story's "end time",
--                               stamped once, so `completed - started` is a stable
--                               "time to register" that later edits don't inflate.
--   registration_reopened_at  — a soft-deleted student re-registering (#79) starts
--                               a NEW attempt; started_at stays the original, so
--                               this is the "current attempt began" clock.
-- registration_submitted_at (migration 010) keeps its existing meaning — the
-- LATEST submit — and is untouched here, so nothing that reads it changes.
-- ---------------------------------------------------------------------------
alter table public.student_profile
  add column if not exists registration_started_at   timestamptz,
  add column if not exists registration_completed_at timestamptz,
  add column if not exists registration_reopened_at  timestamptz,
  add column if not exists created_by  uuid references public.app_user(id),
  add column if not exists created_via text
    check (created_via in ('self', 'admin', 'import', 'invite', 'unknown')),
  add column if not exists updated_by  uuid references public.app_user(id),
  -- inet holds IPv4 and IPv6 alike; students on mobile networks are frequently v6.
  add column if not exists last_ip     inet,
  -- Completed submits. 0 = never submitted, 1 = registered, 2+ = revised since.
  add column if not exists revision    int not null default 0;

create index if not exists student_profile_created_via_idx
  on public.student_profile (created_via);

-- ---------------------------------------------------------------------------
-- 2) The append-only timeline.
--
-- Only MEANINGFUL events get a row: 'created', 'submitted', 'reregistered'. The
-- step-by-step autosave (PATCH, several per step) deliberately does NOT — it
-- would bury the timeline in noise for no audit value. An in-progress student's
-- IP still lands on student_profile.last_ip, so a never-submitted registration is
-- still attributable.
--
-- Field-level diffs (which columns changed per revision) are a deliberate
-- omission: they need a full profile snapshot per revision, which duplicates the
-- student's PII for a question #83 doesn't ask. Add `changed_fields text[]` here
-- and populate it from the RPC if that changes.
-- ---------------------------------------------------------------------------
create table if not exists public.student_registration_event (
  id              uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_user(id) on delete cascade,
  event           text not null check (event in ('created', 'submitted', 'reregistered')),
  -- The revision this submit produced. NULL for non-submit events.
  revision        int,
  -- The REAL actor (impersonation-resolved), NULL when a provisioning function
  -- acted with no session (e.g. the auth.users trigger).
  actor_user_id   uuid references public.app_user(id),
  actor_kind      text not null check (actor_kind in ('self', 'staff', 'system', 'unknown')),
  -- true when the actor was an admin inside a "View as" session.
  on_behalf       boolean not null default false,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists student_registration_event_student_idx
  on public.student_registration_event (student_user_id, created_at desc);

-- One row per (student, revision) — a double-submit can't inflate the count.
create unique index if not exists student_registration_event_revision_uniq
  on public.student_registration_event (student_user_id, revision)
  where revision is not null;

-- ---------------------------------------------------------------------------
-- 3) Helpers.
-- ---------------------------------------------------------------------------

-- The admin currently impersonating p_target, or NULL. Truth comes from
-- impersonation_log: the latest row for the target must be an 'enter' that hasn't
-- been exited and is still inside the impersonation session's life.
--
-- The 8-hour bound mirrors SESSION_MAX_AGE in app/impersonation/actions.ts and
-- matters: an admin who closes the tab without pressing Exit leaves a dangling
-- 'enter' row, and without the window every later edit BY THE STUDENT THEMSELVES
-- would be attributed to that admin. Keep the two in sync.
create or replace function public.impersonating_admin(p_target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.admin_id
  from (
    select l.admin_id, l.action, l.created_at
    from public.impersonation_log l
    where l.target_id = p_target
    order by l.created_at desc, l.id desc
    limit 1
  ) t
  where t.action = 'enter'
    and t.created_at > now() - interval '8 hours';
$$;

-- Who is REALLY acting: the impersonating admin if this is a "View as" session,
-- otherwise the session user. This is the function every audit write must use in
-- place of auth.uid().
create or replace function public.acting_user()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.impersonating_admin(auth.uid()), auth.uid());
$$;

-- How did this profile come to exist? Evidence beats guessing, so the checks run
-- most-specific first:
--   1. a student_intake row for the email → staff put them there. BOTH the Excel
--      import and the console's single "Add student" go through
--      import_student_intake(), so this one branch covers both.
--   2. an invite row                     → staff invited them individually
--   3. an acting user who isn't the student → an admin created it in the console
--   4. otherwise                         → open self-signup ('self')
--
-- Why (4) is 'self' and not 'unknown': with no intake row and no invite, the only
-- remaining way an app_user + student_profile can exist is register_as_student().
-- That's an inference from exhausted alternatives, not a guess — and it matters,
-- because the backfill below calls this with a NULL actor, so an 'unknown' default
-- would label every historical self-signup "Not recorded". 'unknown' is reserved
-- for the genuinely unresolvable case: no email to match evidence against.
--
-- Precedence note: an imported student who later fills the form themselves reads
-- as 'import', because the RECORD originated with the college — which is the
-- distinction #83 asks for ("self vs admin registered"). `registration_status`
-- still tells you whether they personally completed the form.
create or replace function public.infer_registration_source(p_user uuid, p_actor uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  em text;
begin
  select email into em from public.app_user where id = p_user;
  if em is null then
    select email into em from auth.users where id = p_user;
  end if;

  -- No email: nothing to match evidence against.
  if em is null then
    if p_actor is null then return 'unknown'; end if;
    return case when p_actor = p_user then 'self' else 'admin' end;
  end if;

  if exists (select 1 from public.student_intake where lower(email) = lower(em)) then
    return 'import';
  end if;
  if exists (select 1 from public.invite where lower(email) = lower(em)) then
    return 'invite';
  end if;
  if p_actor is not null and p_actor <> p_user then
    return 'admin';
  end if;
  return 'self';
end;
$$;

grant execute on function public.impersonating_admin(uuid) to authenticated;
grant execute on function public.acting_user() to authenticated;
grant execute on function public.infer_registration_source(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Backfill for rows that pre-date auditing.
--
-- Runs BEFORE section 5 creates the triggers — deliberately, because the stamp
-- trigger PINS these columns against untrusted UPDATEs and would silently revert
-- this whole block (the same trap migration 020 documents for `status`).
--
-- What can honestly be recovered: the existing submit timestamp as the completion,
-- the source from intake/invite evidence, and revision=1 for anyone already
-- submitted.
--
-- What CANNOT: the START TIME, the IP, and the actor of those historical submits.
-- Those stay NULL / 'unknown'. In particular there is NO start-time proxy — an
-- earlier draft of this migration filled it from app_user.created_at, and the
-- audit panel dutifully subtracted it from the submit time and reported "took
-- 12 d 11 hr" for a registration nobody had measured. Account creation is when the
-- student first signed in, not when they opened the form; presenting the gap as a
-- duration invents a measurement, which is the one thing this feature must not do.
-- Section 8 clears any such value left by that earlier run.
-- ---------------------------------------------------------------------------
update public.student_profile sp set
  registration_completed_at = coalesce(sp.registration_completed_at, sp.registration_submitted_at),
  created_via               = coalesce(sp.created_via, public.infer_registration_source(sp.user_id, null)),
  revision                  = case
                                when sp.registration_status = 'submitted' then greatest(sp.revision, 1)
                                else sp.revision
                              end
from public.app_user au
where au.id = sp.user_id
  and sp.created_via is null;

-- For imported/invited students the creator IS recorded — on the intake row
-- (`created_by`) or the invite that staff raised (`invited_by`). Oldest match
-- wins, so a re-invite doesn't rewrite who first added them.
update public.student_profile sp set
  created_by = coalesce(
    (select i.created_by from public.student_intake i
      where lower(i.email) = lower(au.email) and i.created_by is not null
      order by i.created_at asc limit 1),
    (select v.invited_by from public.invite v
      where lower(v.email) = lower(au.email) and v.invited_by is not null
      order by v.created_at asc limit 1))
from public.app_user au
where au.id = sp.user_id
  and sp.created_by is null
  and au.email is not null
  and sp.created_via in ('import', 'invite');

-- A self-registered student created their own record.
update public.student_profile sp
   set created_by = sp.user_id
 where sp.created_by is null and sp.created_via = 'self';

-- One timeline entry for each historical submit, explicitly marked unattributed.
insert into public.student_registration_event
  (student_user_id, event, revision, actor_user_id, actor_kind, created_at)
select sp.user_id, 'submitted', 1, null, 'unknown', sp.registration_submitted_at
from public.student_profile sp
where sp.registration_submitted_at is not null
  and not exists (
    select 1 from public.student_registration_event e where e.student_user_id = sp.user_id
  );

-- ---------------------------------------------------------------------------
-- 5) Triggers.
-- ---------------------------------------------------------------------------

-- Stamp-and-pin. Fires on every student_profile write from every writer.
--
-- `app.audit_write` is the trusted-writer gate, same GUC pattern as
-- `app.provisioning` in migration 020: only a SECURITY DEFINER function that has
-- authorized the caller turns it on, so the immutable columns are unwritable
-- through the ordinary PostgREST path.
create or replace function public.student_profile_audit_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor   uuid    := public.acting_user();
  trusted boolean := coalesce(current_setting('app.audit_write', true) = 'on', false);
begin
  if tg_op = 'INSERT' then
    new.registration_started_at := coalesce(new.registration_started_at, now());
    -- An explicit created_via from a provisioning function wins; otherwise infer.
    new.created_via := coalesce(new.created_via, public.infer_registration_source(new.user_id, actor));
    new.created_by  := coalesce(new.created_by, actor);
    new.updated_by  := coalesce(new.updated_by, actor);
    new.updated_at  := now();
    return new;
  end if;

  -- UPDATE: who touched it, when — automatic, so no route can forget.
  -- coalesce keeps the last known human when a session-less function writes.
  new.updated_at := now();
  new.updated_by := coalesce(actor, old.updated_by);

  if not trusted then
    new.created_by                := old.created_by;
    new.created_via               := old.created_via;
    new.registration_started_at   := old.registration_started_at;
    new.registration_completed_at := old.registration_completed_at;
    new.registration_reopened_at  := old.registration_reopened_at;
    new.last_ip                   := old.last_ip;
    new.revision                  := old.revision;
  end if;
  return new;
end;
$$;

-- Fires before student_profile_status_guard_biud (triggers run in name order, and
-- 'a' < 's'); the two touch disjoint columns, so the order is incidental.
drop trigger if exists student_profile_audit_biu on public.student_profile;
create trigger student_profile_audit_biu
  before insert or update on public.student_profile
  for each row execute function public.student_profile_audit_stamp();

-- Opens the timeline. AFTER INSERT so the row (and its FK target) already exists.
-- No IP here — a trigger can't see HTTP headers; the first save records it.
create or replace function public.student_profile_audit_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_registration_event
    (student_user_id, event, actor_user_id, actor_kind)
  values (
    new.user_id, 'created', new.created_by,
    case
      when new.created_by is null        then 'system'
      when new.created_by = new.user_id  then 'self'
      else 'staff'
    end
  );
  return null;
end;
$$;

drop trigger if exists student_profile_audit_created_ai on public.student_profile;
create trigger student_profile_audit_created_ai
  after insert on public.student_profile
  for each row execute function public.student_profile_audit_created();

-- Re-registration (#79). register_as_student() un-deletes the app_user and then
-- inserts the profile with ON CONFLICT DO NOTHING — so for a returning student
-- NOTHING fires on student_profile and the new attempt would be invisible.
-- Watching app_user.status instead catches it, and catches an admin restoring the
-- account by any other route too.
create or replace function public.app_user_reactivation_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.acting_user();
begin
  if old.status = 'deleted' and new.status <> 'deleted'
     and exists (select 1 from public.student_profile where user_id = new.id) then

    -- Trusted write: registration_reopened_at is a pinned column.
    perform set_config('app.audit_write', 'on', true);
    update public.student_profile
       set registration_reopened_at = now()
     where user_id = new.id;

    insert into public.student_registration_event
      (student_user_id, event, actor_user_id, actor_kind, on_behalf)
    values (
      new.id, 'reregistered', actor,
      case
        when actor is null      then 'system'
        when actor = new.id     then 'self'
        else 'staff'
      end,
      actor is not null and actor is distinct from auth.uid()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists app_user_reactivation_audit_au on public.app_user;
create trigger app_user_reactivation_audit_au
  after update of status on public.app_user
  for each row execute function public.app_user_reactivation_audit();

-- ---------------------------------------------------------------------------
-- 6) The RPC — the only writer of IP and revision.
--
-- Called by all four registration routes (student PATCH/submit + the staff mirror)
-- because only a route handler can see the request headers.
--
--   p_kind 'save'   → stamp last_ip (so an abandoned registration is attributable)
--   p_kind 'submit' → stamp last_ip, complete the clock, bump revision, log it
--
-- p_ip is TEXT, not inet, and cast defensively: x-forwarded-for is whatever the
-- edge put there, and a malformed header must never fail a student's submit.
-- ---------------------------------------------------------------------------
create or replace function public.record_registration_activity(
  p_student    uuid,
  p_kind       text,
  p_ip         text default null,
  p_user_agent text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  actor   uuid := public.acting_user();
  ip      inet;
  new_rev int;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if p_kind not in ('save', 'submit') then
    raise exception 'p_kind must be save or submit';
  end if;

  -- The student themselves, or staff authorized to manage profiles (globally or
  -- for that student's college). Same permission the staff routes check.
  if caller <> p_student
     and not public.has_permission('student.profile.manage')
     and not public.has_college_permission(
               'student.profile.manage',
               (select college_id from public.student_profile where user_id = p_student)) then
    raise exception 'Forbidden';
  end if;

  begin
    ip := nullif(trim(p_ip), '')::inet;
  exception when others then
    ip := null;   -- unparseable header: record the event, drop the address
  end;

  perform set_config('app.audit_write', 'on', true);

  update public.student_profile sp set
    -- Stamp a start only for a registration still IN FLIGHT. For a student who
    -- completed before auditing existed, started_at is legitimately unknown, and
    -- now() would place the "start" AFTER the recorded completion — a registration
    -- that finished before it began. Their first post-migration save must leave it
    -- NULL ("Not recorded") rather than manufacture an impossible ordering.
    registration_started_at   = coalesce(
                                  sp.registration_started_at,
                                  case when sp.registration_completed_at is null then now() end),
    last_ip                   = coalesce(ip, sp.last_ip),
    revision                  = sp.revision + case when p_kind = 'submit' then 1 else 0 end,
    registration_completed_at = case
                                  when p_kind = 'submit'
                                    then coalesce(sp.registration_completed_at, now())
                                  else sp.registration_completed_at
                                end
  where sp.user_id = p_student
  returning sp.revision into new_rev;

  if new_rev is null then
    raise exception 'No student profile for %', p_student;
  end if;

  if p_kind = 'submit' then
    insert into public.student_registration_event
      (student_user_id, event, revision, actor_user_id, actor_kind, on_behalf, ip, user_agent)
    values (
      p_student, 'submitted', new_rev, actor,
      case
        when actor is null       then 'system'
        when actor = p_student   then 'self'
        else 'staff'
      end,
      actor is not null and actor is distinct from caller,
      ip,
      left(p_user_agent, 400)
    );
  end if;

  return new_rev;
end;
$$;

grant execute on function public.record_registration_activity(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) RLS on the timeline.
--
-- An IP address is personal data (India's DPDP Act; GDPR art. 4 likewise), so the
-- timeline is STAFF-ONLY — reviewers and profile managers, global or college-
-- scoped, mirroring student_review_note (migration 149). Students are not given
-- their own audit trail: there is nothing for them to do with it, and surfacing
-- "we logged your IP" invites support load for no benefit.
--
-- No insert/update/delete policy exists, so the table is append-only from the
-- outside — only the SECURITY DEFINER functions above write it.
-- ---------------------------------------------------------------------------
alter table public.student_registration_event enable row level security;

drop policy if exists student_registration_event_staff_read on public.student_registration_event;
create policy student_registration_event_staff_read on public.student_registration_event
  for select to authenticated
  using (
    public.has_permission('student.review')
    or public.has_permission('student.profile.manage')
    or public.has_college_permission(
         'student.review',
         (select college_id from public.student_profile where user_id = student_user_id))
    or public.has_college_permission(
         'student.profile.manage',
         (select college_id from public.student_profile where user_id = student_user_id))
  );

-- ---------------------------------------------------------------------------
-- 8) Re-run repairs.
--
-- This file is safe to re-apply, and an earlier version of it wrote two values
-- that turned out to be wrong. On a fresh database both statements below match
-- nothing; on a database that already ran that version they correct it.
--
-- The trigger is switched OFF around the repair. It pins these columns against
-- untrusted writes (which is the point of it) and stamps updated_at/updated_by on
-- every UPDATE — so leaving it on would rewrite every student's real "last
-- updated" to this migration's timestamp, destroying the column the story asked
-- for. A data repair is not a user edit, so it should leave no footprint.
-- ---------------------------------------------------------------------------
alter table public.student_profile disable trigger student_profile_audit_biu;

-- 8a) Drop start times proxied from the signup date. Identified exactly: the old
--     backfill set started_at = app_user.created_at, whereas a real start is
--     stamped with now() at the first save, so equality means "backfilled".
update public.student_profile sp
   set registration_started_at = null
  from public.app_user au
 where au.id = sp.user_id
   and sp.registration_started_at = au.created_at;

-- 8b) Self-signups mislabelled 'unknown'. The old infer_registration_source()
--     couldn't reach its 'self' branch when called with a NULL actor (as the
--     backfill does), so every self-registered student read "Not recorded".
--     Re-inferred here from the same exhausted-alternatives evidence.
update public.student_profile sp
   set created_via = 'self',
       created_by  = coalesce(sp.created_by, sp.user_id)
  from public.app_user au
 where au.id = sp.user_id
   and sp.created_via = 'unknown'
   and au.email is not null
   and not exists (
     select 1 from public.student_intake i where lower(i.email) = lower(au.email)
   )
   and not exists (
     select 1 from public.invite v where lower(v.email) = lower(au.email)
   );

-- 8c) Impossible orderings: a start AFTER the completion. Produced by an earlier
--     version of record_registration_activity(), which stamped now() as the start
--     on the first post-migration save even for students who had completed their
--     registration years earlier. A start can never follow the completion, so the
--     value is known-bogus and is cleared rather than adjusted.
update public.student_profile
   set registration_started_at = null
 where registration_started_at is not null
   and registration_completed_at is not null
   and registration_started_at > registration_completed_at;

alter table public.student_profile enable trigger student_profile_audit_biu;
