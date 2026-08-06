-- ============================================================================
-- 163_student_address.sql
-- Address capture for student registration: PIN code, a hand-typed flat/building
-- line, the geocoder's address, the map pin, and how it was captured (issue #101).
--
-- CONSOLIDATED ON PURPOSE. Getting here took nine migrations of genuinely useful
-- exploration, none of which prod should have to replay:
--
--   • A local PIN-code catalogue seeded from the India Post directory (19,586 rows,
--     3.2 MB of SQL) with a nearest-centroid reverse geocoder, so the feature could be
--     free. It worked, and then lost — India Post spells Varthur "Vartur", 9.5% of its
--     coordinates are wrong, 390 PINs had to have theirs discarded for sitting >150 km
--     from their own district, and the measured ceiling was 91% district / 65% exact
--     PIN. Worse, it did not converge: switching to per-office points fixed one
--     reported case and dropped overall PIN accuracy to 56%.
--   • Address split three ways (house / street / village), then collapsed to one, then
--     split again — because the first split was along street-vs-area, a judgement about
--     geodata that could not be made reliably, while the split that survives is
--     known-vs-unknowable.
--
-- The end state is small. Google Maps Platform resolves addresses (lib/geo-provider.ts)
-- and this migration only stores the answers.
--
-- WHAT IT REPLACES: the previous 163-171. Those were applied to PREVIEW ONLY and have
-- been removed from its schema_migrations; prod never saw them. Do not resurrect them.
--
-- WHY city_village / district / state ARE NOT DEFINED HERE
--   They already exist from 010_registration_reference.sql. This migration adds only
--   what is new, so an existing student's typed district is never disturbed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) student_profile
-- ---------------------------------------------------------------------------
alter table public.student_profile
  -- 6 digits, no leading zero. Anchors the address: typing it fills district and state.
  add column if not exists pincode text,
  -- Flat / building / street, typed by the student. NEVER auto-filled — no geocoder
  -- returns a flat number — and never cleared by us, because it only ever holds their
  -- own work.
  add column if not exists flat_building text,
  -- The geocoder's formatted_address, stored VERBATIM (state and PIN tail included).
  -- Not trimmed on purpose: a student should never have to edit an address that is
  -- already correct, and the duplication with district/state is the price of that.
  add column if not exists address text,
  -- The pin the student dropped on the map. Precise location is personal data under the
  -- DPDP Act 2023, so this is written ONLY when they deliberately place a pin
  -- (address_source = 'map'); a GPS fix used merely to resolve a PIN is discarded, and
  -- coordinates the geocoder returns are never persisted.
  add column if not exists latitude  numeric(9,6),
  add column if not exists longitude numeric(9,6),
  -- How the address was captured. A data-quality signal (how much of our district data
  -- was typed by hand versus resolved), self-reported by the form — never a trust or
  -- authorization signal.
  add column if not exists address_source text,
  add column if not exists address_captured_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'student_profile_pincode_format') then
    alter table public.student_profile add constraint student_profile_pincode_format
      check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'student_profile_address_source_valid') then
    alter table public.student_profile add constraint student_profile_address_source_valid
      check (address_source is null or address_source in ('manual', 'pincode', 'search', 'gps', 'map'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'student_profile_address_len') then
    alter table public.student_profile add constraint student_profile_address_len
      check (address is null or length(address) <= 400);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'student_profile_flat_building_len') then
    alter table public.student_profile add constraint student_profile_flat_building_len
      check (flat_building is null or length(flat_building) <= 200);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'student_profile_latlng_range') then
    alter table public.student_profile add constraint student_profile_latlng_range check (
      -- BOTH OR NEITHER, written as an equality of two IS NULL tests rather than the
      -- obvious `(lat is null and lng is null) or (lat between … and lng between …)`.
      -- That obvious form silently accepts HALF a coordinate: with longitude null,
      -- `null between -180 and 180` is NULL, `true and NULL` is NULL, `false or NULL` is
      -- NULL — and a CHECK constraint PASSES on NULL. Verified: the first version of
      -- this let a lone latitude through, which would have put students on the prime
      -- meridian.
      (latitude is null) = (longitude is null)
      and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180))
    );
  end if;
end $$;

create index if not exists student_profile_pincode_idx on public.student_profile (pincode);

comment on column public.student_profile.flat_building is
  'Flat / building / street, as typed by the student. Never auto-filled (issue #101).';
comment on column public.student_profile.address is
  'The geocoder''s formatted_address, verbatim and untrimmed (issue #101).';
comment on column public.student_profile.latitude is
  'Latitude of the pin the student dropped. Only set when address_source = ''map''.';

-- ---------------------------------------------------------------------------
-- 2) student_intake — the Excel/admin staging table
-- ---------------------------------------------------------------------------
-- No latitude/longitude here: an admin importing a spreadsheet has no map pin, and a
-- column nobody can fill is just somewhere for a wrong value to appear.
alter table public.student_intake
  add column if not exists pincode text,
  add column if not exists flat_building text,
  add column if not exists address text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'student_intake_pincode_format') then
    alter table public.student_intake add constraint student_intake_pincode_format
      check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Provider cache + spend cap
-- ---------------------------------------------------------------------------
-- Written and read ONLY by the server (lib/geo-provider.ts via the admin client).
create table if not exists public.geo_provider_cache (
  cache_key   text primary key,          -- 'pincode:560087', 'reverse:12.9403,77.7413'
  kind        text not null check (kind in ('pincode', 'reverse', 'autocomplete', 'details')),
  payload     jsonb not null,
  provider    text not null default 'google',
  hits        int  not null default 1,
  created_at  timestamptz not null default now(),
  -- 30 days is a LICENCE TERM, not a tuning knob: Google's Maps Platform Service
  -- Specific Terms allow latitude/longitude from the Geocoding API to be cached for at
  -- most 30 consecutive calendar days, after which it must be deleted. Do NOT raise it
  -- to save quota.
  expires_at  timestamptz not null default now() + interval '30 days'
);
create index if not exists geo_provider_cache_expiry_idx on public.geo_provider_cache (expires_at);

-- Monthly call counter, so spend is bounded even if something loops. Per-month because
-- the free allowance is monthly.
create table if not exists public.geo_provider_usage (
  provider   text not null default 'google',
  month      date not null,
  kind       text not null,
  calls      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, month, kind)
);

-- RLS on with ZERO policies: that denies every anon/authenticated request outright,
-- while the service role still bypasses it. Granting `authenticated` would let any
-- signed-in student read our provider responses and — worse — forge the counter to
-- unlock unlimited billable calls.
alter table public.geo_provider_cache enable row level security;
alter table public.geo_provider_usage enable row level security;

-- A table with no GRANT is invisible to PostgREST regardless of policy, so the service
-- role needs these explicitly (learned the hard way: every call returned PGRST205).
grant select, insert, update, delete on public.geo_provider_cache to service_role;
grant select, insert, update, delete on public.geo_provider_usage to service_role;
revoke all on public.geo_provider_cache from anon, authenticated;
revoke all on public.geo_provider_usage from anon, authenticated;

-- Claim one call against the monthly budget. Atomic: on serverless every concurrent
-- lambda would otherwise read the same count and each conclude it had room. The guard
-- lives in the UPDATE's WHERE, so at the cap nothing is counted and RETURNING is empty.
create or replace function public.geo_provider_take(
  p_kind text,
  p_cap int,
  p_provider text default 'google'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare new_total int;
begin
  insert into public.geo_provider_usage as u (provider, month, kind, calls, updated_at)
  values (p_provider, date_trunc('month', now())::date, p_kind, 1, now())
  on conflict (provider, month, kind) do update
    set calls = u.calls + 1, updated_at = now()
    where u.calls < p_cap
  returning u.calls into new_total;

  return new_total is not null;
end $$;

revoke all on function public.geo_provider_take(text, int, text) from public;
grant execute on function public.geo_provider_take(text, int, text) to service_role;

-- Delete expired cache rows. Called opportunistically from the route handlers rather
-- than by a cron job, so the licence obligation above does not depend on a scheduler
-- somebody forgets to configure.
create or replace function public.geo_provider_sweep()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.geo_provider_cache where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.geo_provider_sweep() from public;
grant execute on function public.geo_provider_sweep() to service_role;

comment on table public.geo_provider_cache is
  'Cached geocoding responses. expires_at is capped at 30 days by Google Maps '
  'Platform''s Service Specific Terms — not a tunable (issue #101).';

-- ---------------------------------------------------------------------------
-- 4) Thread the three new columns through the Excel intake pipeline
-- ---------------------------------------------------------------------------
-- Without BOTH functions an imported address lands in student_intake and then vanishes
-- when the student claims their account. Bodies are 133's with only the address lines
-- added — deliberately rebased on the pre-address version so none of the retired
-- churn is carried forward.
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
      email, college_id, full_name, roll_number, registration_number, apaar_id, phone, gender,
      flat_building, address, pincode, city_village, district, state,
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
      nullif(r->>'flat_building', ''), nullif(r->>'address', ''),
      -- The CHECK on student_intake.pincode would abort the whole import batch on one
      -- bad cell, so anything that isn't 6 digits is dropped here. The Excel normalizer
      -- reports it as a per-row warning (lib/intake-excel.ts).
      case when nullif(r->>'pincode', '') ~ '^[1-9][0-9]{5}$' then r->>'pincode' end,
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
      flat_building = coalesce(excluded.flat_building, si.flat_building),
      address       = coalesce(excluded.address, si.address),
      pincode       = coalesce(excluded.pincode, si.pincode),
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
    flat_building = coalesce(intk.flat_building, sp.flat_building),
    address       = coalesce(intk.address, sp.address),
    pincode       = coalesce(intk.pincode, sp.pincode),
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
