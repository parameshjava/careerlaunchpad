-- ============================================================================
-- seed-mock-peers.sql — PREVIEW ONLY
--
-- Gives one college enough peers for the "How you compare" charts to show a real
-- distribution instead of the flat n=1 shape (every count 1, so every donut wedge
-- is identical at 7.1%). Read the guardrails before running.
--
-- RUNS ANYWHERE: plain SQL only. No psql meta-commands, so this works in the
-- Supabase SQL editor, in psql, and through any query tool. An earlier version
-- used \set / :'target_email', which the SQL editor rejects with
-- "syntax error at or near \".
--
-- READ THIS IF YOU RUN THE WHOLE FILE AT ONCE
--   The Supabase SQL editor shows only the LAST statement's result. STEP 0 below
--   is therefore invisible when you run everything in one go — which is why STEP 2
--   is written to self-diagnose: on failure it lists the colleges that have
--   students and the exact config line for each. Select and run STEP 0 on its own
--   if you want the fuller census.
--
-- WHAT IT TOUCHES
--   public.student_intake only — one row per mock peer, status 'pending',
--   source 'mock_seed'. Nothing else is written.
--
-- WHY student_intake AND NOT student_profile
--   lib/analytics-query.ts aggregates the college over student_profile UNION
--   student_intake (status pending/invited), so intake rows are counted by the
--   charts. Intake needs no auth user, so this creates NO logins, NO invites and
--   NO emails — it cannot let anyone in. student_profile would require real
--   auth.users rows, which is not something to fabricate in a shared database.
--
-- WHY IT IS SAFE TO UNDO
--   Every row is stamped source='mock_seed' and uses @mock.invalid addresses
--   (a reserved TLD that can never receive mail). Teardown is one statement:
--       delete from public.student_intake where source = 'mock_seed';
--
-- IF THE EMAIL IS WRONG
--   Nothing is written. Step 1 is a single INSERT whose source rows are empty when
--   the target does not resolve, so there is no partial state to clean up — and
--   step 2 tells you it seeded nothing.
--
-- WHAT IT DOES NOT DO
--   It does not seed the #73 performance charts (chapter quiz attempts). Those
--   need migrations 154 + 155 on preview first — see the note at the bottom.
--
-- POINT IT AT PREVIEW, NEVER PROD. Check the project ref before running.
--
-- WHAT IT LOOKS LIKE AFTERWARDS (verified on a throwaway cluster, 24 peers)
--   Skills               24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 1
--   Primary career goal  9 / 6 / 4 / 3 / 2   (a dominant slice, not equal thirds)
--   Career goals (all)   24 / 20 / 16 / 12 / 8
--   Radar college avg    3.0 / 4.0 / 2.0 / 3.0 / 4.0 / 2.0 per axis
--   The per-axis spread matters: a uniform jitter averaged to exactly 3.50 on
--   every axis, i.e. a regular hexagon with nothing to compare against.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 — RUN THIS FIRST, ON ITS OWN. It prints the exact line to paste into
-- STEP 1, and it works even when the tables are empty.
--
-- "NOTHING SEEDED" means the config in STEP 1 did not resolve to a college. The
-- causes are: the placeholder was never edited; the email is not the one on the
-- account; app_user.email is NULL (it is a nullable mirror of the auth record);
-- the student has no college_id; or there are no colleges at all. This tells you
-- which.
-- ─────────────────────────────────────────────────────────────────────────────

-- 0a. Census — what actually exists in this database.
select 'colleges'          as table_name, count(*) as rows from public.college
union all select 'student_profile',        count(*) from public.student_profile
union all select 'student_profile w/ college', count(*) from public.student_profile where college_id is not null
union all select 'student_intake',         count(*) from public.student_intake
union all select 'mock peers already seeded', count(*) from public.student_intake where source = 'mock_seed'
order by 1;

-- 0b. Candidate targets, best first, with the literal to paste into STEP 1.
-- Any college works — peers are seeded into a college, not into a student — so if
-- 0a shows colleges but no student profiles, pick from this list anyway.
select
  co.name                                             as college_name,
  count(p.user_id)                                    as students,
  count(u.email)                                      as students_with_email,
  min(u.email)                                        as an_email_you_could_use,
  format('    %L::text as target_college_name,', co.name) as paste_this_into_step_1
from public.college co
left join public.student_profile p on p.college_id = co.id
left join public.app_user u        on u.id = p.user_id
group by co.id, co.name
order by count(p.user_id) desc, co.name
limit 25;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — seed. You MUST edit the config below; unedited it seeds nothing on
-- purpose. Paste the target_college_name line that STEP 0b printed.
-- ─────────────────────────────────────────────────────────────────────────────
with config as (
  select
    -- Set EITHER of these; the college name wins if both are given and is the
    -- reliable one (app_user.email is nullable, so an email lookup can miss even
    -- when the student exists). STEP 0b prints the exact line to paste here.
    -- Leaving both as shipped resolves to nothing and seeds nothing, by design.
    null::text                    as target_email,
    'SEETHARAMA DEGREE COLLEGE'::text as target_college_name,  -- <- change to retarget
    24::int                       as peer_count
),
-- Resolve by college name when given.
by_college as (
  select co.id as college_id
  from public.college co, config c
  where c.target_college_name is not null
    -- trim + case-insensitive: a name copied out of the console often carries
    -- leading or trailing whitespace, which an exact match would silently miss
    and lower(btrim(co.name)) = lower(btrim(c.target_college_name))
  limit 1
),
-- Otherwise resolve through the student's email.
by_email as (
  select p.college_id
  from public.student_profile p
  join public.app_user u on u.id = p.user_id
  cross join config c
  where c.target_email is not null
    and lower(u.email) = lower(c.target_email)
    and p.college_id is not null
  limit 1
),
-- Resolving to no row is the safety mechanism: the INSERT then cross-joins an
-- empty set and writes nothing.
target as (
  select coalesce(
           (select college_id from by_college),
           (select college_id from by_email)
         ) as college_id
  where coalesce(
          (select college_id from by_college),
          (select college_id from by_email)
        ) is not null
),
-- Ranked reference data, so the seed uses this database's real slugs and ids
-- rather than hardcoded UUIDs that would differ between projects.
skills as (
  select slug,
         row_number() over (order by sort_order, slug) as rn,
         count(*)     over ()                         as total
  from public.ref_skill
),
goals as (
  select id,
         row_number() over (order by sort_order, label) as rn,
         count(*)     over ()                          as total
  from public.ref_career_goal
),
cats as (
  select slug, row_number() over (order by sort_order, slug) as rn
  from public.ref_skill_assessment_category
),
peers as (
  select i from config c, generate_series(1, c.peer_count) as g(i)
)
insert into public.student_intake
  (email, full_name, college_id, status, source,
   skills, career_goal_ids, primary_career_goal_id, skill_assessment)
select
  format('mock-peer-%s@mock.invalid', lpad(p.i::text, 2, '0')),
  format('Mock Peer %s', lpad(p.i::text, 2, '0')),
  t.college_id,
  'pending',
  'mock_seed',
  -- Descending ramp across however many skills this database has: #1 is held by
  -- every peer, the last by one. A fixed step of 2 was tuned for ~14 skills and
  -- collapsed everything past #12 to a single student once ref_skill grew to 53.
  coalesce((
    select array_agg(s.slug order by s.rn)
    from skills s, config c
    where p.i <= greatest(1, ceil(c.peer_count * (1.0 - (s.rn - 1)::numeric / s.total)))
  ), '{}'),
  -- "All goals" needs its OWN uneven shape, not the same count for every goal:
  -- picking two neighbours by modulo gave 10/10/10/9/9, which is the flat donut
  -- this seed exists to avoid. Same adaptive ramp as skills.
  coalesce((
    select array_agg(g.id order by g.rn)
    from goals g, config c
    where p.i <= greatest(1, ceil(c.peer_count * (1.0 - (g.rn - 1)::numeric / g.total)))
  ), '{}'),
  -- uneven split so the primary-goal donut has a dominant slice
  (select g.id from goals g
    where g.rn = case
                   when p.i <= 9  then 1
                   when p.i <= 15 then 2
                   when p.i <= 19 then 3
                   when p.i <= 22 then 4
                   else 5
                 end
    limit 1),
  -- 1-5 self-assessment. The jitter must be centred on a DIFFERENT base per axis:
  -- a uniform 2 + ((i + rn) % 4) averaged to exactly 3.50 on every axis over 24
  -- peers, i.e. a perfectly regular hexagon with nothing to compare against.
  -- Base cycles 3/4/2 by axis, jitter +/-1 by peer, clamped to the 1-5 scale.
  coalesce((
    select jsonb_object_agg(
      c2.slug,
      least(5, greatest(1, (2 + (c2.rn % 3)) + ((p.i + c2.rn) % 3) - 1))
    )
    from cats c2
  ), '{}'::jsonb)
from peers p
cross join target t                 -- no target row => nothing inserted
on conflict (lower(email)) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — the report. This is the LAST statement on purpose: the Supabase SQL
-- editor only displays the final result set, so anything diagnostic printed
-- earlier is executed and then discarded. If the seed found no college, this
-- lists the colleges that DO have students, each with the line to paste into the
-- STEP 1 config — so running the whole file at once still tells you what to fix.
-- ─────────────────────────────────────────────────────────────────────────────
select 'SEEDED'::text as status,
       count(*) || ' mock peers present. Re-running step 1 is a no-op.' as detail,
       null::text as paste_this_into_step_1
from public.student_intake
where source = 'mock_seed'
having count(*) > 0

union all

select 'NOTHING SEEDED — paste one of these into STEP 1',
       co.name || '  (' || count(p.user_id) || ' student' ||
         case when count(p.user_id) = 1 then '' else 's' end || ')',
       format('    %L::text as target_college_name,', co.name)
from public.college co
join public.student_profile p on p.college_id = co.id
where (select count(*) from public.student_intake where source = 'mock_seed') = 0
group by co.id, co.name
order by 1, 2
limit 10;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 (optional) — see what the charts will now aggregate
-- ─────────────────────────────────────────────────────────────────────────────
-- select s.label, count(*) as students
-- from public.student_intake i, unnest(i.skills) sk
-- join public.ref_skill s on s.slug = sk
-- where i.source = 'mock_seed'
-- group by s.label, s.sort_order
-- order by students desc, s.sort_order;


-- ============================================================================
-- TEARDOWN — removes every trace
--   delete from public.student_intake where source = 'mock_seed';
--
-- THE #73 PERFORMANCE CHARTS ARE NOT COVERED BY THIS SCRIPT
--   They read chapter_quiz_attempt via student_mastery_grid /
--   student_subject_scores / student_study_plan, which only exist once migrations
--   154 and 155 are applied. Preview gets those on merge to main
--   (migrate-preview.yml). Seeding attempts also means writing rows that look
--   like real submitted assessments for a real student — a heavier decision than
--   adding intake peers, and worth doing as a separate explicit step.
-- ============================================================================
