-- ============================================================================
-- 106_student_roll_number.sql
-- Roll number through the student import pipeline, end to end:
--   1. roll_number columns on student_intake + student_profile.
--   2. import_student_intake() accepts/merges roll_number (otherwise the 011
--      version unchanged).
--   3. merge_student_intake(): the intake→profile merge from 011's
--      handle_new_user, extracted into a helper — 096 rewrote handle_new_user
--      for multi-invite consumption and DROPPED this merge, so Excel-imported
--      data (name, phone, college, …) stopped reaching new student profiles.
--      Restored here (with roll_number included) and called from both
--      handle_new_user() and consume_pending_invites().
-- Idempotent.
-- ============================================================================

-- 1) Columns -------------------------------------------------------------------
alter table public.student_intake  add column if not exists roll_number text;
alter table public.student_profile add column if not exists roll_number text;

-- 2) import_student_intake — + roll_number -------------------------------------
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
      email, college_id, full_name, roll_number, phone, gender, city_village, district, state,
      degree, branch, year_of_study, graduation_year, cgpa,
      career_goal_ids, primary_career_goal_id, skill_assessment, skills, interests,
      preferred_mentor_pref_id, biggest_challenge, source, import_batch_id, created_by
    ) values (
      v_email, p_college_id,
      nullif(r->>'full_name', ''), nullif(r->>'roll_number', ''), nullif(r->>'phone', ''),
      nullif(r->>'gender', ''),
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
      roll_number   = coalesce(excluded.roll_number, si.roll_number),
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

-- 3) The intake→profile merge, restored as a helper -----------------------------
create or replace function public.merge_student_intake(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  intk public.student_intake%rowtype;
  v_step int := 0;
begin
  select * into intk from public.student_intake where lower(email) = lower(p_email);
  if not found then return; end if;

  update public.student_profile sp set
    full_name     = coalesce(intk.full_name, sp.full_name),
    roll_number   = coalesce(intk.roll_number, sp.roll_number),
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
  where sp.user_id = p_user_id;

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
  update public.student_profile set last_completed_step = v_step where user_id = p_user_id;

  update public.student_intake set status = 'claimed', updated_at = now()
  where lower(email) = lower(p_email);
end;
$$;

-- 4) handle_new_user — 096 multi-invite version + the restored intake merge -----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invite%rowtype;
  rk  text;
begin
  for inv in
    select * from public.invite
    where lower(email) = lower(new.email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id)
    values (new.id, new.email, inv.employer_id)
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (new.id, inv.role_id,
            case when rk = 'college_admin' then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (new.id, inv.scope_college_id,
              coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
      on conflict (user_id) do nothing;
      perform public.merge_student_intake(new.id, new.email);
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;

  return new;  -- no invite → nothing granted → user stays unprovisioned (denied)
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) consume_pending_invites — same restoration --------------------------------
create or replace function public.consume_pending_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_email text;
  inv public.invite%rowtype;
  rk  text;
begin
  if uid is null then return; end if;
  select email into v_email from auth.users where id = uid;
  if v_email is null then return; end if;

  for inv in
    select * from public.invite
    where lower(email) = lower(v_email)
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    order by created_at asc
  loop
    select key into rk from public.role where id = inv.role_id;

    insert into public.app_user (id, email, employer_id)
    values (uid, v_email, inv.employer_id)
    on conflict (id) do update
      set employer_id = coalesce(public.app_user.employer_id, excluded.employer_id);

    insert into public.user_role (user_id, role_id, scope_college_id)
    values (uid, inv.role_id,
            case when rk = 'college_admin' then inv.scope_college_id else null end)
    on conflict do nothing;

    if rk = 'student' then
      insert into public.student_profile (user_id, college_id, full_name)
      values (uid, inv.scope_college_id, null)
      on conflict (user_id) do nothing;
      perform public.merge_student_intake(uid, v_email);
    end if;

    update public.invite set status = 'consumed', consumed_at = now() where id = inv.id;
  end loop;
end;
$$;

grant execute on function public.consume_pending_invites() to authenticated;
