-- ============================================================================
-- 133_intake_tell_us.sql
-- Bring the admin Excel intake pipeline in line with the current registration
-- form. Step 3 "Career Paths" (preferred_category_slugs) already threads through
-- intake (migrations 120/124); this adds the straightforward Step 6 "Tell Us"
-- fields so a bulk-imported student arrives with them pre-filled:
--   is_first_generation, date_of_birth, languages, caste_certificate_status,
--   reservation_category, income_band, hobbies.
-- (Deferred, per product: family_members — nested jsonb — and custom_hobbies —
--  free-text write-ins. Students can add those later in the form.)
--
-- Same threading pattern as 106/120/124:
--   1. columns on student_intake (student_profile already has them from 121).
--   2. import_student_intake() insert + on-conflict merge (rebased on 124).
--   3. merge_student_intake() intake→profile merge (rebased on 124).
-- The legacy career_goal_ids / primary_career_goal_id / preferred_mentor_pref_id
-- columns are retained untouched (the template simply stops collecting them).
-- Idempotent: IF NOT EXISTS columns; CREATE OR REPLACE functions.
-- ============================================================================

-- 1) Columns (student_profile already has these from 121_tell_us_step) ---------
alter table public.student_intake
  add column if not exists is_first_generation      boolean,
  add column if not exists date_of_birth            date,
  add column if not exists languages                text[] not null default '{}',
  add column if not exists caste_certificate_status text,
  add column if not exists reservation_category     text,
  add column if not exists income_band              text,
  add column if not exists hobbies                  text[] not null default '{}';

-- 2) import_student_intake — + Step 6 "Tell Us" fields ------------------------
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

    select exists(select 1 from public.student_intake where lower(email) = v_email) into v_existed;

    insert into public.student_intake as si (
      email, college_id, full_name, roll_number, registration_number, apaar_id, phone, gender, city_village, district, state,
      degree, branch, year_of_study, graduation_year, cgpa,
      preferred_category_slugs,
      career_goal_ids, primary_career_goal_id, skill_assessment, skills, interests,
      preferred_mentor_pref_id, biggest_challenge,
      is_first_generation, date_of_birth, languages, caste_certificate_status,
      reservation_category, income_band, hobbies,
      source, import_batch_id, created_by
    ) values (
      v_email, p_college_id,
      nullif(r->>'full_name', ''), nullif(r->>'roll_number', ''),
      nullif(r->>'registration_number', ''), nullif(r->>'apaar_id', ''), nullif(r->>'phone', ''),
      nullif(r->>'gender', ''),
      nullif(r->>'city_village', ''), nullif(r->>'district', ''), nullif(r->>'state', ''),
      nullif(r->>'degree', ''), nullif(r->>'branch', ''), nullif(r->>'year_of_study', ''),
      (nullif(r->>'graduation_year', ''))::int, (nullif(r->>'cgpa', ''))::numeric,
      -- Cap Career Paths at 2 here (not just in the Excel normalizer) so the
      -- single-student intake caller is also safe — student_profile enforces a
      -- max-2 CHECK, and an over-cap array would abort the claim-time merge.
      (coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'preferred_category_slugs', '[]'::jsonb)) x), '{}'))[1:2],
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(r->'career_goal_ids', '[]'::jsonb)) x), '{}'),
      (nullif(r->>'primary_career_goal_id', ''))::uuid,
      coalesce(r->'skill_assessment', '{}'::jsonb),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'skills', '[]'::jsonb)) x), '{}'),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'interests', '[]'::jsonb)) x), '{}'),
      (nullif(r->>'preferred_mentor_pref_id', ''))::uuid,
      nullif(r->>'biggest_challenge', ''),
      (nullif(r->>'is_first_generation', ''))::boolean,
      (nullif(r->>'date_of_birth', ''))::date,
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'languages', '[]'::jsonb)) x), '{}'),
      nullif(r->>'caste_certificate_status', ''),
      nullif(r->>'reservation_category', ''),
      nullif(r->>'income_band', ''),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'hobbies', '[]'::jsonb)) x), '{}'),
      'excel_import', v_batch, auth.uid()
    )
    on conflict (lower(email)) do update set
      college_id    = coalesce(excluded.college_id, si.college_id),
      full_name     = coalesce(excluded.full_name, si.full_name),
      roll_number   = coalesce(excluded.roll_number, si.roll_number),
      registration_number = coalesce(excluded.registration_number, si.registration_number),
      apaar_id      = coalesce(excluded.apaar_id, si.apaar_id),
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
      preferred_category_slugs = case when excluded.preferred_category_slugs = '{}' then si.preferred_category_slugs else excluded.preferred_category_slugs end,
      career_goal_ids = case when excluded.career_goal_ids = '{}' then si.career_goal_ids else excluded.career_goal_ids end,
      primary_career_goal_id = coalesce(excluded.primary_career_goal_id, si.primary_career_goal_id),
      skill_assessment = case when excluded.skill_assessment = '{}'::jsonb then si.skill_assessment else excluded.skill_assessment end,
      skills        = case when excluded.skills = '{}' then si.skills else excluded.skills end,
      interests     = case when excluded.interests = '{}' then si.interests else excluded.interests end,
      preferred_mentor_pref_id = coalesce(excluded.preferred_mentor_pref_id, si.preferred_mentor_pref_id),
      biggest_challenge = coalesce(excluded.biggest_challenge, si.biggest_challenge),
      is_first_generation = coalesce(excluded.is_first_generation, si.is_first_generation),
      date_of_birth = coalesce(excluded.date_of_birth, si.date_of_birth),
      languages     = case when excluded.languages = '{}' then si.languages else excluded.languages end,
      caste_certificate_status = coalesce(excluded.caste_certificate_status, si.caste_certificate_status),
      reservation_category = coalesce(excluded.reservation_category, si.reservation_category),
      income_band   = coalesce(excluded.income_band, si.income_band),
      hobbies       = case when excluded.hobbies = '{}' then si.hobbies else excluded.hobbies end,
      import_batch_id = v_batch,
      updated_at    = now();

    if v_existed then v_result := 'updated'; n_updated := n_updated + 1;
    else v_result := 'created'; n_created := n_created + 1; end if;

    select exists(select 1 from public.invite where lower(email) = v_email and status = 'pending') into v_has_pending;
    if v_has_pending then
      v_invite := 'already_pending'; n_invite_skip := n_invite_skip + 1;
    elsif exists (select 1 from public.app_user where lower(email) = v_email) then
      v_invite := 'already_user'; n_invite_skip := n_invite_skip + 1;
    else
      insert into public.invite (email, role_id, scope_college_id, invited_by, expires_at)
      values (v_email, v_student_role, p_college_id, auth.uid(), now() + interval '14 days')
      returning id into v_invite_id;
      update public.student_intake set status = 'invited', invite_id = v_invite_id where lower(email) = v_email;
      v_invite := 'sent'; n_invited := n_invited + 1; new_emails := new_emails || to_jsonb(v_email);
    end if;

    out_rows := out_rows || jsonb_build_object('row', r->'row', 'email', v_email, 'result', v_result, 'invite', v_invite);
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch, 'created', n_created, 'updated', n_updated,
    'invited', n_invited, 'invite_skipped', n_invite_skip,
    'rows', out_rows, 'new_invite_emails', new_emails);
end;
$$;
grant execute on function public.import_student_intake(uuid, jsonb) to authenticated;

-- 3) merge_student_intake — + Step 6 "Tell Us" fields -------------------------
create or replace function public.merge_student_intake(p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare intk public.student_intake%rowtype; v_step int := 0;
begin
  select * into intk from public.student_intake where lower(email) = lower(p_email);
  if not found then return; end if;

  update public.student_profile sp set
    full_name     = coalesce(intk.full_name, sp.full_name),
    roll_number   = coalesce(intk.roll_number, sp.roll_number),
    registration_number = coalesce(intk.registration_number, sp.registration_number),
    apaar_id      = coalesce(intk.apaar_id, sp.apaar_id),
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
    -- Clamp to 2 (student_profile.preferred_category_slugs has a max-2 CHECK) so
    -- a legacy/over-cap intake row can't abort the merge and lock the student out.
    preferred_category_slugs = case when intk.preferred_category_slugs = '{}' then sp.preferred_category_slugs else intk.preferred_category_slugs[1:2] end,
    career_goal_ids = case when intk.career_goal_ids = '{}' then sp.career_goal_ids else intk.career_goal_ids end,
    primary_career_goal_id = coalesce(intk.primary_career_goal_id, sp.primary_career_goal_id),
    skill_assessment = case when intk.skill_assessment = '{}'::jsonb then sp.skill_assessment else intk.skill_assessment end,
    skills        = case when intk.skills = '{}' then sp.skills else intk.skills end,
    interests     = case when intk.interests = '{}' then sp.interests else intk.interests end,
    preferred_mentor_pref_id = coalesce(intk.preferred_mentor_pref_id, sp.preferred_mentor_pref_id),
    biggest_challenge = coalesce(intk.biggest_challenge, sp.biggest_challenge),
    is_first_generation = coalesce(intk.is_first_generation, sp.is_first_generation),
    date_of_birth = coalesce(intk.date_of_birth, sp.date_of_birth),
    languages     = case when intk.languages = '{}' then sp.languages else intk.languages end,
    caste_certificate_status = coalesce(intk.caste_certificate_status, sp.caste_certificate_status),
    reservation_category = coalesce(intk.reservation_category, sp.reservation_category),
    income_band   = coalesce(intk.income_band, sp.income_band),
    hobbies       = case when intk.hobbies = '{}' then sp.hobbies else intk.hobbies end,
    updated_at    = now()
  where sp.user_id = p_user_id;

  -- Resume point: leading consecutive completed steps (Step 3 = preference categories).
  if intk.full_name is not null and intk.phone is not null then
    v_step := 1;
    if intk.college_id is not null then
      v_step := 2;
      if array_length(intk.preferred_category_slugs, 1) >= 1 then
        v_step := 3;
        if intk.skill_assessment <> '{}'::jsonb then
          v_step := 4;
          if array_length(intk.skills, 1) >= 1 or array_length(intk.interests, 1) >= 1 then
            v_step := 5;
            -- Step 6 "Tell Us" — any of the imported optional fields counts.
            -- (preferred_mentor_pref_id is retained from the legacy Step 6 so an
            -- intake row from an older import isn't regressed from 6 back to 5.)
            if intk.biggest_challenge is not null
               or intk.preferred_mentor_pref_id is not null
               or intk.is_first_generation is not null
               or intk.date_of_birth is not null
               or array_length(intk.languages, 1) >= 1
               or intk.caste_certificate_status is not null
               or intk.reservation_category is not null
               or intk.income_band is not null
               or array_length(intk.hobbies, 1) >= 1 then
              v_step := 6;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  update public.student_profile set last_completed_step = v_step where user_id = p_user_id;

  update public.student_intake set status = 'claimed', updated_at = now() where lower(email) = lower(p_email);
end;
$$;
