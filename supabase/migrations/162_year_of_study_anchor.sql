-- ============================================================================
-- 162_year_of_study_anchor.sql
-- Year of study stops going stale (follow-up inside issue #99).
--
-- THE BUG
--   `student_profile.year_of_study` stored a RELATIVE fact ("3rd Year") as an
--   absolute snapshot. Nothing ever advanced it — no trigger, no cron, no other
--   writer in 161 migrations — so a student who answered "3rd Year" in 2026 still
--   read "3rd Year" in 2030, and nobody ever aged into 'passed_out'. Two live rows
--   were already wrong before any rollover, because the same students had ALSO given
--   a graduation_year that contradicted their year_of_study, with nothing reconciling
--   the two. Anything filtering by year (enrolling "the 3rd years" into a batch)
--   silently picked a stale cohort, including students who had already graduated.
--
-- WHY WE STILL ASK FOR THE YEAR, AND DON'T ASK FOR THE ADMISSION YEAR
--   Students reliably know "I'm in 3rd year". "Admission year" they do NOT: it's
--   ambiguous between the calendar year they joined, the academic-year label, and
--   the year the course officially started — and for lateral-entry students none of
--   those agree. So the form keeps asking the question a student can answer, and the
--   ANCHOR is derived from it once, at the moment they answer:
--
--     ayEnd(d) = year(d) + (month(d) >= 6 ? 1 : 0)   -- academic year, named by its END
--     capture:  entry_academic_year = ayEnd(answered_at) - N
--     read:     N                   = ayEnd(now)      - entry_academic_year
--
--   The two are mirror images, so re-answering is IDEMPOTENT: a student who reopens
--   the form next July sees the derived "4th Year" and saving it re-anchors to the
--   same 2024. That property is what makes it safe to display a derived value in an
--   editable field.
--
-- WHAT IS STILL STORED, AND WHY
--   `year_of_study` is KEPT, as the override and the fallback. Derivation is
--   impossible for 'passed_out' (no anchor), and for a degree with no
--   duration_years ('other'), so those rows keep answering from the stored slug. It
--   is also the escape hatch for a repeater, a gap year, or a transfer: derivation
--   drifts by exactly one year per repeat, and the fix is that the student or staff
--   re-answers the year — which re-anchors. The answer stays an input; the anchor is
--   always re-derivable from the latest answer.
--
-- THE JUNE BOUNDARY IS POLICY, NOT PHYSICS
--   AP/TS academic years start around June. That 6 appears here (for the one-time
--   backfill) and as ACADEMIC_YEAR_START_MONTH in lib/degree-branch.ts (for every
--   read from now on). If the policy changes, BOTH must change — the backfill is
--   historical and the constant is live. Same deliberate duplication CLAUDE.md
--   already accepts for the navbar clamp() values.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The anchor
-- ---------------------------------------------------------------------------
-- Deliberately NOT NOT-NULL: it is unknowable for a passed-out student and for a
-- degree with no duration, and a null here is the documented signal to fall back to
-- the stored `year_of_study` slug.
alter table public.student_profile
  add column if not exists entry_academic_year int
    check (entry_academic_year is null or entry_academic_year between 1950 and 2100);

-- student_intake carries year_of_study too (bulk import), and handle_new_user()
-- copies it into student_profile on claim — so the anchor has to travel with it or
-- every imported student would arrive un-anchored and immediately start going stale.
alter table public.student_intake
  add column if not exists entry_academic_year int
    check (entry_academic_year is null or entry_academic_year between 1950 and 2100);

-- The enrolment "which year?" filter resolves a requested year to an anchor value
-- and matches on THAT (an equality on an int) rather than on a derived string, so it
-- stays indexable and keeps scaling to thousands of students.
create index if not exists student_profile_entry_year_idx
  on public.student_profile (entry_academic_year);

-- ---------------------------------------------------------------------------
-- 2) Backfill — anchor every row that already answered
-- ---------------------------------------------------------------------------
-- Anchored from WHEN THEY ANSWERED, not from now(): a profile last touched in 2024
-- saying "3rd Year" meant 3rd year *in 2024*, and anchoring it to today would
-- silently rewrite that student's history. registration_started_at is the honest
-- first-answer timestamp (issue #83's audit); the coalesce chain degrades to the
-- next-best evidence.
--
-- 'final_year' maps to the degree's duration; 'passed_out' is left un-anchored on
-- purpose (see the header). Guarded on `entry_academic_year is null`, so a re-run
-- can never re-anchor — and never overwrite an anchor the app has since corrected.
do $$
begin
  update public.student_profile sp
     set entry_academic_year = ay.ay_end - ay.n
    from (
      select p.user_id,
             -- ayEnd(answered_at). The 6 is June — see the header note.
             extract(year from a)::int + (case when extract(month from a) >= 6 then 1 else 0 end) as ay_end,
             -- CLAMPED to the degree's length. The old flat year list offered 4th
             -- Year to everyone (161's own header calls it "too permissive for a
             -- 3-year B.Sc"), so rows like bsc+year_4 exist. Anchoring those at N=4
             -- makes currentYearOfStudy() compute 4 > 3 and render 'passed_out',
             -- so a current student reads as graduated and drops out of the
             -- enrolment picker entirely.
             least(
               case
                 when p.year_of_study = 'final_year' then ceil(d.duration_years)::int
                 else nullif(regexp_replace(p.year_of_study, '^year_', ''), p.year_of_study)::int
               end,
               ceil(d.duration_years)::int
             ) as n
        from public.student_profile p
        join public.ref_degree d on d.slug = p.degree
        cross join lateral (
          select coalesce(p.registration_started_at, p.updated_at, now()) as a
        ) t(a)
       where p.entry_academic_year is null
         and p.year_of_study is not null
         and p.year_of_study <> 'passed_out'
         and d.duration_years is not null
    ) ay
   where sp.user_id = ay.user_id
     and ay.n is not null;
end $$;

-- Same for staged imports.
update public.student_intake si
   set entry_academic_year = ay.ay_end - ay.n
  from (
    select i.id,
           extract(year from coalesce(i.updated_at, i.created_at, now()))::int
             + (case when extract(month from coalesce(i.updated_at, i.created_at, now())) >= 6 then 1 else 0 end) as ay_end,
           least(
             case
               when i.year_of_study = 'final_year' then ceil(d.duration_years)::int
               else nullif(regexp_replace(i.year_of_study, '^year_', ''), i.year_of_study)::int
             end,
             ceil(d.duration_years)::int
           ) as n
      from public.student_intake i
      join public.ref_degree d on d.slug = i.degree
     where i.entry_academic_year is null
       and i.year_of_study is not null
       and i.year_of_study <> 'passed_out'
       and d.duration_years is not null
  ) ay
 where si.id = ay.id
   and ay.n is not null;

-- Legacy rows whose stored year EXCEEDS the degree's length (bsc + year_4 — 161's
-- header calls the old flat list "too permissive for a 3-year B.Sc") are normalised to
-- the equivalent legal slug and left for the trigger to re-anchor. The backfill above
-- already clamps, so this is a no-op on a fresh database; it exists for any database
-- that ran an earlier, unclamped version. Setting the anchor to null is what makes the
-- trigger's re-derivation unconditional.
--
-- Written per table rather than through format() because the predicate needs a join to
-- ref_degree, which dynamic SQL only obscures. And normalise-then-let-the-trigger-run
-- rather than arithmetic on the anchor: the UPDATE touches year_of_study, so the
-- trigger fires and would discard any anchor computed here — writing arithmetic it
-- silently overwrites would be a lie in the code. For a row that was never legal the
-- original timing is unknowable anyway, so "final year as of now" is the honest reading.
update public.student_profile sp
   set year_of_study       = 'final_year',
       entry_academic_year = null
 where sp.user_id in (
   select p.user_id
     from public.student_profile p
     join public.ref_degree d on d.slug = p.degree
    where d.duration_years is not null
      and p.year_of_study ~ '^year_[0-9]+$'
      and (regexp_replace(p.year_of_study, '^year_', ''))::int > ceil(d.duration_years)::int
 );

update public.student_intake si
   set year_of_study       = 'final_year',
       entry_academic_year = null
 where si.id in (
   select i.id
     from public.student_intake i
     join public.ref_degree d on d.slug = i.degree
    where d.duration_years is not null
      and i.year_of_study ~ '^year_[0-9]+$'
      and (regexp_replace(i.year_of_study, '^year_', ''))::int > ceil(d.duration_years)::int
 );

-- ---------------------------------------------------------------------------
-- 2b) Retire 'final_year' as an OPTION — numbered years only
-- ---------------------------------------------------------------------------
-- Offering "Final Year" alongside the numbered years put TWO options for the same year
-- in every list: "2nd Year" and "Final Year" for a 2-year MCA, "4th Year" and "Final
-- Year" for a 4-year B.Tech. Whichever the student picked, the derived label then
-- rendered as the other one, so their own answer appeared to change itself.
--
-- Stored values are migrated to their numeric equivalent first (we know the degree's
-- length, so this is lossless — "Final Year" of a 3-year B.Sc *is* "3rd Year"), then
-- the option is deactivated so it disappears from the form AND the Excel template in
-- one place. slugForYearNumber() no longer produces it either; yearNumberOf() still
-- READS it, so any row this cannot convert keeps deriving correctly.
update public.student_profile sp
   set year_of_study = 'year_' || ceil(d.duration_years)::int
  from public.ref_degree d
 where d.slug = sp.degree
   and sp.year_of_study = 'final_year'
   and d.duration_years is not null;

update public.student_intake si
   set year_of_study = 'year_' || ceil(d.duration_years)::int
  from public.ref_degree d
 where d.slug = si.degree
   and si.year_of_study = 'final_year'
   and d.duration_years is not null;

-- Deactivated, not deleted: the label must still resolve for any row on a degree with
-- no known duration, which the two statements above cannot convert.
update public.ref_year_of_study set is_active = false where slug = 'final_year';

-- ---------------------------------------------------------------------------
-- 3) graduation_year becomes DERIVED-BUT-EDITABLE
-- ---------------------------------------------------------------------------
-- entry + duration is the graduation year, so the two fields can no longer
-- contradict each other by accident. It stays a real column (not generated) because
-- a student on a non-standard timeline must be able to state their actual year — and
-- a value that disagrees with the derivation is now MEANINGFUL: it flags a repeat,
-- a gap year or a transfer instead of being indistinguishable from a typo.
-- Only fills the blanks; never overwrites what a student typed.
update public.student_profile sp
   set graduation_year = sp.entry_academic_year + ceil(d.duration_years)::int
  from public.ref_degree d
 where d.slug = sp.degree
   and sp.graduation_year is null
   and sp.entry_academic_year is not null
   and d.duration_years is not null;

update public.student_intake si
   set graduation_year = si.entry_academic_year + ceil(d.duration_years)::int
  from public.ref_degree d
 where d.slug = si.degree
   and si.graduation_year is null
   and si.entry_academic_year is not null
   and d.duration_years is not null;

-- ---------------------------------------------------------------------------
-- 4) The anchor is stamped by a TRIGGER, so every writer is covered
-- ---------------------------------------------------------------------------
-- WHY NOT AT THE CALL SITES: year_of_study is written by six of them — the student
-- wizard, the console student form, the Excel import, the single-student intake,
-- import_student_intake() and the intake→profile claim merge (the last two being
-- large SQL functions with FIXED column lists, currently declared in migration 133).
-- Anchoring per call site would miss one today and drift the first time a seventh
-- appears; re-declaring 150 lines of migration-133 function here to add one column
-- would be worse. Same reasoning migration 160 records for the registration audit:
-- put it in a trigger and every path inherits it.
--
-- Only ever FILLS, never overwrites: an explicitly-supplied anchor wins, and an
-- existing anchor is only re-derived when year_of_study actually CHANGES. That is
-- what makes re-answering the year a re-anchor (the documented fix for a repeat or a
-- gap year) while an unrelated profile save leaves the anchor alone.
create or replace function public.stamp_entry_academic_year()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n            int;
  duration     numeric;
  old_duration numeric;
  ay_end       int;
begin
  if new.year_of_study is null or new.year_of_study = 'passed_out' then
    return new;
  end if;

  -- Duration is needed by the guards below, so it is resolved first.
  select d.duration_years into duration from public.ref_degree d where d.slug = new.degree;
  if duration is null then
    return new;                      -- e.g. degree 'other': keep the stored slug
  end if;

  if new.entry_academic_year is not null and tg_op = 'UPDATE' then
    -- Nothing that determines the anchor moved.
    if new.year_of_study is not distinct from old.year_of_study
       and new.degree is not distinct from old.degree then
      return new;
    end if;

    -- The DEGREE moved but the answer is an ABSOLUTE numbered year that still fits the
    -- new programme. 'year_2' means N=2 whatever the degree, so the existing anchor
    -- already encodes it — re-deriving would reset the student's cohort to today for no
    -- reason. That is what resolving an "Other answers" degree write-in does: it changes
    -- `degree` while the year answer stands, and it must not rewrite cohort data.
    --
    -- Only 'final_year' is duration-RELATIVE (N = the programme's length), and only an
    -- out-of-range numbered year needs the clamp — both fall through to re-derivation.
    if new.year_of_study is not distinct from old.year_of_study
       and new.year_of_study ~ '^year_[0-9]+$'
       and (regexp_replace(new.year_of_study, '^year_', ''))::int <= ceil(duration)::int then
      return new;
    end if;
  end if;

  -- INSERT with an anchor already supplied: trust the caller.
  if tg_op = 'INSERT' and new.entry_academic_year is not null then
    return new;
  end if;

  -- CLAMPED to the degree's length, matching 162's backfill. The form filters the
  -- year list by duration, but the single-student intake endpoint does not, so an
  -- out-of-range year can still arrive — and an unclamped anchor makes
  -- currentYearOfStudy() render 'passed_out' for a student who is not.
  n := least(
         case
           when new.year_of_study = 'final_year' then ceil(duration)::int
           else nullif(regexp_replace(new.year_of_study, '^year_', ''), new.year_of_study)::int
         end,
         ceil(duration)::int
       );
  if n is null then
    return new;
  end if;

  ay_end := extract(year from now())::int
            + (case when extract(month from now()) >= 6 then 1 else 0 end);
  new.entry_academic_year := ay_end - n;

  -- graduation_year tracks only while it is still the AUTO-FILLED value. The
  -- "was it auto-filled?" test must use the OLD duration as well as the old anchor —
  -- on a degree change the new duration would make a genuinely auto-filled value look
  -- hand-typed, freezing it at the previous degree's length.
  if tg_op = 'UPDATE' then
    select d.duration_years into old_duration from public.ref_degree d where d.slug = old.degree;
  end if;

  if new.graduation_year is null
     or (tg_op = 'UPDATE'
         and old.entry_academic_year is not null
         and old_duration is not null
         and new.graduation_year = old.entry_academic_year + ceil(old_duration)::int)
  then
    new.graduation_year := new.entry_academic_year + ceil(duration)::int;
  end if;

  return new;
end $$;

drop trigger if exists student_profile_stamp_entry_year on public.student_profile;
create trigger student_profile_stamp_entry_year
  before insert or update of year_of_study, degree, entry_academic_year on public.student_profile
  for each row execute function public.stamp_entry_academic_year();

drop trigger if exists student_intake_stamp_entry_year on public.student_intake;
create trigger student_intake_stamp_entry_year
  before insert or update of year_of_study, degree, entry_academic_year on public.student_intake
  for each row execute function public.stamp_entry_academic_year();

-- ---------------------------------------------------------------------------
-- 5) Carry the anchor (and the #99 write-ins) through the intake → profile merge
-- ---------------------------------------------------------------------------
-- merge_student_intake() copies a claimed intake row onto student_profile from a FIXED
-- column list, so three columns have to be named there or they are silently dropped:
-- the anchor, plus the degree_other/branch_other write-ins 161 added. Without the
-- anchor every imported student arrived un-anchored and the trigger re-derived from
-- now() at claim time, so an import and claim straddling the June boundary anchored
-- that student a year late. Without the write-ins, an admin staging a student whose
-- degree is "Other" watched their typed answer vanish on claim.
--
-- Re-declaring this function is the established pattern for it (011 → 106 → 120 → 124
-- → 133 each re-declared it); the body is 133's with three columns added to the SET
-- list and nothing else changed.
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
    -- The "Other" write-ins (#99) and the year-of-study ANCHOR (#162). Without
    -- these three the admin staging path silently dropped a degree/branch a
    -- student typed, and every imported student arrived un-anchored — the
    -- June-boundary edge 162 recorded as a known limitation is now closed.
    degree_other  = coalesce(intk.degree_other, sp.degree_other),
    branch_other  = coalesce(intk.branch_other, sp.branch_other),
    entry_academic_year = coalesce(intk.entry_academic_year, sp.entry_academic_year),
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

grant execute on function public.merge_student_intake(uuid, text) to authenticated;
