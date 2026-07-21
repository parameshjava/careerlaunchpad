-- ============================================================================
-- 121_tell_us_step.sql
-- Registration Step 6 reworked from "Mentor" -> "Tell Us": decision-useful
-- student background (first-generation status, govt caste/community certificate
-- + reservation category, languages, date of birth, family members & their
-- occupations, household income band, hobbies) plus a free-text biggest
-- challenge (biggest_challenge column already exists from 010, now authored as
-- Markdown).
--
-- Same conventions as 010_registration_reference.sql:
--   * ref_* lookup tables share the (id, slug, label, category, sort_order,
--     is_active) shape and are PUBLIC read-only (RLS select using(true));
--   * single-select fields are stored as text slugs validated in-app against the
--     ref set (same as gender/degree/branch), multi-select fields as text[];
--   * family members are a jsonb array [{relation, occupation}] so the whole step
--     round-trips through the single-table incremental PATCH (no child table).
--   * preferred_mentor_pref_id is NOT dropped — it stays for the Excel-intake
--     pipeline/analytics (moved to lib/registration LEGACY_FIELDS), the wizard
--     simply stops collecting it.
-- Idempotent: IF NOT EXISTS tables/columns; seeds ON CONFLICT (slug) DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reference tables (Step 6 "Tell Us")
-- ---------------------------------------------------------------------------
create table if not exists public.ref_language (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_family_relation (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_family_occupation (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

create table if not exists public.ref_income_band (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- AP/Telangana reservation groups a caste/community certificate is issued
-- against (BC-A..E, SC, ST, EWS, Other).
create table if not exists public.ref_reservation_category (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- Whether the student holds a govt caste/community certificate (has/applied/none).
create table if not exists public.ref_caste_certificate_status (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- Hobbies, grouped into competency domains via `category` (rendered as titled
-- cards, same as ref_skill in Step 5).
create table if not exists public.ref_hobby (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null, category text,
  sort_order int not null default 0, is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------
insert into public.ref_language (slug, label, sort_order) values
  ('telugu', 'Telugu', 1), ('hindi', 'Hindi', 2), ('english', 'English', 3),
  ('tamil', 'Tamil', 4), ('kannada', 'Kannada', 5), ('urdu', 'Urdu', 6),
  ('other', 'Other', 99)
on conflict (slug) do nothing;

insert into public.ref_family_relation (slug, label, sort_order) values
  ('father', 'Father', 1), ('mother', 'Mother', 2), ('guardian', 'Guardian', 3),
  ('brother', 'Brother', 4), ('sister', 'Sister', 5), ('spouse', 'Spouse', 6),
  ('other', 'Other', 99)
on conflict (slug) do nothing;

insert into public.ref_family_occupation (slug, label, sort_order) values
  ('farmer', 'Farmer / Agriculture', 1),
  ('govt_employee', 'Government employee', 2),
  ('private_job', 'Private-sector job', 3),
  ('business', 'Business / Self-employed', 4),
  ('daily_wage', 'Daily-wage / Labour', 5),
  ('homemaker', 'Homemaker', 6),
  ('retired', 'Retired / Pensioner', 7),
  ('not_working', 'Not currently working', 8),
  ('abroad', 'Working abroad / NRI', 9),
  ('other', 'Other', 99)
on conflict (slug) do nothing;

-- NOTE: these MONTHLY bands were superseded by ANNUAL bands in migration
-- 122_income_bands_annual.sql (₹10k monthly is meaningless as annual income).
-- Kept here as originally shipped so migration history stays truthful; 122
-- transitions every database to the annual set.
insert into public.ref_income_band (slug, label, sort_order) values
  ('below_10k', 'Below ₹10,000', 1),
  ('10k_25k', '₹10,000 – 25,000', 2),
  ('25k_50k', '₹25,000 – 50,000', 3),
  ('50k_100k', '₹50,000 – 1,00,000', 4),
  ('above_100k', 'Above ₹1,00,000', 5),
  ('prefer_not_say', 'Prefer not to say', 6)
on conflict (slug) do nothing;

insert into public.ref_reservation_category (slug, label, sort_order) values
  ('bc_a', 'BC-A — Backward Class A', 1),
  ('bc_b', 'BC-B — Backward Class B', 2),
  ('bc_c', 'BC-C — Backward Class C', 3),
  ('bc_d', 'BC-D — Backward Class D', 4),
  ('bc_e', 'BC-E — Backward Class E (Muslim minority)', 5),
  ('sc', 'SC — Scheduled Caste', 6),
  ('st', 'ST — Scheduled Tribe', 7),
  ('ews', 'EWS — Economically Weaker Section', 8),
  ('other', 'Other', 99)
on conflict (slug) do nothing;

insert into public.ref_caste_certificate_status (slug, label, sort_order) values
  ('has', 'Yes, I have it', 1),
  ('applied', 'Applied / in process', 2),
  ('none', 'No', 3)
on conflict (slug) do nothing;

insert into public.ref_hobby (slug, label, category, sort_order) values
  ('cricket', 'Cricket', 'Sports & Fitness', 1),
  ('football', 'Football', 'Sports & Fitness', 2),
  ('badminton', 'Badminton', 'Sports & Fitness', 3),
  ('running', 'Running', 'Sports & Fitness', 4),
  ('gym_yoga', 'Gym / Yoga', 'Sports & Fitness', 5),
  ('cycling', 'Cycling', 'Sports & Fitness', 6),
  ('music', 'Music', 'Arts & Culture', 7),
  ('singing', 'Singing', 'Arts & Culture', 8),
  ('dancing', 'Dancing', 'Arts & Culture', 9),
  ('drawing', 'Drawing / Painting', 'Arts & Culture', 10),
  ('photography', 'Photography', 'Arts & Culture', 11),
  ('writing', 'Writing', 'Arts & Culture', 12),
  ('coding', 'Coding', 'Tech & Making', 13),
  ('gaming', 'Gaming', 'Tech & Making', 14),
  ('electronics', 'Electronics / DIY', 'Tech & Making', 15),
  ('robotics', 'Robotics', 'Tech & Making', 16),
  ('reading', 'Reading', 'Mind & Leisure', 17),
  ('chess', 'Chess', 'Mind & Leisure', 18),
  ('cooking', 'Cooking', 'Mind & Leisure', 19),
  ('gardening', 'Gardening', 'Mind & Leisure', 20),
  ('volunteering', 'Volunteering', 'Mind & Leisure', 21),
  ('travel', 'Travel', 'Mind & Leisure', 22)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: reference data is public-read; writes are admin-only (service role).
-- ---------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array[
    'ref_language','ref_family_relation','ref_family_occupation','ref_income_band',
    'ref_reservation_category','ref_caste_certificate_status','ref_hobby'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_all', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read_all', t);
  end loop;
end
$rls$;

-- ---------------------------------------------------------------------------
-- student_profile: Step 6 "Tell Us" columns (all optional).
-- ---------------------------------------------------------------------------
alter table public.student_profile
  add column if not exists is_first_generation      boolean,
  add column if not exists date_of_birth            date,
  add column if not exists languages                text[] not null default '{}',
  -- text slugs validated in-app against the ref sets (same as gender/degree)
  add column if not exists caste_certificate_status text,
  add column if not exists reservation_category     text,
  add column if not exists income_band              text,
  -- [{ "relation": "father", "occupation": "farmer" }, …]
  add column if not exists family_members           jsonb  not null default '[]',
  add column if not exists hobbies                  text[] not null default '{}',
  add column if not exists custom_hobbies           text[] not null default '{}';
