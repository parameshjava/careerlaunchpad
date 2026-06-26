-- ============================================================================
-- 020_student_approval.sql
-- Student approval gate (spec §5). Mirrors the mentor vetting model: a `status`
-- column (pending_review -> approved -> suspended), a guard trigger so only a
-- reviewer can change it, the `student.review` permission, and set_student_status().
--
-- Rule: SELF-registered students (open signup, register_as_student) start
-- 'pending_review' and need approval. INVITED students — bulk-imported by their
-- college OR added by an owner via the Users screen — are auto-'approved' (already
-- vouched for) by handle_new_user(). Existing students are backfilled 'approved'.
-- ============================================================================

-- 1) Columns. Add `status` with default 'approved' so EVERY existing row is
--    approved on migration (no separate backfill UPDATE — which the guard trigger
--    below would otherwise revert). Then flip the default to 'pending_review' so
--    future SELF-signups (register_as_student, which inserts no explicit status)
--    start pending. Invited students get an explicit 'approved' in handle_new_user.
alter table public.student_profile
  add column if not exists status text not null default 'approved'
    check (status in ('pending_review', 'approved', 'suspended')),
  add column if not exists reviewed_by uuid references public.app_user(id),
  add column if not exists reviewed_at timestamptz;

alter table public.student_profile alter column status set default 'pending_review';

create index if not exists student_profile_status_idx on public.student_profile (status);

-- 2) Permission (data) — global reviewer. Granted to platform_admin; Owner holds
--    '*'. (College-scoped student.review is left for a future migration, exactly
--    like mentor.review — see migration 016.)
insert into public.permission (key, description) values
  ('student.review', 'Review, approve and suspend student registrations.')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on (r.key = 'platform_admin' and p.key = 'student.review')
on conflict do nothing;

-- 3) Guard trigger: only a reviewer (or a trusted provisioning function, which
--    sets the app.provisioning GUC) may set/change `status`. Everyone else —
--    including the student's own insert/update via RLS — is pinned. This is what
--    stops a student from self-approving through the PostgREST API.
create or replace function public.student_profile_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_reviewer  boolean;
  provisioning boolean := coalesce(current_setting('app.provisioning', true) = 'on', false);
begin
  is_reviewer := public.has_permission('student.review')
    or (new.college_id is not null and public.has_college_permission('student.review', new.college_id));

  if tg_op = 'INSERT' then
    if not (is_reviewer or provisioning) then
      new.status := 'pending_review';
    end if;
    return new;
  end if;

  -- UPDATE: gate the status column only.
  if new.status is distinct from old.status then
    if not (is_reviewer or provisioning) then
      new.status := old.status;  -- ignore unauthorized status change
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists student_profile_status_guard_biud on public.student_profile;
create trigger student_profile_status_guard_biud
  before insert or update on public.student_profile
  for each row execute function public.student_profile_status_guard();

-- 4) Re-create handle_new_user() (latest def: migration 019) with one change:
--    INVITED students are provisioned 'approved' (vouched for), bracketed by the
--    app.provisioning GUC so the guard above permits the elevated status.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  inv_role_key text;
begin
  -- Find a live invite for this verified email (case-insensitive).
  select * into inv
  from public.invite
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  -- No invite => do nothing (self-signup happens later via register_as_student).
  if not found then
    return new;
  end if;

  select key into inv_role_key from public.role where id = inv.role_id;

  -- Provision the platform account.
  insert into public.app_user (id, email, employer_id)
  values (new.id, new.email, inv.employer_id)
  on conflict (id) do update set employer_id = excluded.employer_id;

  -- Assign the invited role.
  insert into public.user_role (user_id, role_id, scope_college_id)
  values (
    new.id,
    inv.role_id,
    case when inv_role_key = 'college_admin' then inv.scope_college_id else null end
  )
  on conflict do nothing;

  -- Invited students get a stub profile pre-linked to their college, AUTO-APPROVED
  -- (they were vouched for by their college / the inviting owner). The provisioning
  -- GUC lets the status guard accept 'approved' from this trusted function.
  if inv_role_key = 'student' then
    perform set_config('app.provisioning', 'on', true);  -- txn-local
    insert into public.student_profile (user_id, college_id, full_name, status)
    values (
      new.id, inv.scope_college_id,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      'approved'
    )
    on conflict (user_id) do nothing;
    perform set_config('app.provisioning', 'off', true);
  end if;

  -- Seed a 'personal' notification address for internal recipients + mentors.
  if inv_role_key in ('platform_admin', 'college_admin', 'mentor') and new.email is not null then
    insert into public.notification_email (user_id, email, kind)
    select new.id, new.email, 'personal'
    where not exists (
      select 1 from public.notification_email
      where user_id = new.id and lower(email) = lower(new.email)
    );
  end if;

  -- Mark the invite consumed.
  update public.invite
  set status = 'consumed', consumed_at = now()
  where id = inv.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) set_student_status(target, status) — the audited review action, mirror of
--    set_mentor_status(). Checks the caller holds student.review (global or
--    college-scoped on the target's college), then sets status + reviewer
--    bookkeeping. SECURITY DEFINER so it can stamp reviewed_by.
create or replace function public.set_student_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college uuid;
begin
  if p_status not in ('pending_review', 'approved', 'suspended') then
    raise exception 'invalid status %', p_status;
  end if;

  select college_id into v_college from public.student_profile where user_id = p_user;

  if not (
    public.has_permission('student.review')
    or (v_college is not null and public.has_college_permission('student.review', v_college))
  ) then
    raise exception 'Forbidden: missing student.review';
  end if;

  update public.student_profile
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where user_id = p_user;
end;
$$;

grant execute on function public.set_student_status(uuid, text) to authenticated;
