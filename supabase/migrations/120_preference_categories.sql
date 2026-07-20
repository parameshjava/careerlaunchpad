-- ============================================================================
-- 120_preference_categories.sql   (issue #42)
-- Career Aspirations (registration Step 3) becomes a PREFERENCE-CATEGORY picker:
-- the student picks up to 2 categories; each category lists the exams it covers
-- and yields consolidated coaching (a set of ref_skill competencies grouped by
-- domain). Enrolling in a specific exam is a later, in-product action.
--
-- Adds: ref_preference_category, ref_exam, ref_preference_category_skill;
-- populates ref_skill.category (competency domain) + expands the skill seed;
-- student_profile.preferred_category_slugs text[] (capped at 2 by CHECK).
-- Old ref_career_goal + career_goal_ids/primary_career_goal_id are left intact
-- (grandfathered) — the new Step 3 simply stops writing them.
-- Idempotent.
-- ============================================================================

-- 1. Competency-domain skills (ref_skill.category = domain). Upsert so existing
--    rows (java/python/sql/cpp/react/testing/ai/ml from migration 010) are kept
--    and re-categorised, and the desired-state set is added. ------------------
insert into public.ref_skill (slug, label, category, sort_order) values
  -- Quantitative Aptitude
  ('arithmetic','Arithmetic','Quantitative Aptitude',101),
  ('number_series','Number Series','Quantitative Aptitude',102),
  ('simplification','Simplification','Quantitative Aptitude',103),
  ('data_interpretation','Data Interpretation','Quantitative Aptitude',104),
  ('percentages','Percentages','Quantitative Aptitude',105),
  ('algebra','Algebra','Quantitative Aptitude',106),
  ('geometry','Geometry','Quantitative Aptitude',107),
  ('time_and_work','Time & Work','Quantitative Aptitude',108),
  -- Reasoning
  ('puzzles','Puzzles','Reasoning',201),
  ('syllogism','Syllogism','Reasoning',202),
  ('coding_decoding','Coding-Decoding','Reasoning',203),
  ('blood_relations','Blood Relations','Reasoning',204),
  ('seating_arrangement','Seating Arrangement','Reasoning',205),
  ('non_verbal','Non-verbal Reasoning','Reasoning',206),
  -- English / Verbal
  ('grammar','Grammar','English / Verbal',301),
  ('reading_comprehension','Reading Comprehension','English / Verbal',302),
  ('vocabulary','Vocabulary','English / Verbal',303),
  ('error_spotting','Error Spotting','English / Verbal',304),
  ('para_jumbles','Para Jumbles','English / Verbal',305),
  ('cloze_test','Cloze Test','English / Verbal',306),
  -- General Awareness
  ('current_affairs','Current Affairs','General Awareness',401),
  ('history','History','General Awareness',402),
  ('polity','Polity','General Awareness',403),
  ('geography','Geography','General Awareness',404),
  ('economy','Economy','General Awareness',405),
  ('environment','Environment','General Awareness',406),
  ('general_science','General Science','General Awareness',407),
  ('banking_awareness','Banking Awareness','General Awareness',408),
  -- Computer & Coding
  ('java','Java','Computer & Coding',501),
  ('python','Python','Computer & Coding',502),
  ('sql','SQL','Computer & Coding',503),
  ('cpp','C++','Computer & Coding',504),
  ('dsa','Data Structures & Algorithms','Computer & Coding',505),
  ('dbms','DBMS','Computer & Coding',506),
  ('os','Operating Systems','Computer & Coding',507),
  ('computer_awareness','Computer Awareness','Computer & Coding',508),
  ('react','React','Computer & Coding',509),
  ('testing','Testing (QA)','Computer & Coding',510),
  ('ai','Artificial Intelligence','Computer & Coding',511),
  ('ml','Machine Learning','Computer & Coding',512),
  -- Domain / Core
  ('mechanical_core','Mechanical Core','Domain / Core',601),
  ('electrical_core','Electrical Core','Domain / Core',602),
  ('civil_core','Civil Core','Domain / Core',603),
  ('accountancy','Accountancy','Domain / Core',604),
  ('teaching_aptitude','Teaching Aptitude','Domain / Core',605),
  ('pedagogy','Pedagogy','Domain / Core',606),
  ('child_development','Child Development','Domain / Core',607),
  ('optional_subject','Optional Subject','Domain / Core',608),
  -- Communication & Personality
  ('public_speaking','Public Speaking','Communication & Personality',701),
  ('group_discussion','Group Discussion','Communication & Personality',702),
  ('interview_skills','Interview Skills','Communication & Personality',703),
  ('descriptive_writing','Descriptive Writing','Communication & Personality',704),
  ('essay','Essay Writing','Communication & Personality',705)
on conflict (slug) do update
  set label = excluded.label, category = excluded.category, sort_order = excluded.sort_order;

-- 2. Preference categories (the selectable unit). group_label clusters the
--    A/B/C siblings under one heading; null = standalone card. ----------------
create table if not exists public.ref_preference_category (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  group_label text,
  guidance text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

insert into public.ref_preference_category (slug, name, group_label, guidance, sort_order) values
  ('it_software','IT / Software Jobs',null,'Aptitude · Reasoning · Verbal · Coding (DSA, DBMS, OS)',1),
  ('core_engineering','Core Engineering Jobs',null,'Aptitude · Core Engineering · Interview',2),
  ('bank_insurance','Bank & Insurance Jobs',null,'Quant · Reasoning · English · Banking Awareness · Computer',3),
  ('govt_ssc_railway','Category A — SSC & Railways','Government Jobs','Quant · Reasoning · English · General Awareness',4),
  ('govt_civil_psc','Category B — Civil Services & State PSC','Government Jobs','General Studies · CSAT · Essay · Interview',5),
  ('govt_police_defence','Category C — Police & Defence','Government Jobs','Aptitude · Reasoning · GA · Physical readiness',6),
  ('teaching','Teaching Jobs',null,'Teaching Aptitude · Pedagogy · Subject · GK · Language',7),
  ('higher_mba','Category A — Management (MBA)','Higher Studies','Quant · DILR · VARC · GD / PI',8),
  ('higher_pg_research','Category B — PG & Research','Higher Studies','Subject Core · Aptitude · English',9),
  ('exploring','Still exploring',null,'We build the shared foundation while you decide',10)
on conflict (slug) do update
  set name = excluded.name, group_label = excluded.group_label,
      guidance = excluded.guidance, sort_order = excluded.sort_order;

-- 3. Exams inside each category (recognition now; enrollment later). ----------
create table if not exists public.ref_exam (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category_slug text not null references public.ref_preference_category(slug),
  sort_order int not null default 0,
  is_active boolean not null default true
);

insert into public.ref_exam (slug, label, category_slug, sort_order) values
  ('tcs_nqt','TCS NQT','it_software',1),('infosys','Infosys','it_software',2),
  ('wipro_nlth','Wipro NLTH','it_software',3),('cognizant_genc','Cognizant GenC','it_software',4),
  ('accenture','Accenture','it_software',5),('capgemini','Capgemini','it_software',6),
  ('amcat','AMCAT','it_software',7),('elitmus','eLitmus','it_software',8),
  ('gate','GATE','core_engineering',1),('psu_gate','PSU via GATE','core_engineering',2),
  ('company_core','Company Core Drives','core_engineering',3),
  ('ibps_po','IBPS PO','bank_insurance',1),('ibps_clerk','IBPS Clerk','bank_insurance',2),
  ('ibps_rrb','IBPS RRB','bank_insurance',3),('sbi_po','SBI PO','bank_insurance',4),
  ('sbi_clerk','SBI Clerk','bank_insurance',5),('rbi_grade_b','RBI Grade B','bank_insurance',6),
  ('rbi_assistant','RBI Assistant','bank_insurance',7),('nabard','NABARD','bank_insurance',8),
  ('lic_aao','LIC AAO','bank_insurance',9),
  ('ssc_cgl','SSC CGL','govt_ssc_railway',1),('ssc_chsl','SSC CHSL','govt_ssc_railway',2),
  ('ssc_mts','SSC MTS','govt_ssc_railway',3),('ssc_gd','SSC GD','govt_ssc_railway',4),
  ('rrb_ntpc','RRB NTPC','govt_ssc_railway',5),('rrb_group_d','RRB Group D','govt_ssc_railway',6),
  ('rrb_alp','RRB ALP','govt_ssc_railway',7),
  ('upsc_cse','UPSC CSE','govt_civil_psc',1),('upsc_cds','UPSC CDS','govt_civil_psc',2),
  ('appsc_group_1','APPSC Group I','govt_civil_psc',3),('appsc_group_2','APPSC Group II','govt_civil_psc',4),
  ('tspsc','TSPSC','govt_civil_psc',5),
  ('police_si','State Police SI','govt_police_defence',1),('police_constable','Constable','govt_police_defence',2),
  ('nda','NDA','govt_police_defence',3),('cds','CDS','govt_police_defence',4),
  ('afcat','AFCAT','govt_police_defence',5),('agniveer','Agniveer','govt_police_defence',6),
  ('dsc_trt','DSC / TRT','teaching',1),('ctet','CTET','teaching',2),('state_tet','State TET','teaching',3),
  ('kvs','KVS','teaching',4),('nvs','NVS','teaching',5),('edcet','EDCET (B.Ed)','teaching',6),
  ('cat','CAT','higher_mba',1),('icet','ICET','higher_mba',2),('mat','MAT','higher_mba',3),
  ('cmat','CMAT','higher_mba',4),('xat','XAT','higher_mba',5),('nmat','NMAT','higher_mba',6),
  ('pgcet','PGCET','higher_pg_research',1),('iit_jam','IIT-JAM','higher_pg_research',2),
  ('cuet_pg','CUET-PG','higher_pg_research',3),('ugc_net','UGC-NET','higher_pg_research',4),
  ('gate_pg','GATE (M.Tech)','higher_pg_research',5)
on conflict (slug) do update
  set label = excluded.label, category_slug = excluded.category_slug, sort_order = excluded.sort_order;

-- 4. Consolidated coaching map: category → the ref_skill competencies it builds.
create table if not exists public.ref_preference_category_skill (
  category_slug text not null references public.ref_preference_category(slug),
  skill_slug    text not null references public.ref_skill(slug),
  sort_order    int not null default 0,
  primary key (category_slug, skill_slug)
);

insert into public.ref_preference_category_skill (category_slug, skill_slug) values
  ('it_software','arithmetic'),('it_software','data_interpretation'),('it_software','puzzles'),
  ('it_software','coding_decoding'),('it_software','reading_comprehension'),('it_software','vocabulary'),
  ('it_software','java'),('it_software','python'),('it_software','sql'),('it_software','dsa'),
  ('it_software','dbms'),('it_software','os'),('it_software','group_discussion'),('it_software','interview_skills'),
  ('core_engineering','arithmetic'),('core_engineering','data_interpretation'),('core_engineering','puzzles'),
  ('core_engineering','non_verbal'),('core_engineering','mechanical_core'),('core_engineering','electrical_core'),
  ('core_engineering','civil_core'),('core_engineering','group_discussion'),('core_engineering','interview_skills'),
  ('bank_insurance','arithmetic'),('bank_insurance','simplification'),('bank_insurance','number_series'),
  ('bank_insurance','data_interpretation'),('bank_insurance','puzzles'),('bank_insurance','syllogism'),
  ('bank_insurance','seating_arrangement'),('bank_insurance','reading_comprehension'),('bank_insurance','grammar'),
  ('bank_insurance','cloze_test'),('bank_insurance','current_affairs'),('bank_insurance','banking_awareness'),
  ('bank_insurance','economy'),('bank_insurance','computer_awareness'),('bank_insurance','descriptive_writing'),
  ('govt_ssc_railway','arithmetic'),('govt_ssc_railway','data_interpretation'),('govt_ssc_railway','percentages'),
  ('govt_ssc_railway','puzzles'),('govt_ssc_railway','coding_decoding'),('govt_ssc_railway','blood_relations'),
  ('govt_ssc_railway','non_verbal'),('govt_ssc_railway','grammar'),('govt_ssc_railway','vocabulary'),
  ('govt_ssc_railway','error_spotting'),('govt_ssc_railway','current_affairs'),('govt_ssc_railway','history'),
  ('govt_ssc_railway','polity'),('govt_ssc_railway','geography'),('govt_ssc_railway','general_science'),
  ('govt_civil_psc','data_interpretation'),('govt_civil_psc','puzzles'),('govt_civil_psc','reading_comprehension'),
  ('govt_civil_psc','current_affairs'),('govt_civil_psc','history'),('govt_civil_psc','polity'),
  ('govt_civil_psc','geography'),('govt_civil_psc','economy'),('govt_civil_psc','environment'),
  ('govt_civil_psc','general_science'),('govt_civil_psc','optional_subject'),('govt_civil_psc','essay'),
  ('govt_civil_psc','descriptive_writing'),('govt_civil_psc','interview_skills'),
  ('govt_police_defence','arithmetic'),('govt_police_defence','puzzles'),('govt_police_defence','non_verbal'),
  ('govt_police_defence','coding_decoding'),('govt_police_defence','current_affairs'),('govt_police_defence','history'),
  ('govt_police_defence','geography'),('govt_police_defence','polity'),('govt_police_defence','general_science'),
  ('govt_police_defence','interview_skills'),
  ('teaching','grammar'),('teaching','vocabulary'),('teaching','current_affairs'),('teaching','general_science'),
  ('teaching','teaching_aptitude'),('teaching','pedagogy'),('teaching','child_development'),('teaching','interview_skills'),
  ('higher_mba','arithmetic'),('higher_mba','algebra'),('higher_mba','geometry'),('higher_mba','data_interpretation'),
  ('higher_mba','puzzles'),('higher_mba','reading_comprehension'),('higher_mba','vocabulary'),('higher_mba','para_jumbles'),
  ('higher_mba','grammar'),('higher_mba','group_discussion'),('higher_mba','interview_skills'),
  ('higher_pg_research','data_interpretation'),('higher_pg_research','puzzles'),('higher_pg_research','reading_comprehension'),
  ('higher_pg_research','accountancy'),('higher_pg_research','optional_subject'),('higher_pg_research','general_science'),
  ('exploring','arithmetic'),('exploring','data_interpretation'),('exploring','puzzles'),('exploring','coding_decoding'),
  ('exploring','reading_comprehension'),('exploring','grammar'),('exploring','current_affairs'),('exploring','interview_skills')
on conflict (category_slug, skill_slug) do nothing;

-- 5. RLS: reference data is world-readable (same policy as migration 010). -----
do $rls$
declare t text;
begin
  foreach t in array array['ref_preference_category','ref_exam','ref_preference_category_skill'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_all', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read_all', t);
  end loop;
end
$rls$;

-- 6. student_profile: up to 2 chosen category slugs (Step 3). ------------------
alter table public.student_profile
  add column if not exists preferred_category_slugs text[] not null default '{}';
alter table public.student_profile drop constraint if exists student_profile_pref_cat_max2;
alter table public.student_profile add constraint student_profile_pref_cat_max2
  check (array_length(preferred_category_slugs, 1) is null or array_length(preferred_category_slugs, 1) <= 2);

-- 7. Carry preferred_category_slugs through the intake pipeline (admin add +
--    Excel import → staging → profile merge). Functions re-defined from the 106
--    versions with the new array threaded through insert / upsert / merge. ----
alter table public.student_intake
  add column if not exists preferred_category_slugs text[] not null default '{}';

create or replace function public.import_student_intake(p_college_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_email text; v_batch uuid := gen_random_uuid(); v_existed boolean;
  v_student_role uuid; v_invite_id uuid; v_has_pending boolean;
  out_rows jsonb := '[]'::jsonb; new_emails jsonb := '[]'::jsonb;
  n_created int := 0; n_updated int := 0; n_invited int := 0; n_invite_skip int := 0;
  v_result text; v_invite text;
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
      email, college_id, full_name, roll_number, phone, gender, city_village, district, state,
      degree, branch, year_of_study, graduation_year, cgpa,
      preferred_category_slugs,
      career_goal_ids, primary_career_goal_id, skill_assessment, skills, interests,
      preferred_mentor_pref_id, biggest_challenge, source, import_batch_id, created_by
    ) values (
      v_email, p_college_id,
      nullif(r->>'full_name', ''), nullif(r->>'roll_number', ''), nullif(r->>'phone', ''),
      nullif(r->>'gender', ''),
      nullif(r->>'city_village', ''), nullif(r->>'district', ''), nullif(r->>'state', ''),
      nullif(r->>'degree', ''), nullif(r->>'branch', ''), nullif(r->>'year_of_study', ''),
      (nullif(r->>'graduation_year', ''))::int, (nullif(r->>'cgpa', ''))::numeric,
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'preferred_category_slugs', '[]'::jsonb)) x), '{}'),
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
      preferred_category_slugs = case when excluded.preferred_category_slugs = '{}' then si.preferred_category_slugs else excluded.preferred_category_slugs end,
      career_goal_ids = case when excluded.career_goal_ids = '{}' then si.career_goal_ids else excluded.career_goal_ids end,
      primary_career_goal_id = coalesce(excluded.primary_career_goal_id, si.primary_career_goal_id),
      skill_assessment = case when excluded.skill_assessment = '{}'::jsonb then si.skill_assessment else excluded.skill_assessment end,
      skills        = case when excluded.skills = '{}' then si.skills else excluded.skills end,
      interests     = case when excluded.interests = '{}' then si.interests else excluded.interests end,
      preferred_mentor_pref_id = coalesce(excluded.preferred_mentor_pref_id, si.preferred_mentor_pref_id),
      biggest_challenge = coalesce(excluded.biggest_challenge, si.biggest_challenge),
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

create or replace function public.merge_student_intake(p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare intk public.student_intake%rowtype; v_step int := 0;
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
    preferred_category_slugs = case when intk.preferred_category_slugs = '{}' then sp.preferred_category_slugs else intk.preferred_category_slugs end,
    career_goal_ids = case when intk.career_goal_ids = '{}' then sp.career_goal_ids else intk.career_goal_ids end,
    primary_career_goal_id = coalesce(intk.primary_career_goal_id, sp.primary_career_goal_id),
    skill_assessment = case when intk.skill_assessment = '{}'::jsonb then sp.skill_assessment else intk.skill_assessment end,
    skills        = case when intk.skills = '{}' then sp.skills else intk.skills end,
    interests     = case when intk.interests = '{}' then sp.interests else intk.interests end,
    preferred_mentor_pref_id = coalesce(intk.preferred_mentor_pref_id, sp.preferred_mentor_pref_id),
    biggest_challenge = coalesce(intk.biggest_challenge, sp.biggest_challenge),
    updated_at    = now()
  where sp.user_id = p_user_id;

  -- Resume point: leading consecutive completed steps (Step 3 now = preference categories).
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
            if intk.preferred_mentor_pref_id is not null or intk.biggest_challenge is not null then
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
