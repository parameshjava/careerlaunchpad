-- ============================================================================
-- 017_mentor_profile.sql
-- mentor_profile (1:1 with app_user, mirrors student_profile) + RLS, a status
-- guard trigger, and the self-registration / review RPCs.
--
-- The form is intentionally SHORT (3 light steps): who you are, where you
-- studied/work, what & how you can teach. It reuses the same ref_skill /
-- ref_career_goal sets students use, plus the mentor-only ref tables from 010,
-- so mentor<->student matching is possible later. graduation_year + college_id
-- carry the "passed-out alumnus of this college" linkage (requirement 4).
--
-- Lifecycle: registration_status (in_progress -> submitted) tracks form
-- completion like the student form; status (pending_review -> approved ->
-- suspended) is the VETTING state, changed only by a reviewer (enforced by the
-- guard trigger + set_mentor_status RPC, never by the mentor themselves).
-- Idempotent: IF NOT EXISTS / create-or-replace throughout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- mentor_profile
-- ---------------------------------------------------------------------------
create table if not exists public.mentor_profile (
  user_id              uuid primary key references public.app_user(id) on delete cascade,
  -- Step 1: identity (minimal)
  full_name            text,
  photo_url            text,
  phone                text,              -- private contact
  linkedin_url         text,
  bio                  text,
  -- Step 2: background. College affiliation drives same-college / alumni match.
  college_id           uuid references public.college(id),   -- nullable (external pros)
  graduation_year      int,                                  -- "passed out year"
  degree               text,                                 -- ref_degree slug
  branch               text,                                 -- ref_branch slug
  current_company      text,
  current_title        text,
  industry_id          uuid references public.ref_industry(id),
  years_experience     int,
  -- Step 3: the mentoring offer
  mentoring_area_ids   uuid[] not null default '{}',         -- ref_mentoring_area ids
  skills               text[] not null default '{}',         -- ref_skill slugs ("can teach")
  career_goal_ids      uuid[] not null default '{}',         -- ref_career_goal ids (can guide toward)
  mentor_mode_id       uuid references public.ref_mentor_mode(id),
  contribution_type_id uuid references public.ref_contribution_type(id),
  availability         text,                                 -- free text ("2 hrs / week")
  -- Provenance + lifecycle
  mentor_kind          text not null default 'professional'
                       check (mentor_kind in ('student_alumni', 'professional', 'staff')),
  status               text not null default 'pending_review'
                       check (status in ('pending_review', 'approved', 'suspended')),
  registration_status  text not null default 'in_progress'
                       check (registration_status in ('in_progress', 'submitted')),
  last_completed_step  int  not null default 0,
  registration_submitted_at timestamptz,
  reviewed_by          uuid references public.app_user(id),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists mentor_profile_college_idx on public.mentor_profile (college_id);
create index if not exists mentor_profile_status_idx  on public.mentor_profile (status);
create index if not exists mentor_profile_industry_idx on public.mentor_profile (industry_id);

-- ---------------------------------------------------------------------------
-- Status guard: only a reviewer may change `status`. Everyone else (including
-- the mentor editing their own row via RLS) silently keeps the old value, so
-- a mentor can never self-approve. On INSERT, non-reviewers are forced to
-- 'pending_review'. Reviewer = mentor.review (global) or college-scoped on the
-- row's college_id.
-- ---------------------------------------------------------------------------
create or replace function public.mentor_profile_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not (public.has_permission('mentor.review')
            or public.has_college_permission('mentor.review', new.college_id)) then
      new.status := 'pending_review';
    end if;
    return new;
  end if;

  -- UPDATE: gate the status column only.
  if new.status is distinct from old.status then
    if not (public.has_permission('mentor.review')
            or public.has_college_permission('mentor.review', old.college_id)) then
      new.status := old.status;   -- ignore unauthorized status change
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_profile_guard_biud on public.mentor_profile;
create trigger mentor_profile_guard_biud
  before insert or update on public.mentor_profile
  for each row execute function public.mentor_profile_guard();

-- ---------------------------------------------------------------------------
-- RLS — mirrors student_profile: self-manage; platform reviewers read/update
-- all; college admins read (and, where granted, review) their own college's
-- mentors.
-- ---------------------------------------------------------------------------
alter table public.mentor_profile enable row level security;

drop policy if exists mentor_profile_self on public.mentor_profile;
create policy mentor_profile_self on public.mentor_profile
  for all to authenticated
  using (user_id = auth.uid() and public.has_permission('mentor.profile.manage_own'))
  with check (user_id = auth.uid() and public.has_permission('mentor.profile.manage_own'));

drop policy if exists mentor_profile_admin_read on public.mentor_profile;
create policy mentor_profile_admin_read on public.mentor_profile
  for select to authenticated
  using (public.has_permission('user.manage'));

drop policy if exists mentor_profile_admin_update on public.mentor_profile;
create policy mentor_profile_admin_update on public.mentor_profile
  for update to authenticated
  using (public.has_permission('mentor.review'))
  with check (public.has_permission('mentor.review'));

drop policy if exists mentor_profile_college_read on public.mentor_profile;
create policy mentor_profile_college_read on public.mentor_profile
  for select to authenticated
  using (public.has_college_permission('college.students.view', college_id));

drop policy if exists mentor_profile_college_update on public.mentor_profile;
create policy mentor_profile_college_update on public.mentor_profile
  for update to authenticated
  using (public.has_college_permission('mentor.review', college_id))
  with check (public.has_college_permission('mentor.review', college_id));

-- ---------------------------------------------------------------------------
-- register_as_mentor() — on-demand, ADDITIVE self-registration as a mentor.
-- Unlike register_as_student() (which no-ops if you already have a role to
-- prevent self-promotion), this is meant to be layered on:
--   * no role  -> external professional (mentor_kind = 'professional')
--   * student  -> alumnus/placed student (mentor_kind = 'student_alumni')
--   * owner / platform_admin -> staff mentor (mentor_kind = 'staff')
-- It REFUSES employer / college_admin / support-only accounts (they can't
-- self-add mentor) and never removes any existing role. The mentor_profile is
-- pre-filled from student_profile when one exists, so an alumnus finishes in
-- seconds. The guard trigger pins status to 'pending_review'.
-- ---------------------------------------------------------------------------
create or replace function public.register_as_mentor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  uemail     text;
  uname      text;
  v_kind     text;
  has_student boolean;
  has_staff   boolean;
  has_any     boolean;
  sp         public.student_profile%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Already a mentor => no-op (idempotent).
  if exists (
    select 1 from public.user_role ur join public.role r on r.id = ur.role_id
    where ur.user_id = uid and r.key = 'mentor'
  ) then
    return;
  end if;

  select exists (
    select 1 from public.user_role ur join public.role r on r.id = ur.role_id
    where ur.user_id = uid and r.key = 'student') into has_student;
  select exists (
    select 1 from public.user_role ur join public.role r on r.id = ur.role_id
    where ur.user_id = uid and r.key in ('owner', 'platform_admin')) into has_staff;
  select exists (select 1 from public.user_role where user_id = uid) into has_any;

  -- Allowlist: unprovisioned (external pro), student, or owner/admin staff.
  if has_any and not (has_student or has_staff) then
    raise exception 'This account type cannot self-register as a mentor';
  end if;

  v_kind := case
    when has_student then 'student_alumni'
    when has_staff   then 'staff'
    else 'professional'
  end;

  select email,
         coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
    into uemail, uname
  from auth.users where id = uid;

  insert into public.app_user (id, email)
  values (uid, uemail)
  on conflict (id) do nothing;

  insert into public.user_role (user_id, role_id)
  select uid, r.id from public.role r where r.key = 'mentor'
  on conflict do nothing;

  -- Seed the mentor profile, pre-filling from the student profile if present.
  select * into sp from public.student_profile where user_id = uid;
  insert into public.mentor_profile (
    user_id, full_name, phone, college_id, graduation_year, degree, branch,
    skills, career_goal_ids, mentor_kind, status
  ) values (
    uid,
    coalesce(sp.full_name, uname),
    sp.phone, sp.college_id, sp.graduation_year, sp.degree, sp.branch,
    coalesce(sp.skills, '{}'), coalesce(sp.career_goal_ids, '{}'),
    v_kind, 'pending_review'
  )
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.register_as_mentor() to authenticated;

-- ---------------------------------------------------------------------------
-- set_mentor_status(target, status) — the audited review action. Checks the
-- caller holds mentor.review (global) or college-scoped on the target's
-- college, then sets status + reviewer bookkeeping. SECURITY DEFINER so it can
-- stamp reviewed_by even though that column isn't otherwise writable by RLS.
-- ---------------------------------------------------------------------------
create or replace function public.set_mentor_status(p_user uuid, p_status text)
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

  select college_id into v_college from public.mentor_profile where user_id = p_user;

  if not (public.has_permission('mentor.review')
          or public.has_college_permission('mentor.review', v_college)) then
    raise exception 'not authorized to review mentors';
  end if;

  update public.mentor_profile
    set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where user_id = p_user;
end;
$$;

grant execute on function public.set_mentor_status(uuid, text) to authenticated;
