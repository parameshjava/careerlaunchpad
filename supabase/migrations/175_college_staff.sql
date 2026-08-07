-- ============================================================================
-- 175_college_staff.sql
-- The College Staff role (issue #108, parent #107) — RBAC, storage, RLS, the
-- scoped approval loop, and the invite branch that auto-approves.
--
-- WHY A NEW ROLE AND NOT A SECOND COLLEGE ADMIN
--   college_admin (007) is the only college-scoped actor we have, and it can
--   manage the college profile and conduct exam sittings. A lecturer or TPO who
--   just wants to watch their own students had no account type, so they either
--   got a college_admin grant they shouldn't have or they emailed us.
--   college_staff is the READ half of that bundle, one rung below.
--
-- THE THREE RULES THIS MIGRATION ENFORCES (from #107)
--   1. Only the RESPECTIVE college's admin may approve. Expressed by scope, not
--      by filtering: a college_admin's user_role row carries scope_college_id,
--      so every college.staff.* permission we bundle onto that role is already
--      single-college via has_college_permission().
--   2. College staff can neither invite nor approve staff — they simply do not
--      hold college.staff.invite / .review.
--   3. Invited ⇒ auto-approved; self-registered ⇒ needs approval. §9 and §10.
--
-- has_permission() IS NOT "GLOBALLY" — READ THIS BEFORE EDITING
--   has_permission (003_auth_helpers.sql:19) never looks at scope_college_id, so
--   it is TRUE for a college_admin whose grant covers exactly one college. Any
--   check written `has_permission(x) or has_college_permission(x, …)` therefore
--   short-circuits on the first branch and leaks every college — the defect
--   post-mortem'd at length in 174_feedback_review_fixes.sql:8-25. Every check
--   below uses has_global_permission() or has_college_permission(). Never
--   has_permission(). Not once.
--
-- GRANT-ON-APPROVAL, NOT GRANT-ON-REGISTRATION (#107 §7 Q1)
--   Unlike register_as_mentor() (017), self-registration here grants NO role.
--   The scoped user_role row is created BY the approval and deleted by a
--   suspend/reject. A pending registrant is not "a staff member seeing a
--   banner" — they hold nothing and RLS returns them nothing. The mentor
--   pattern is safe because a pending mentor's permissions expose no student
--   data; college_staff's entire bundle IS student data, so granting first and
--   gating later would leak.
--
-- Idempotent throughout (create-or-replace / if not exists / on conflict).
-- Run `supabase db advisors` after applying.
-- ============================================================================

begin;

-- ============================================================================
-- 1) Role + permissions (data — a new role is an INSERT, per 007's note)
-- ============================================================================
insert into public.role (key, name, description, is_system, rank) values
  ('college_staff', 'College Staff',
   'Faculty or staff of ONE college. Monitors that college''s students, batches, results and feedback. Cannot manage the college, conduct sittings, invite staff, or approve staff.',
   true, 0)
on conflict (key) do nothing;

insert into public.permission (key, description) values
  ('college.staff.view',          'View a college''s staff roster and staff profiles.'),
  ('college.staff.invite',        'Invite college staff into a college (the college_staff role only).'),
  ('college.staff.review',        'Approve, send back, suspend or reject college staff registrations.'),
  ('college.batch.progress.view', 'Read subject/chapter progress for a college''s batches (read-only).')
on conflict (key) do nothing;

-- College Admin runs their own college's staff. Their grant row carries
-- scope_college_id, so all four are automatically single-college.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on r.key = 'college_admin' and p.key in (
  'college.staff.view', 'college.staff.invite', 'college.staff.review',
  'college.batch.progress.view'
)
on conflict do nothing;

-- Platform Admin holds them UNSCOPED, so it reviews for any college. Owner
-- already holds '*'.
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on r.key = 'platform_admin' and p.key in (
  'college.staff.view', 'college.staff.invite', 'college.staff.review',
  'college.batch.progress.view'
)
on conflict do nothing;

-- The staff bundle: READ their own college, nothing else. Deliberately absent —
--   college.profile.manage  (editing the college record stays with the Admin)
--   exam.assign             (conducting sittings stays with the Admin)
--   batch.progress.manage   (writing progress stays with platform / the assigned
--                            mentor; see the note in §8)
--   user.invite, college.staff.*  (rule 2)
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on r.key = 'college_staff' and p.key in (
  'college.students.view', 'college.analytics.view', 'exam.results.view_all',
  'feedback.view.identified', 'college.batch.progress.view'
)
on conflict do nothing;

-- Converge on re-run: if a previous pass of this file (or a hand edit) gave the
-- staff role anything outside that set, strip it. Keeps the role's reach exactly
-- what this migration says it is.
delete from public.role_permission rp
using public.role r, public.permission p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key = 'college_staff'
  and p.key not in (
    'college.students.view', 'college.analytics.view', 'exam.results.view_all',
    'feedback.view.identified', 'college.batch.progress.view'
  );

-- ============================================================================
-- 2) ref_staff_designation — the one new reference table
-- ============================================================================
-- Department reuses ref_branch (010/161) — a second department list would drift
-- from the one the student and mentor forms already use.
create table if not exists public.ref_staff_designation (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  label      text not null,
  category   text,
  sort_order int  not null default 0,
  is_active  boolean not null default true
);

insert into public.ref_staff_designation (slug, label, category, sort_order) values
  ('professor',            'Professor',                     'Teaching',      1),
  ('associate_professor',  'Associate Professor',           'Teaching',      2),
  ('assistant_professor',  'Assistant Professor',           'Teaching',      3),
  ('lecturer',             'Lecturer',                      'Teaching',      4),
  ('lab_instructor',       'Lab Instructor / Technician',   'Teaching',      5),
  ('hod',                  'Head of Department',            'Leadership',    6),
  ('dean',                 'Dean',                          'Leadership',    7),
  ('vice_principal',       'Vice Principal',                'Leadership',    8),
  ('principal',            'Principal',                     'Leadership',    9),
  ('tpo',                  'Training & Placement Officer',  'Placement',    10),
  ('placement_coordinator','Placement Coordinator',         'Placement',    11),
  ('training_coordinator', 'Training Coordinator',          'Placement',    12),
  ('librarian',            'Librarian',                     'Support',      13),
  ('admin_staff',          'Administrative Staff',          'Support',      14),
  ('other',                'Other',                         'Support',      99)
on conflict (slug) do nothing;

alter table public.ref_staff_designation enable row level security;

-- Public-read like every other ref_* table (010's loop at :214-229).
drop policy if exists ref_staff_designation_read_all on public.ref_staff_designation;
create policy ref_staff_designation_read_all on public.ref_staff_designation
  for select using (true);

-- Writable by refdata.manage, matching what 161 did for ref_degree/ref_branch,
-- so the catalogue editor can pick this table up later without a migration.
-- DELETE is deliberately not granted: designation_id is an FK on live profiles.
drop policy if exists ref_staff_designation_insert_refdata on public.ref_staff_designation;
create policy ref_staff_designation_insert_refdata on public.ref_staff_designation
  for insert to authenticated
  with check (public.has_permission('refdata.manage'));
drop policy if exists ref_staff_designation_update_refdata on public.ref_staff_designation;
create policy ref_staff_designation_update_refdata on public.ref_staff_designation
  for update to authenticated
  using (public.has_permission('refdata.manage'))
  with check (public.has_permission('refdata.manage'));

-- A table with no grant is invisible to PostgREST regardless of policy (161:138).
grant select on public.ref_staff_designation to anon, authenticated;
grant insert, update on public.ref_staff_designation to authenticated;

-- ============================================================================
-- 3) college_staff_profile — 1:1 with app_user, mirroring mentor_profile (017)
-- ============================================================================
create table if not exists public.college_staff_profile (
  user_id                 uuid primary key references public.app_user(id) on delete cascade,

  -- Step 1: identity & position at the college
  full_name               text,
  photo_url               text,
  phone                   text,
  linkedin_url            text,
  -- The college this person works at. NOT NULL is deliberate: every downstream
  -- authorization decision (who reviews, who is notified, what they can read)
  -- keys off it, so a staff row with no college is meaningless.
  college_id              uuid not null references public.college(id),
  employee_code           text,
  designation_id          uuid references public.ref_staff_designation(id),
  designation_other       text,
  department              text,      -- ref_branch slug
  department_other        text,
  office_email            text,
  bio                     text,

  -- Step 2: experience & qualification. This is the half that lets us decide
  -- whether to engage someone for a guest session, a mock-interview panel or
  -- content review, so it is collected at registration, not chased later.
  highest_qualification   text,      -- ref_degree slug
  highest_qualification_other text,
  specialization          text,      -- ref_branch slug
  specialization_other    text,
  other_qualifications    text,
  years_teaching_total    int  check (years_teaching_total  between 0 and 70),
  years_at_this_college   int  check (years_at_this_college between 0 and 70),
  joined_year             int  check (joined_year           between 1900 and 2200),
  years_industry          int  check (years_industry        between 0 and 70),
  previous_institutions   jsonb not null default '[]',  -- [{name, role, from, to}]
  certifications          jsonb not null default '[]',
  achievements            jsonb not null default '[]',  -- publications, awards

  -- Step 3: teaching & engagement (the subjects themselves live in §4)
  teaching_year_ids       uuid[] not null default '{}', -- ref_year_of_study
  instruction_language_ids uuid[] not null default '{}',-- ref_language
  support_area_ids        uuid[] not null default '{}', -- ref_mentoring_area
  contribution_type_ids   uuid[] not null default '{}', -- ref_contribution_type
  availability            text,
  open_to_mentoring       boolean not null default false,
  notes                   text,

  -- Lifecycle. Two independent axes, exactly as mentor_profile splits them:
  --   registration_status = has the FORM been finished
  --   status              = the VETTING state, reviewer-controlled (see §6)
  registration_status     text not null default 'in_progress'
                            check (registration_status in ('in_progress', 'submitted')),
  last_completed_step     int  not null default 0,
  registration_submitted_at timestamptz,
  status                  text not null default 'pending_review'
                            check (status in ('pending_review', 'changes_requested',
                                              'approved', 'suspended', 'rejected')),
  -- How this row came to exist. 'invited' rows are auto-approved in §9.
  staff_source            text not null default 'self'
                            check (staff_source in ('self', 'invited')),
  reviewed_by             uuid references public.app_user(id) on delete set null,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists college_staff_profile_college_idx
  on public.college_staff_profile (college_id);
create index if not exists college_staff_profile_status_idx
  on public.college_staff_profile (status);
-- The roster's default view: one college, pending first.
create index if not exists college_staff_profile_college_status_idx
  on public.college_staff_profile (college_id, status);

-- ============================================================================
-- 4) college_staff_subject — teaching now / taught before / can teach
-- ============================================================================
-- One row per (staff, subject, relation) rather than three uuid[] columns on the
-- profile. The array idiom (mentor_profile.teachable_subject_ids, 140) cannot
-- carry the year and cannot be joined, and the whole point of collecting this is
-- the query "who at college X can teach Quantitative Aptitude?" (#107 §7 Q2).
--
-- subject_id points at public.subject (021) — the SAME subjects batches teach and
-- mentors are assigned to. No second, drifting subject list.
create table if not exists public.college_staff_subject (
  user_id    uuid not null references public.app_user(id) on delete cascade,
  subject_id uuid not null references public.subject(id)  on delete cascade,
  relation   text not null check (relation in ('teaching', 'taught', 'can_teach')),
  since_year int check (since_year between 1900 and 2200),  -- 'teaching' → since when
  last_year  int check (last_year  between 1900 and 2200),  -- 'taught'   → until when
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_id, relation)
);

create index if not exists college_staff_subject_subject_idx
  on public.college_staff_subject (subject_id, relation);

-- ============================================================================
-- 5) college_staff_review_note — the send-back thread
-- ============================================================================
-- Same shape as student_review_note (149): a thread, not one overwritten column,
-- so "wrong college selected" survives as history after the staff member fixes it.
create table if not exists public.college_staff_review_note (
  id           uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.app_user(id) on delete cascade,
  author_user_id uuid not null references public.app_user(id),
  body         text not null check (length(trim(body)) > 0),
  kind         text not null default 'changes_requested'
                 check (kind in ('changes_requested', 'note', 'rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz    -- stamped when the staff member next re-submits
);

create index if not exists college_staff_review_note_staff_idx
  on public.college_staff_review_note (staff_user_id, created_at desc);

-- ============================================================================
-- 6) Guard trigger — the vetting state is reviewer-only, and so is the college
-- ============================================================================
-- Shape copied from mentor_profile_guard (017:66-105): an unauthorized write
-- silently keeps the old value rather than erroring, so a staff member editing
-- their own row through the normal PATCH cannot self-approve even by sending the
-- column.
--
-- college_id is pinned too, which mentor_profile does not do. Reason: the scoped
-- user_role row granted at approval points at the college that was APPROVED. If
-- an approved staff member could later edit college_id to another college, they
-- would surface in that college's roster (whose RLS reads the profile column)
-- while their actual data access still followed the original scope. Not a
-- privilege escalation, but an inconsistency with no upside — a genuine college
-- change is a reviewer action.
create or replace function public.college_staff_profile_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_reviewer boolean;
begin
  if tg_op = 'INSERT' then
    is_reviewer := public.has_global_permission('college.staff.review')
                or public.has_college_permission('college.staff.review', new.college_id);
    if not is_reviewer then
      new.status      := 'pending_review';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
    return new;
  end if;

  -- UPDATE: gate the vetting columns and the college.
  is_reviewer := public.has_global_permission('college.staff.review')
              or public.has_college_permission('college.staff.review', old.college_id);

  if not is_reviewer then
    new.status      := old.status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    -- Pre-approval the registrant may still correct their college (that is the
    -- whole point of a 'changes_requested' send-back); once approved it is fixed.
    if old.status in ('approved', 'suspended') then
      new.college_id := old.college_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists college_staff_profile_guard_biud on public.college_staff_profile;
create trigger college_staff_profile_guard_biud
  before insert or update on public.college_staff_profile
  for each row execute function public.college_staff_profile_guard();

-- ============================================================================
-- 7) RLS
-- ============================================================================
alter table public.college_staff_profile    enable row level security;
alter table public.college_staff_subject    enable row level security;
alter table public.college_staff_review_note enable row level security;

-- ---- college_staff_profile ------------------------------------------------
-- Self: READ and UPDATE your own row — deliberately NOT `for all`.
--
-- No INSERT policy: the row is created only by register_as_college_staff()
-- (SECURITY DEFINER, so it inserts as owner and bypasses RLS). A self-INSERT
-- policy would be a way around that function's allowlist — any signed-in user,
-- including a student or another college's admin, could post a row for any
-- college and land in that college admin's pending queue.
--
-- No DELETE policy either: a rejected registrant could otherwise delete their
-- record and re-register, escaping the rejection.
--
-- The read/update pair needs no permission of its own. An unapproved registrant
-- holds no role at all (grant-on-approval), so gating on a permission would lock
-- them out of the very form they exist to fill in.
drop policy if exists college_staff_profile_self on public.college_staff_profile;
drop policy if exists college_staff_profile_self_read on public.college_staff_profile;
create policy college_staff_profile_self_read on public.college_staff_profile
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists college_staff_profile_self_update on public.college_staff_profile;
create policy college_staff_profile_self_update on public.college_staff_profile
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The respective college's admin. has_college_permission does the scoping, so a
-- college_admin of college B matches nothing for a college-A row.
drop policy if exists college_staff_profile_college_read on public.college_staff_profile;
create policy college_staff_profile_college_read on public.college_staff_profile
  for select to authenticated
  using (public.has_college_permission('college.staff.view', college_id));

-- Platform. has_GLOBAL_permission, not has_permission — see the header note.
drop policy if exists college_staff_profile_platform_read on public.college_staff_profile;
create policy college_staff_profile_platform_read on public.college_staff_profile
  for select to authenticated
  using (public.has_global_permission('college.staff.view'));

drop policy if exists college_staff_profile_reviewer_update on public.college_staff_profile;
create policy college_staff_profile_reviewer_update on public.college_staff_profile
  for update to authenticated
  using (
    public.has_global_permission('college.staff.review')
    or public.has_college_permission('college.staff.review', college_id)
  )
  with check (
    public.has_global_permission('college.staff.review')
    or public.has_college_permission('college.staff.review', college_id)
  );

-- NOTE — there is deliberately NO peer-read policy (#107 §7 Q4). college_staff
-- does not hold college.staff.view, so one staff member cannot read another's
-- row. The roster is admin-and-platform only.

-- ---- college_staff_subject ------------------------------------------------
-- Self-managed (step 3 of the wizard replaces the whole set), but only for
-- someone who actually has a staff profile — otherwise this table becomes a
-- writable scratchpad for every signed-in user.
drop policy if exists college_staff_subject_self on public.college_staff_subject;
create policy college_staff_subject_self on public.college_staff_subject
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.college_staff_profile p where p.user_id = auth.uid())
  );

-- Readable/writable by whoever can read/review the parent profile. Subquery
-- rather than a join so the policy stays one row-level test.
drop policy if exists college_staff_subject_college_read on public.college_staff_subject;
create policy college_staff_subject_college_read on public.college_staff_subject
  for select to authenticated
  using (
    public.has_global_permission('college.staff.view')
    or public.has_college_permission(
         'college.staff.view',
         (select college_id from public.college_staff_profile p where p.user_id = college_staff_subject.user_id))
  );

drop policy if exists college_staff_subject_reviewer_write on public.college_staff_subject;
create policy college_staff_subject_reviewer_write on public.college_staff_subject
  for all to authenticated
  using (
    public.has_global_permission('college.staff.review')
    or public.has_college_permission(
         'college.staff.review',
         (select college_id from public.college_staff_profile p where p.user_id = college_staff_subject.user_id))
  )
  with check (
    public.has_global_permission('college.staff.review')
    or public.has_college_permission(
         'college.staff.review',
         (select college_id from public.college_staff_profile p where p.user_id = college_staff_subject.user_id))
  );

-- ---- college_staff_review_note --------------------------------------------
drop policy if exists college_staff_review_note_reviewer_all on public.college_staff_review_note;
create policy college_staff_review_note_reviewer_all on public.college_staff_review_note
  for all to authenticated
  using (
    public.has_global_permission('college.staff.review')
    or public.has_college_permission(
         'college.staff.review',
         (select college_id from public.college_staff_profile p where p.user_id = college_staff_review_note.staff_user_id))
  )
  with check (
    public.has_global_permission('college.staff.review')
    or public.has_college_permission(
         'college.staff.review',
         (select college_id from public.college_staff_profile p where p.user_id = college_staff_review_note.staff_user_id))
  );

-- The staff member reads their own remarks (to display them) but never writes.
drop policy if exists college_staff_review_note_self_read on public.college_staff_review_note;
create policy college_staff_review_note_self_read on public.college_staff_review_note
  for select to authenticated
  using (staff_user_id = auth.uid());

-- Data API grants (RLS above is the real gate).
grant select, insert, update, delete on public.college_staff_profile     to authenticated;
grant select, insert, update, delete on public.college_staff_subject     to authenticated;
grant select, insert, update         on public.college_staff_review_note to authenticated;

-- ============================================================================
-- 8) Scoped batch-progress reads — the gap that made this feature impossible
-- ============================================================================
-- batch_chapter's staff read is has_permission('batch.progress.manage')
-- (143:696) and batch_session's is has_permission('finance.manage') (134:350).
-- Neither is college-scoped, so before this migration NOBODY holding only a
-- college-scoped grant could see batch progress at all — "college staff see
-- batch progress" is a database gap, not a UI task.
--
-- batch_college (125:157) is the join that makes it expressible. These policies
-- are ADDITIVE: the existing ones are untouched, so no current role's reach
-- changes.
--
-- Read-only on purpose. batch.progress.manage is NOT in the staff bundle; a
-- staff member who genuinely teaches a batch subject still gets write the
-- existing way, by being assigned in batch_subject_mentor — set_batch_*_progress
-- already authorizes "assigned mentor OR batch.progress.manage" (143:265-275).
create or replace function public.batch_in_my_college(p_batch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.batch_college bc
    where bc.batch_id = p_batch
      and public.has_college_permission('college.batch.progress.view', bc.college_id)
  );
$$;

comment on function public.batch_in_my_college(uuid) is
  'True if the caller holds a COLLEGE-SCOPED college.batch.progress.view grant for '
  'a college this batch is linked to (batch_college). Read-only gate for the '
  'college_staff / college_admin progress views.';

grant execute on function public.batch_in_my_college(uuid) to authenticated;

drop policy if exists batch_chapter_college_read on public.batch_chapter;
create policy batch_chapter_college_read on public.batch_chapter
  for select to authenticated
  using (public.batch_in_my_college(batch_id));

drop policy if exists batch_session_college_read on public.batch_session;
create policy batch_session_college_read on public.batch_session
  for select to authenticated
  using (status <> 'cancelled' and public.batch_in_my_college(batch_id));

drop policy if exists batch_session_series_college_read on public.batch_session_series;
create policy batch_session_series_college_read on public.batch_session_series
  for select to authenticated
  using (public.batch_in_my_college(batch_id));

-- ============================================================================
-- 9) Invite provisioning — where "invited ⇒ auto-approved" lives
-- ============================================================================
-- Supersedes 141_activate_invite.sql §1. The ONLY changes are the college_staff
-- scope in the user_role insert and the new college_staff block; every other
-- line is 141's, restated because create-or-replace has no partial form.
--
-- The auto-approval is sound because an invite for this role can only be created
-- through invite_college_staff() (§10), which checks the caller's permission and
-- hard-codes both the role and the scope. There is no path by which an
-- unauthorized invite reaches this function.
create or replace function public._provision_from_invites(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.invite%rowtype;
  rk   text;
  meta jsonb;
  rel  text;
  item jsonb;
begin
  if p_user_id is null or p_email is null then return; end if;
  select raw_user_meta_data into meta from auth.users where id = p_user_id;

  for inv in
    select * from public.invite
    where lower(email) = lower(p_email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id, full_name)
    values (
      p_user_id, p_email, inv.employer_id,
      coalesce(inv.staged_profile->>'full_name', meta->>'full_name', meta->>'name')
    )
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id),
          full_name   = coalesce(public.app_user.full_name, excluded.full_name);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (p_user_id, inv.role_id,
            case when rk in ('college_admin', 'college_staff')
                 then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (p_user_id, inv.scope_college_id,
              coalesce(meta->>'full_name', meta->>'name'))
      on conflict (user_id) do nothing;
    end if;

    -- Admin-staged mentor profile → materialise it now. Omitted columns fall
    -- back to their table defaults; status stays pending_review (review queue).
    if rk = 'mentor' and inv.staged_profile is not null then
      insert into public.mentor_profile (
        user_id, full_name, phone, linkedin_url, bio,
        college_id, graduation_year, degree, branch,
        current_company, current_title, industry_id, years_experience,
        mentoring_area_ids, skills, teachable_subject_ids, career_goal_ids,
        mentor_mode_id, contribution_type_id, availability,
        registration_status, last_completed_step, registration_submitted_at
      )
      values (
        p_user_id,
        inv.staged_profile->>'full_name',
        inv.staged_profile->>'phone',
        inv.staged_profile->>'linkedin_url',
        inv.staged_profile->>'bio',
        nullif(inv.staged_profile->>'college_id', '')::uuid,
        nullif(inv.staged_profile->>'graduation_year', '')::int,
        inv.staged_profile->>'degree',
        inv.staged_profile->>'branch',
        inv.staged_profile->>'current_company',
        inv.staged_profile->>'current_title',
        nullif(inv.staged_profile->>'industry_id', '')::uuid,
        nullif(inv.staged_profile->>'years_experience', '')::int,
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'mentoring_area_ids') x), '{}'),
        coalesce((select array_agg(x)       from jsonb_array_elements_text(inv.staged_profile->'skills') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'teachable_subject_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'career_goal_ids') x), '{}'),
        nullif(inv.staged_profile->>'mentor_mode_id', '')::uuid,
        nullif(inv.staged_profile->>'contribution_type_id', '')::uuid,
        inv.staged_profile->>'availability',
        'submitted', 3, now()
      )
      on conflict (user_id) do nothing;
    end if;

    -- Invited college staff → materialise the staged profile AND approve it.
    -- The scoped user_role row was already inserted above, so they are live the
    -- moment they sign in, with no review step (#107 rule 3).
    if rk = 'college_staff' and inv.scope_college_id is not null then
      insert into public.college_staff_profile (
        user_id, full_name, phone, linkedin_url, college_id,
        employee_code, designation_id, designation_other, department, department_other,
        office_email, bio,
        highest_qualification, highest_qualification_other, specialization, specialization_other,
        other_qualifications, years_teaching_total, years_at_this_college, joined_year,
        years_industry, previous_institutions, certifications, achievements,
        teaching_year_ids, instruction_language_ids, support_area_ids, contribution_type_ids,
        availability, open_to_mentoring, notes,
        registration_status, last_completed_step, registration_submitted_at,
        status, staff_source, reviewed_by, reviewed_at
      )
      values (
        p_user_id,
        coalesce(inv.staged_profile->>'full_name', meta->>'full_name', meta->>'name'),
        inv.staged_profile->>'phone',
        inv.staged_profile->>'linkedin_url',
        inv.scope_college_id,
        inv.staged_profile->>'employee_code',
        nullif(inv.staged_profile->>'designation_id', '')::uuid,
        inv.staged_profile->>'designation_other',
        inv.staged_profile->>'department',
        inv.staged_profile->>'department_other',
        inv.staged_profile->>'office_email',
        inv.staged_profile->>'bio',
        inv.staged_profile->>'highest_qualification',
        inv.staged_profile->>'highest_qualification_other',
        inv.staged_profile->>'specialization',
        inv.staged_profile->>'specialization_other',
        inv.staged_profile->>'other_qualifications',
        nullif(inv.staged_profile->>'years_teaching_total', '')::int,
        nullif(inv.staged_profile->>'years_at_this_college', '')::int,
        nullif(inv.staged_profile->>'joined_year', '')::int,
        nullif(inv.staged_profile->>'years_industry', '')::int,
        coalesce(inv.staged_profile->'previous_institutions', '[]'::jsonb),
        coalesce(inv.staged_profile->'certifications', '[]'::jsonb),
        coalesce(inv.staged_profile->'achievements', '[]'::jsonb),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'teaching_year_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'instruction_language_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'support_area_ids') x), '{}'),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(inv.staged_profile->'contribution_type_ids') x), '{}'),
        inv.staged_profile->>'availability',
        coalesce((inv.staged_profile->>'open_to_mentoring')::boolean, false),
        inv.staged_profile->>'notes',
        'submitted', 3, now(),
        'approved', 'invited', inv.invited_by, now()
      )
      on conflict (user_id) do nothing;

      -- Staged subjects: [{subject_id, relation, since_year, last_year, is_primary}]
      for item in
        select * from jsonb_array_elements(coalesce(inv.staged_profile->'subjects', '[]'::jsonb))
      loop
        rel := item->>'relation';
        if rel in ('teaching', 'taught', 'can_teach')
           and nullif(item->>'subject_id', '') is not null then
          insert into public.college_staff_subject
            (user_id, subject_id, relation, since_year, last_year, is_primary)
          values (
            p_user_id,
            (item->>'subject_id')::uuid,
            rel,
            nullif(item->>'since_year', '')::int,
            nullif(item->>'last_year', '')::int,
            coalesce((item->>'is_primary')::boolean, false)
          )
          on conflict do nothing;
        end if;
      end loop;
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;
end;
$$;

-- ============================================================================
-- 9b) auth_context() — carry the staff registration state
-- ============================================================================
-- Supersedes 093. The only change is the 'college_staff' key.
--
-- Why it belongs here rather than in an extra per-request query: a
-- self-registered staff member has an app_user row but NO role until approval,
-- and computeHomePath() (lib/auth.ts) sends a provisioned-but-roleless user to
-- /auth/no-access — a loop, since that page is where they just came from. The
-- app needs to know "this person has a staff registration in flight" on every
-- request, and auth_context() is already the one round-trip that answers "who is
-- this?". A separate query would add a round-trip to every page load.
--
-- Null when the user has no staff profile, so existing callers are unaffected.
create or replace function public.auth_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null
      or not exists (select 1 from public.app_user where id = auth.uid() and status <> 'deleted')
    then jsonb_build_object('provisioned', false)
    else jsonb_build_object(
      'provisioned',  true,
      'email',        (select email from public.app_user where id = auth.uid()),
      'name',         (select full_name from public.app_user where id = auth.uid()),
      'phone',        (select phone from public.app_user where id = auth.uid()),
      'status',       (select status from public.app_user where id = auth.uid()),
      'employer_id',  (select employer_id from public.app_user where id = auth.uid()),
      'exam_evaluator', exists(
        select 1 from public.exam_staff where user_id = auth.uid()),
      'college_staff', (
        select jsonb_build_object(
                 'status',              csp.status,
                 'registration_status', csp.registration_status,
                 'college_id',          csp.college_id)
        from public.college_staff_profile csp
        where csp.user_id = auth.uid()),
      'roles', coalesce((
        select jsonb_agg(distinct r.key)
        from public.user_role ur join public.role r on r.id = ur.role_id
        where ur.user_id = auth.uid()), '[]'::jsonb),
      'permissions', coalesce((
        select jsonb_agg(distinct p.key)
        from public.user_role ur
        join public.role_permission rp on rp.role_id = ur.role_id
        join public.permission p on p.id = rp.permission_id
        where ur.user_id = auth.uid()), '[]'::jsonb),
      'college_scopes', coalesce((
        select jsonb_agg(distinct ur.scope_college_id)
        from public.user_role ur
        where ur.user_id = auth.uid() and ur.scope_college_id is not null), '[]'::jsonb)
    )
  end;
$$;

-- ============================================================================
-- 10) RPCs
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 10a) register_as_college_staff(p_college) — self-registration.
-- Provisions app_user + a pending_review profile for the chosen college and
-- grants NO role (see the header). Idempotent: re-calling while still
-- in_progress just moves the college (the registrant may not have finished
-- step 1 yet); once submitted it is a no-op.
--
-- Allowlist: only an account with no roles at all, or one that holds ONLY
-- mentor. Everyone else (student, employer, college_admin, another college's
-- staff, or any platform role) is refused — a staff grant for those is an
-- administrative act, available through set_college_staff().
-- ---------------------------------------------------------------------------
create or replace function public.register_as_college_staff(p_college uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  uemail    text;
  uname     text;
  other_roles int;
  existing  public.college_staff_profile%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_college is null or not exists (select 1 from public.college where id = p_college) then
    raise exception 'Choose the college you work at';
  end if;

  select count(*) into other_roles
  from public.user_role ur join public.role r on r.id = ur.role_id
  where ur.user_id = uid and r.key <> 'mentor';

  if other_roles > 0 then
    raise exception 'This account already has a role on the platform. Ask your college admin to add you as staff.';
  end if;

  select email,
         coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
    into uemail, uname
  from auth.users where id = uid;

  insert into public.app_user (id, email, full_name)
  values (uid, uemail, uname)
  on conflict (id) do update
    set full_name = coalesce(public.app_user.full_name, excluded.full_name);

  select * into existing from public.college_staff_profile where user_id = uid;

  if not found then
    insert into public.college_staff_profile (user_id, college_id, full_name, staff_source)
    values (uid, p_college, uname, 'self');
  elsif existing.registration_status = 'in_progress'
        and existing.status in ('pending_review', 'changes_requested')
        and existing.college_id is distinct from p_college then
    update public.college_staff_profile
      set college_id = p_college, updated_at = now()
    where user_id = uid;
  end if;
end;
$$;

grant execute on function public.register_as_college_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10b) invite_college_staff() — the ONLY way a College Admin creates an invite.
--
-- This function exists because of a specific hazard: createInvite
-- (app/dashboard/users/actions.ts:17-52) checks ONLY `user.invite` and then
-- trusts the role key in the request body. Granting user.invite to college_admin
-- so they could invite staff would therefore also let them invite an OWNER.
-- So they never get user.invite; they get college.staff.invite, and this
-- function hard-codes role = college_staff and forces the scope to the college
-- they are authorized for. The role and the scope are not caller-supplied.
-- ---------------------------------------------------------------------------
create or replace function public.invite_college_staff(
  p_email   text,
  p_college uuid,
  p_profile jsonb default '{}'::jsonb,
  p_ttl_days int  default 14
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_role_id uuid;
  v_id      uuid;
begin
  if not (public.has_global_permission('college.staff.invite')
          or public.has_college_permission('college.staff.invite', p_college)) then
    raise exception 'Forbidden: you cannot invite staff for this college';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' then
    raise exception 'A valid email is required';
  end if;
  if p_college is null or not exists (select 1 from public.college where id = p_college) then
    raise exception 'College not found';
  end if;

  select id into v_role_id from public.role where key = 'college_staff';
  if v_role_id is null then raise exception 'college_staff role not found'; end if;

  -- Already on the platform? Say so precisely — an invite would sit unconsumed.
  if exists (select 1 from public.app_user where lower(email) = v_email and status <> 'deleted') then
    raise exception 'That email already has an account. Use "Add existing user as staff" instead.';
  end if;
  -- invite_pending_email_uniq (002) allows one live invite per email.
  if exists (select 1 from public.invite where lower(email) = v_email and status = 'pending') then
    raise exception 'There is already a pending invite for this email.';
  end if;

  insert into public.invite (email, role_id, scope_college_id, invited_by, expires_at, staged_profile)
  values (
    v_email, v_role_id, p_college, auth.uid(),
    now() + make_interval(days => greatest(1, coalesce(p_ttl_days, 14))),
    -- college_id is NOT read from the staged profile at provisioning time (§9
    -- uses inv.scope_college_id), so a forged one in the payload is inert.
    coalesce(p_profile, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.invite_college_staff(text, uuid, jsonb, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 10c) set_college_staff_status() — the audited review action, and the thing
-- that actually grants or revokes access.
--
--   approved                              -> grant the scoped college_staff role
--   pending_review / changes_requested /
--   suspended / rejected                  -> revoke it
--
-- Authorization is scoped to the profile's own college, which is rule 1: a
-- college_admin of college B fails has_college_permission for a college-A row
-- and never reaches the update.
-- ---------------------------------------------------------------------------
create or replace function public.set_college_staff_status(
  p_user   uuid,
  p_status text,
  p_note   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college uuid;
  v_role_id uuid;
  v_actor   uuid := public.acting_user();
begin
  if p_status not in ('pending_review', 'changes_requested', 'approved', 'suspended', 'rejected') then
    raise exception 'invalid status %', p_status;
  end if;

  select college_id into v_college from public.college_staff_profile where user_id = p_user;
  if v_college is null then
    raise exception 'No college staff profile for that user';
  end if;

  if not (public.has_global_permission('college.staff.review')
          or public.has_college_permission('college.staff.review', v_college)) then
    raise exception 'Not authorized to review staff for this college';
  end if;

  select id into v_role_id from public.role where key = 'college_staff';

  if p_status = 'approved' then
    insert into public.user_role (user_id, role_id, scope_college_id)
    values (p_user, v_role_id, v_college)
    on conflict do nothing;
  else
    -- Anything other than approved means no access. Scoped to THIS college, so a
    -- (future) second grant for another college is untouched.
    delete from public.user_role
    where user_id = p_user and role_id = v_role_id and scope_college_id = v_college;
  end if;

  update public.college_staff_profile
    set status      = p_status,
        reviewed_by = v_actor,
        reviewed_at = now(),
        updated_at  = now()
  where user_id = p_user;

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.college_staff_review_note (staff_user_id, author_user_id, body, kind)
    values (
      p_user, v_actor, btrim(p_note),
      case
        when p_status = 'changes_requested' then 'changes_requested'
        when p_status = 'rejected'          then 'rejected'
        else 'note'
      end
    );
  end if;
end;
$$;

grant execute on function public.set_college_staff_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10d) mark_college_staff_resubmitted() — the staff member's side of a
-- send-back. Flips changes_requested back into the queue and resolves the open
-- notes, mirroring mark_registration_resubmitted (149/150). Called by the submit
-- endpoint; a no-op for any other state.
-- ---------------------------------------------------------------------------
create or replace function public.mark_college_staff_resubmitted()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  update public.college_staff_profile
    set status = 'pending_review', updated_at = now()
  where user_id = uid and status = 'changes_requested';

  update public.college_staff_review_note
    set resolved_at = now()
  where staff_user_id = uid and resolved_at is null;
end;
$$;

grant execute on function public.mark_college_staff_resubmitted() to authenticated;

-- ---------------------------------------------------------------------------
-- 10e) college_staff_recipients(p_college) — who gets the "awaiting approval"
-- email.
--
-- A SCOPED variant is required, not a reuse: notification_recipients()
-- (019:157-190) returns EVERY active college_admin regardless of scope
-- (:174, :185), so using it here would email every college's admin about one
-- college's staff — a direct violation of rule 1.
--
-- Returns: college_admins scoped to p_college, plus all UNSCOPED owners /
-- platform admins (so a college with no admin yet is still reviewable, #107
-- §7.6). Same active-address-then-account-email fallback as 019.
-- ---------------------------------------------------------------------------
create or replace function public.college_staff_recipients(p_college uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with recipients as (
    select distinct au.id, au.email
    from public.app_user au
    join public.user_role ur on ur.user_id = au.id
    join public.role r       on r.id = ur.role_id
    where au.status = 'active'
      and (
        (r.key = 'college_admin' and ur.scope_college_id = p_college)
        or (r.key in ('owner', 'platform_admin') and ur.scope_college_id is null)
      )
  )
  select coalesce(array_agg(distinct email), '{}')
  from (
    select lower(ne.email) as email
    from public.notification_email ne
    join recipients rc on rc.id = ne.user_id
    where ne.active

    union

    select lower(rc.email) as email
    from recipients rc
    where rc.email is not null
      and not exists (
        select 1 from public.notification_email ne2
        where ne2.user_id = rc.id and ne2.active
      )
  ) s
  where email is not null;
$$;

grant execute on function public.college_staff_recipients(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10f) set_college_staff() — platform-side direct grant/revoke for an EXISTING
-- user, mirroring set_college_admin (097). Gated on role.assign, which
-- college_admin does not hold — a college admin adds staff through the invite
-- and approval paths, not by assigning roles.
-- ---------------------------------------------------------------------------
create or replace function public.set_college_staff(
  p_user_id    uuid,
  p_college_id uuid,
  p_grant      boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_name    text;
begin
  if not public.has_permission('role.assign') then
    raise exception 'Forbidden: missing role.assign';
  end if;

  select id into v_role_id from public.role where key = 'college_staff';
  if v_role_id is null then raise exception 'college_staff role not found'; end if;
  if not exists (select 1 from public.college where id = p_college_id) then
    raise exception 'College not found';
  end if;

  if p_grant then
    if not exists (select 1 from public.app_user where id = p_user_id) then
      raise exception 'User is not provisioned yet — invite them first';
    end if;

    -- A staff grant with no profile row would be invisible in every roster, so
    -- seed one (approved: an admin assigning the role IS the approval).
    select full_name into v_name from public.app_user where id = p_user_id;
    insert into public.college_staff_profile
      (user_id, college_id, full_name, staff_source, status, reviewed_by, reviewed_at)
    values
      (p_user_id, p_college_id, v_name, 'invited', 'approved', public.acting_user(), now())
    on conflict (user_id) do nothing;

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (p_user_id, v_role_id, p_college_id)
    on conflict do nothing;
  else
    delete from public.user_role
    where user_id = p_user_id and role_id = v_role_id and scope_college_id = p_college_id;
  end if;
end;
$$;

grant execute on function public.set_college_staff(uuid, uuid, boolean) to authenticated;

commit;
