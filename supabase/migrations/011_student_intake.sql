-- ============================================================================
-- 011_student_intake.sql
-- Admin Excel intake (docs/REGISTRATION_AND_INTAKE_API.md).
--
-- Bulk-imported students have no account yet, and student_profile.user_id is a
-- PK FK to app_user(id) — so imported rows cannot live in student_profile. They
-- live in `student_intake`, keyed by email, mirroring the registration model
-- column-for-column (every field nullable → partial rows allowed). When the
-- invited student signs in, handle_new_user (extended below) MERGES the matching
-- intake row into their new student_profile, so "edit later" is just the normal
-- registration form running over an already-populated profile.
--
-- Who can import: Owner (*), CareerLaunchpad Admin (platform_admin), Support, and
-- College Admin (scoped to their own college) — via student.intake.import.
-- Import auto-issues an individual student invite per row; because invite INSERT
-- normally requires user.invite (which Support/College Admin lack), the upsert +
-- invite run inside a SECURITY DEFINER function that checks the import permission
-- internally (the codebase's pattern for privileged cross-table writes).
-- Idempotent: IF NOT EXISTS / ON CONFLICT throughout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- student_intake — staging for imported students (keyed by email)
-- ---------------------------------------------------------------------------
create table if not exists public.student_intake (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,                       -- reconciliation key
  college_id    uuid references public.college(id),  -- admin-chosen college
  -- mirror of the registration fields (all nullable; partial allowed)
  full_name     text,
  phone         text,
  gender        text,
  city_village  text,
  district      text,
  state         text,
  degree        text,
  branch        text,
  year_of_study text,
  graduation_year int,
  cgpa          numeric(4,2),
  career_goal_ids        uuid[] not null default '{}',
  primary_career_goal_id uuid references public.ref_career_goal(id),
  skill_assessment jsonb not null default '{}',
  skills        text[] not null default '{}',
  interests     text[] not null default '{}',
  preferred_mentor_pref_id uuid references public.ref_mentor_preference(id),
  biggest_challenge text,
  -- import bookkeeping
  source         text not null default 'excel_import',
  import_batch_id uuid,                               -- groups one upload
  status         text not null default 'pending'
                 check (status in ('pending', 'invited', 'claimed')),
  invite_id      uuid references public.invite(id),
  created_by     uuid references public.app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One intake row per email (case-insensitive). Expression uniqueness needs an
-- index (not a table constraint); ON CONFLICT (lower(email)) targets it.
create unique index if not exists student_intake_email_uniq
  on public.student_intake (lower(email));
create index if not exists student_intake_college_idx on public.student_intake (college_id);
create index if not exists student_intake_status_idx  on public.student_intake (status);

-- ---------------------------------------------------------------------------
-- Role: platform_admin ("CareerLaunchpad Admin") — platform staff who run the
-- console day-to-day. Broad management powers (invite/manage users, manage
-- colleges, view analytics, search/view students, bulk-import) but NOT the
-- owner-only '*' wildcard or role.manage. A console role (routes to /dashboard).
-- Seeded here (the last migration) so its full permission bundle — which spans
-- permissions defined in 007, 009 and this file — can be granted in one place.
-- ---------------------------------------------------------------------------
insert into public.role (key, name, description, is_system) values
  ('platform_admin', 'CareerLaunchpad Admin',
   'Platform staff: manage users, colleges, analytics and student intake (not roles/wildcard).', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Permission: student.intake.import — granted to owner(*) plus platform_admin,
-- support, and college_admin (the last is scoped to its own college via RLS).
-- ---------------------------------------------------------------------------
insert into public.permission (key, description) values
  ('student.intake.import', 'Bulk-import students from an Excel file and invite them.')
on conflict (key) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on p.key = 'student.intake.import'
where r.key in ('platform_admin', 'support', 'college_admin')
on conflict do nothing;

-- platform_admin's broader bundle (all keys are defined by 007/009/011).
insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r
join public.permission p on p.key in (
  'user.invite', 'user.manage', 'user.view', 'user.suspend', 'invite.resend',
  'college.manage', 'analytics.platform.view',
  'student.profile.search', 'student.profile.view', 'student.intake.import'
)
where r.key = 'platform_admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS: import permission (unscoped for owner/support) OR college-scoped admin.
-- Writes from the API go through import_student_intake() below, but these
-- policies also let an admin read/correct staged rows via the console.
-- ---------------------------------------------------------------------------
alter table public.student_intake enable row level security;

drop policy if exists student_intake_read on public.student_intake;
create policy student_intake_read on public.student_intake
  for select to authenticated
  using (
    public.has_permission('student.intake.import')
    or public.has_college_permission('student.intake.import', college_id)
  );

drop policy if exists student_intake_write on public.student_intake;
create policy student_intake_write on public.student_intake
  for all to authenticated
  using (
    public.has_permission('student.intake.import')
    or public.has_college_permission('student.intake.import', college_id)
  )
  with check (
    public.has_permission('student.intake.import')
    or public.has_college_permission('student.intake.import', college_id)
  );

-- ---------------------------------------------------------------------------
-- import_student_intake(p_college_id, p_rows) — upsert staged rows + auto-invite
-- p_rows is a jsonb array of NORMALIZED rows (the API resolves ref labels ->
-- slugs/ids first). Each row: { row, email, full_name, phone, gender,
-- city_village, district, state, degree, branch, year_of_study, graduation_year,
-- cgpa, career_goal_ids:[uuid], primary_career_goal_id, skill_assessment:{},
-- skills:[slug], interests:[slug], preferred_mentor_pref_id, biggest_challenge }.
-- Returns a per-row report + the emails that received a NEW invite (so the API
-- can send those emails via lib/mailer).
-- ---------------------------------------------------------------------------
create or replace function public.import_student_intake(p_college_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r            jsonb;
  v_email      text;
  v_batch      uuid := gen_random_uuid();
  v_existed    boolean;
  v_student_role uuid;
  v_invite_id  uuid;
  v_has_pending boolean;
  out_rows     jsonb := '[]'::jsonb;
  new_emails   jsonb := '[]'::jsonb;
  n_created    int := 0;
  n_updated    int := 0;
  n_invited    int := 0;
  n_invite_skip int := 0;
  v_result     text;
  v_invite     text;
begin
  if not (public.has_permission('student.intake.import')
          or public.has_college_permission('student.intake.import', p_college_id)) then
    raise exception 'not authorized to import students for this college';
  end if;

  select id into v_student_role from public.role where key = 'student';

  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_email := lower(nullif(trim(r->>'email'), ''));

    if v_email is null then
      out_rows := out_rows || jsonb_build_object(
        'row', r->'row', 'email', null, 'result', 'error',
        'errors', jsonb_build_array('email required'), 'invite', 'none');
      continue;
    end if;

    select exists(select 1 from public.student_intake where lower(email) = v_email)
      into v_existed;

    insert into public.student_intake as si (
      email, college_id, full_name, phone, gender, city_village, district, state,
      degree, branch, year_of_study, graduation_year, cgpa,
      career_goal_ids, primary_career_goal_id, skill_assessment, skills, interests,
      preferred_mentor_pref_id, biggest_challenge, source, import_batch_id, created_by
    ) values (
      v_email, p_college_id,
      nullif(r->>'full_name', ''), nullif(r->>'phone', ''), nullif(r->>'gender', ''),
      nullif(r->>'city_village', ''), nullif(r->>'district', ''), nullif(r->>'state', ''),
      nullif(r->>'degree', ''), nullif(r->>'branch', ''), nullif(r->>'year_of_study', ''),
      (nullif(r->>'graduation_year', ''))::int, (nullif(r->>'cgpa', ''))::numeric,
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(r->'career_goal_ids', '[]'::jsonb)) x), '{}'),
      (nullif(r->>'primary_career_goal_id', ''))::uuid,
      coalesce(r->'skill_assessment', '{}'::jsonb),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'skills', '[]'::jsonb)) x), '{}'),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'interests', '[]'::jsonb)) x), '{}'),
      (nullif(r->>'preferred_mentor_pref_id', ''))::uuid,
      nullif(r->>'biggest_challenge', ''),
      'excel_import', v_batch, auth.uid()
    )
    on conflict (lower(email)) do update set
      -- merge: keep the existing value when the imported cell is blank
      college_id    = coalesce(excluded.college_id, si.college_id),
      full_name     = coalesce(excluded.full_name, si.full_name),
      phone         = coalesce(excluded.phone, si.phone),
      gender        = coalesce(excluded.gender, si.gender),
      city_village  = coalesce(excluded.city_village, si.city_village),
      district      = coalesce(excluded.district, si.district),
      state         = coalesce(excluded.state, si.state),
      degree        = coalesce(excluded.degree, si.degree),
      branch        = coalesce(excluded.branch, si.branch),
      year_of_study = coalesce(excluded.year_of_study, si.year_of_study),
      graduation_year = coalesce(excluded.graduation_year, si.graduation_year),
      cgpa          = coalesce(excluded.cgpa, si.cgpa),
      career_goal_ids = case when excluded.career_goal_ids = '{}' then si.career_goal_ids else excluded.career_goal_ids end,
      primary_career_goal_id = coalesce(excluded.primary_career_goal_id, si.primary_career_goal_id),
      skill_assessment = case when excluded.skill_assessment = '{}'::jsonb then si.skill_assessment else excluded.skill_assessment end,
      skills        = case when excluded.skills = '{}' then si.skills else excluded.skills end,
      interests     = case when excluded.interests = '{}' then si.interests else excluded.interests end,
      preferred_mentor_pref_id = coalesce(excluded.preferred_mentor_pref_id, si.preferred_mentor_pref_id),
      biggest_challenge = coalesce(excluded.biggest_challenge, si.biggest_challenge),
      import_batch_id = v_batch,
      updated_at    = now();

    if v_existed then
      v_result := 'updated'; n_updated := n_updated + 1;
    else
      v_result := 'created'; n_created := n_created + 1;
    end if;

    -- Auto-invite: one student invite per email (scoped to the college), unless
    -- the email already has a live pending invite or a consumed one (already a user).
    select exists(
      select 1 from public.invite
      where lower(email) = v_email and status = 'pending'
    ) into v_has_pending;

    if v_has_pending then
      v_invite := 'already_pending';
      n_invite_skip := n_invite_skip + 1;
    elsif exists (select 1 from public.app_user where lower(email) = v_email) then
      v_invite := 'already_user';
      n_invite_skip := n_invite_skip + 1;
    else
      insert into public.invite (email, role_id, scope_college_id, invited_by, expires_at)
      values (v_email, v_student_role, p_college_id, auth.uid(), now() + interval '14 days')
      returning id into v_invite_id;

      update public.student_intake
        set status = 'invited', invite_id = v_invite_id
        where lower(email) = v_email;

      v_invite := 'sent';
      n_invited := n_invited + 1;
      new_emails := new_emails || to_jsonb(v_email);
    end if;

    out_rows := out_rows || jsonb_build_object(
      'row', r->'row', 'email', v_email, 'result', v_result, 'invite', v_invite);
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch,
    'created', n_created, 'updated', n_updated,
    'invited', n_invited, 'invite_skipped', n_invite_skip,
    'rows', out_rows,
    'new_invite_emails', new_emails
  );
end;
$$;

grant execute on function public.import_student_intake(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Re-declares handle_new_user (from 005) with TWO changes:
--   1. SELF-REGISTRATION — when no invite matches, instead of denying we
--      provision the user as a Student by default. This is the open student
--      sign-up path: anyone who signs in without an invite becomes a student
--      and picks their college in the registration form (college stays null).
--      All OTHER roles (college_admin/employer/support/platform_admin) remain
--      invite-only — they are only assigned when a matching invite exists.
--   2. INTAKE MERGE — after creating the student stub profile, merge any
--      matching student_intake row into it (Excel-imported students) and mark
--      the intake 'claimed'.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  has_invite boolean;
  v_role_key text;
  v_role_id uuid;
  v_scope_college uuid;
  v_employer uuid;
  v_profile_college uuid;
  intk public.student_intake%rowtype;
  v_step int := 0;
begin
  -- Look for a live invite for this verified email (case-insensitive).
  select * into inv
  from public.invite
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;
  has_invite := found;

  if has_invite then
    select key into v_role_key from public.role where id = inv.role_id;
    v_role_id       := inv.role_id;
    v_employer      := inv.employer_id;
    v_scope_college := case when v_role_key = 'college_admin' then inv.scope_college_id else null end;
    v_profile_college := inv.scope_college_id;   -- seeds the invited student's college
  else
    -- No invite => open self-registration as a Student (other roles need an invite).
    v_role_key      := 'student';
    select id into v_role_id from public.role where key = 'student';
    v_employer      := null;
    v_scope_college := null;
    v_profile_college := null;                   -- student chooses college in the form
  end if;

  insert into public.app_user (id, email, employer_id)
  values (new.id, new.email, v_employer)
  on conflict (id) do update set employer_id = excluded.employer_id;

  insert into public.user_role (user_id, role_id, scope_college_id)
  values (new.id, v_role_id, v_scope_college)
  on conflict do nothing;

  if v_role_key = 'student' then
    insert into public.student_profile (user_id, college_id, full_name)
    values (new.id, v_profile_college, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
    on conflict (user_id) do nothing;

    -- Merge any imported intake for this email into the new profile, so the
    -- student edits pre-filled data later via the registration form.
    select * into intk from public.student_intake where lower(email) = lower(new.email);
    if found then
      update public.student_profile sp set
        full_name     = coalesce(intk.full_name, sp.full_name),
        phone         = coalesce(intk.phone, sp.phone),
        gender        = coalesce(intk.gender, sp.gender),
        city_village  = coalesce(intk.city_village, sp.city_village),
        district      = coalesce(intk.district, sp.district),
        state         = coalesce(intk.state, sp.state),
        college_id    = coalesce(intk.college_id, sp.college_id),
        degree        = coalesce(intk.degree, sp.degree),
        branch        = coalesce(intk.branch, sp.branch),
        year_of_study = coalesce(intk.year_of_study, sp.year_of_study),
        graduation_year = coalesce(intk.graduation_year, sp.graduation_year),
        cgpa          = coalesce(intk.cgpa, sp.cgpa),
        career_goal_ids = case when intk.career_goal_ids = '{}' then sp.career_goal_ids else intk.career_goal_ids end,
        primary_career_goal_id = coalesce(intk.primary_career_goal_id, sp.primary_career_goal_id),
        skill_assessment = case when intk.skill_assessment = '{}'::jsonb then sp.skill_assessment else intk.skill_assessment end,
        skills        = case when intk.skills = '{}' then sp.skills else intk.skills end,
        interests     = case when intk.interests = '{}' then sp.interests else intk.interests end,
        preferred_mentor_pref_id = coalesce(intk.preferred_mentor_pref_id, sp.preferred_mentor_pref_id),
        biggest_challenge = coalesce(intk.biggest_challenge, sp.biggest_challenge),
        updated_at    = now()
      where sp.user_id = new.id;

      -- Pre-set the resume point: leading consecutive completed steps.
      if intk.full_name is not null and intk.phone is not null then
        v_step := 1;
        if intk.college_id is not null then
          v_step := 2;
          if array_length(intk.career_goal_ids, 1) >= 1 and intk.primary_career_goal_id is not null then
            v_step := 3;
            if intk.skill_assessment <> '{}'::jsonb then
              v_step := 4;
              if array_length(intk.skills, 1) >= 1 or array_length(intk.interests, 1) >= 1 then
                v_step := 5;
                if intk.preferred_mentor_pref_id is not null or intk.biggest_challenge is not null then
                  v_step := 6;
                end if;
              end if;
            end if;
          end if;
        end if;
      end if;
      update public.student_profile set last_completed_step = v_step where user_id = new.id;

      update public.student_intake set status = 'claimed', updated_at = now()
      where lower(email) = lower(new.email);
    end if;
  end if;

  -- Consume the invite (self-registered users have none).
  if has_invite then
    update public.invite
    set status = 'consumed', consumed_at = now()
    where id = inv.id;
  end if;

  return new;
end;
$$;
