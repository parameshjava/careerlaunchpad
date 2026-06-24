-- ============================================================================
-- 010_registration_reference.sql
-- Reference (lookup) tables + seeds for the Student Registration Form
-- (🎓 Student Registration Form.docx) and the Mentor Registration Form, plus
-- the new student_profile columns those forms collect.
--
-- Reference tables follow one shape: (id, slug, label, category, sort_order,
-- is_active). They are PUBLIC read-only lookup data — RLS allows everyone to
-- read; writes go through the service role (admin tooling) only. The college
-- list already lives in public.college (002 + 008 seed) and is reused as-is.
--
-- Single-select form fields become FKs into a ref table; multi-select fields
-- stay arrays (text[] like student_profile.skills, or uuid[] of ref ids like
-- the career goals). Career goals are multi-select: career_goal_ids holds the
-- full uuid[] set and primary_career_goal_id is the single FK chosen as primary.
-- The 1–5 self-assessment is stored as jsonb keyed by
-- ref_skill_assessment_category.slug.
-- Idempotent: tables use IF NOT EXISTS; seeds use ON CONFLICT (slug) DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generic reference-table helper shape (one table per value set)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_gender (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  label      text not null,
  category   text,
  sort_order int  not null default 0,
  is_active  boolean not null default true
);

create table if not exists public.ref_degree (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_branch (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_year_of_study (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- Career goals are grouped (category = IT Sector / Core Jobs / Banking /
-- Government / Other) so the form can render an option-group dropdown.
create table if not exists public.ref_career_goal (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- The six 1–5 self-assessment dimensions (Step 4).
create table if not exists public.ref_skill_assessment_category (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_skill (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_interest (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_mentor_preference (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- Mentor-form value sets (kept here so all reference data lives together).
create table if not exists public.ref_industry (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_mentoring_area (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_mentor_mode (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_contribution_type (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------
insert into public.ref_gender (slug, label, sort_order) values
  ('male', 'Male', 1), ('female', 'Female', 2),
  ('other', 'Other', 3), ('prefer_not_say', 'Prefer not to say', 4)
on conflict (slug) do nothing;

insert into public.ref_degree (slug, label, sort_order) values
  ('btech', 'B.Tech', 1), ('be', 'B.E', 2), ('bsc', 'B.Sc', 3),
  ('bcom', 'B.Com', 4), ('ba', 'B.A', 5), ('bba', 'BBA', 6),
  ('bca', 'BCA', 7), ('diploma', 'Diploma', 8), ('mtech', 'M.Tech', 9),
  ('mba', 'MBA', 10), ('mca', 'MCA', 11), ('msc', 'M.Sc', 12),
  ('other', 'Other', 99)
on conflict (slug) do nothing;

insert into public.ref_branch (slug, label, sort_order) values
  ('cse', 'Computer Science (CSE)', 1), ('it', 'Information Technology (IT)', 2),
  ('aiml', 'AI & ML', 3), ('data_science', 'Data Science', 4),
  ('ece', 'Electronics & Communication (ECE)', 5), ('eee', 'Electrical & Electronics (EEE)', 6),
  ('mechanical', 'Mechanical', 7), ('civil', 'Civil', 8),
  ('chemical', 'Chemical', 9), ('other', 'Other', 99)
on conflict (slug) do nothing;

insert into public.ref_year_of_study (slug, label, sort_order) values
  ('year_1', '1st Year', 1), ('year_2', '2nd Year', 2),
  ('year_3', '3rd Year', 3), ('year_4', '4th Year', 4),
  ('final_year', 'Final Year', 5), ('passed_out', 'Passed Out', 6)
on conflict (slug) do nothing;

-- Career goals (Step 3) — grouped for an option-group dropdown.
insert into public.ref_career_goal (slug, label, category, sort_order) values
  ('fullstack_developer', 'Full Stack Developer', 'IT Sector', 1),
  ('data_analyst',        'Data Analyst',         'IT Sector', 2),
  ('data_engineer',       'Data Engineer',        'IT Sector', 3),
  ('data_scientist',      'Data Scientist',       'IT Sector', 4),
  ('aiml_engineer',       'AI/ML Engineer',       'IT Sector', 5),
  ('cyber_security',      'Cyber Security',       'IT Sector', 6),
  ('cloud_engineer',      'Cloud Engineer',       'IT Sector', 7),
  ('quality_assurance',   'Quality Assurance',    'IT Sector', 8),
  ('mechanical_core',     'Mechanical Core',      'Core Jobs', 9),
  ('electrical_core',     'Electrical Core',      'Core Jobs', 10),
  ('civil_core',          'Civil Core',           'Core Jobs', 11),
  ('banking_sector',      'Banking Sector',       'Banking',   12),
  ('govt_general',        'Government Sector',    'Government', 13),
  ('govt_appsc',          'APPSC',                'Government', 14),
  ('govt_upsc',           'UPSC',                 'Government', 15),
  ('entrepreneurship',    'Entrepreneurship',     'Other',     16),
  ('higher_studies',      'Higher Studies',       'Other',     17),
  ('undecided',           'Undecided',            'Other',     18)
on conflict (slug) do nothing;

-- Step 4 self-assessment dimensions (rated 1–5).
insert into public.ref_skill_assessment_category (slug, label, sort_order) values
  ('communication',       'Communication Skills', 1),
  ('aptitude',            'Aptitude',             2),
  ('programming',         'Programming',          3),
  ('english_speaking',    'English Speaking',     4),
  ('presentation',        'Presentation Skills',  5),
  ('interview_confidence','Interview Confidence', 6)
on conflict (slug) do nothing;

-- Step 5 skills.
insert into public.ref_skill (slug, label, sort_order) values
  ('java', 'Java', 1), ('python', 'Python', 2), ('sql', 'SQL', 3),
  ('cpp', 'C++', 4), ('react', 'React', 5), ('testing', 'Testing', 6),
  ('ai', 'AI', 7), ('ml', 'ML', 8)
on conflict (slug) do nothing;

-- Step 5 interests.
insert into public.ref_interest (slug, label, sort_order) values
  ('coding', 'Coding', 1), ('public_speaking', 'Public Speaking', 2),
  ('research', 'Research', 3), ('entrepreneurship', 'Entrepreneurship', 4),
  ('leadership', 'Leadership', 5), ('content_creation', 'Content Creation', 6)
on conflict (slug) do nothing;

-- Step 6 mentor preference.
insert into public.ref_mentor_preference (slug, label, sort_order) values
  ('same_branch', 'Same Branch', 1), ('same_college_alumni', 'Same College Alumni', 2),
  ('same_district', 'Same District', 3), ('same_industry', 'Same Industry', 4),
  ('no_preference', 'No Preference', 5)
on conflict (slug) do nothing;

-- Mentor-form value sets.
insert into public.ref_industry (slug, label, sort_order) values
  ('software_engineering', 'Software Engineering', 1), ('data_analytics', 'Data Analytics', 2),
  ('banking', 'Banking', 3), ('mechanical', 'Mechanical', 4),
  ('civil', 'Civil', 5), ('government_services', 'Government Services', 6)
on conflict (slug) do nothing;

insert into public.ref_mentoring_area (slug, label, sort_order) values
  ('career_guidance', 'Career Guidance', 1), ('resume_review', 'Resume Review', 2),
  ('interview_preparation', 'Interview Preparation', 3), ('technical_skills', 'Technical Skills', 4),
  ('leadership', 'Leadership', 5), ('entrepreneurship', 'Entrepreneurship', 6),
  ('higher_studies', 'Higher Studies', 7)
on conflict (slug) do nothing;

insert into public.ref_mentor_mode (slug, label, sort_order) values
  ('online', 'Online', 1), ('offline', 'Offline', 2), ('both', 'Both', 3)
on conflict (slug) do nothing;

insert into public.ref_contribution_type (slug, label, sort_order) values
  ('volunteer', 'Volunteer', 1), ('paid_mentor', 'Paid Mentor', 2), ('guest_speaker', 'Guest Speaker', 3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: reference data is public-read; writes are admin-only (service role).
-- ---------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array[
    'ref_gender','ref_degree','ref_branch','ref_year_of_study','ref_career_goal',
    'ref_skill_assessment_category','ref_skill','ref_interest','ref_mentor_preference',
    'ref_industry','ref_mentoring_area','ref_mentor_mode','ref_contribution_type'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_all', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read_all', t);
  end loop;
end
$rls$;

-- ---------------------------------------------------------------------------
-- student_profile: new columns for the registration form
-- ---------------------------------------------------------------------------
alter table public.student_profile
  -- Step 1: basic information (full_name/photo_url already exist; phone = mobile)
  add column if not exists gender               text,
  add column if not exists city_village         text,   -- "Village / Mandal / City"
  add column if not exists district             text,
  add column if not exists state                text,
  -- Step 2: academics (college_id/degree/branch/graduation_year/cgpa already exist)
  add column if not exists year_of_study        text,
  -- Step 3: career aspirations — students pick one or more goals (career_goal_ids)
  -- and designate exactly one of them as primary (primary_career_goal_id, an FK
  -- that should always be present in career_goal_ids). The full set stays a
  -- uuid[] of ref_career_goal.id, mirroring the skills/interests text[] pattern.
  add column if not exists career_goal_ids        uuid[] not null default '{}',
  add column if not exists primary_career_goal_id uuid references public.ref_career_goal(id),
  -- Step 4: self-assessment, keyed by ref_skill_assessment_category.slug -> 1..5
  add column if not exists skill_assessment     jsonb not null default '{}',
  -- Step 5: interests (skills already exist as text[])
  add column if not exists interests            text[] not null default '{}',
  -- Step 6: mentor matching
  add column if not exists preferred_mentor_pref_id uuid references public.ref_mentor_preference(id),
  add column if not exists biggest_challenge    text,
  -- Registration progress: the form saves each step incrementally (PATCH) so a
  -- student can stop and resume. last_completed_step is the highest step saved
  -- (0..6); the form reopens at last_completed_step + 1. registration_status
  -- flips to 'submitted' only when the final submit passes full validation.
  add column if not exists registration_status text not null default 'in_progress'
    check (registration_status in ('in_progress', 'submitted')),
  add column if not exists last_completed_step  int  not null default 0,
  add column if not exists registration_submitted_at timestamptz,
  -- Career Readiness Score (dashboard): overall 0–100 + per-dimension breakdown
  add column if not exists career_readiness_score      int check (career_readiness_score between 0 and 100),
  add column if not exists career_readiness_components  jsonb not null default '{}';

create index if not exists student_profile_career_goal_idx
  on public.student_profile (primary_career_goal_id);
create index if not exists student_profile_career_goals_gin_idx
  on public.student_profile using gin (career_goal_ids);
create index if not exists student_profile_state_district_idx
  on public.student_profile (state, district);
