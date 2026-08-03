-- ============================================================================
-- seed-mock-peers.sql — PREVIEW ONLY
--
-- Gives one college enough peers for the "How you compare" charts to show a real
-- distribution instead of the flat n=1 shape (every count 1, so every donut wedge
-- is identical). Read the guardrails before running.
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
-- WHAT IT DOES NOT DO
--   It does not seed the #73 performance charts (chapter quiz attempts). Those
--   need migrations 154 + 155 on preview first — see the note at the bottom.
--
-- HOW TO SET THE TARGET COLLEGE
--   Edit :target_email below to the student whose /student/insights you want to
--   look at. The script reads that student's college and seeds peers into it.
--
-- HOW TO RUN IT
--   psql (supports the \set variable below):
--     psql "$PREVIEW_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seed-mock-peers.sql
--
--   Supabase SQL editor: it does NOT support psql meta-commands, so \set and
--   :'target_email' will error there. Either run it through psql, or replace the
--   two :'target_email' references with a literal 'you@example.com' and delete
--   both \set lines first.
--
--   Point it at PREVIEW, never prod. Verify the project ref before running.
--
-- WHAT IT LOOKS LIKE AFTERWARDS (verified on a throwaway cluster, 24 peers)
--   Skills               24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 1
--   Primary career goal  9 / 6 / 4 / 3 / 2   (a dominant slice, not equal thirds)
--   Career goals (all)   24 / 20 / 16 / 12 / 8
--   Radar college avg    3.0 / 4.0 / 2.0 / 3.0 / 4.0 / 2.0 per axis
--   The per-axis spread matters: a uniform jitter averaged to exactly 3.50 on
--   every axis, i.e. a regular hexagon with nothing to compare against.
-- ============================================================================

begin;

-- ── the one thing you must set ───────────────────────────────────────────────
\set target_email 'CHANGE_ME@example.com'
-- ─────────────────────────────────────────────────────────────────────────────

-- 24 peers is enough for a clean ranked distribution without flooding the college.
\set peer_count 24

-- Resolve the target college into a temp table FIRST. psql does not interpolate
-- :'variables' inside $$-quoted bodies, so the guard cannot read the email
-- directly — it reads this table instead.
create temporary table _seed_target on commit drop as
select p.college_id
from public.student_profile p
join public.app_user u on u.id = p.user_id
where lower(u.email) = lower(:'target_email')
limit 1;

-- Pre-flight, checked BEFORE any write and against the target itself rather than a
-- row count: an earlier version counted existing mock_seed rows afterwards, so a
-- mistyped email silently "passed" whenever a previous seed was still in place.
do $$
declare v_college uuid;
begin
  select college_id into v_college from _seed_target;

  if v_college is null then
    raise exception
      'No college found for that email. Either it has no student_profile, or the profile has no college_id set.';
  end if;

  if not exists (select 1 from public.ref_skill) then
    raise notice 'ref_skill is empty — peers will have no skills and the Skills card stays empty.';
  end if;

  raise notice 'Target college %, seeding into it.', v_college;
end $$;

with target as (
  select college_id from _seed_target
),
-- Ranked reference data, so the seed uses this database's real slugs and ids
-- rather than hardcoded UUIDs that would differ per project.
skills as (
  select slug, row_number() over (order by sort_order, slug) as rn
  from public.ref_skill
),
goals as (
  select id, row_number() over (order by sort_order, label) as rn,
         count(*) over () as total
  from public.ref_career_goal
),
cats as (
  select slug, row_number() over (order by sort_order, slug) as rn
  from public.ref_skill_assessment_category
),
peers as (
  select i from generate_series(1, :peer_count) as g(i)
)
insert into public.student_intake
  (email, full_name, college_id, status, source,
   skills, career_goal_ids, primary_career_goal_id, skill_assessment)
select
  format('mock-peer-%s@mock.invalid', lpad(p.i::text, 2, '0')),
  format('Mock Peer %s', lpad(p.i::text, 2, '0')),
  (select college_id from target),
  'pending',
  'mock_seed',
  -- Descending staircase: skill #1 is held by every peer, #2 by two fewer, and so
  -- on. Produces the ranked shape the bars are meant to show, deterministically.
  coalesce((
    select array_agg(s.slug order by s.rn)
    from skills s
    where p.i <= greatest(1, :peer_count - (s.rn - 1) * 2)
  ), '{}'),
  -- "All goals" needs its OWN uneven shape, not the same count for every goal:
  -- picking two neighbours by modulo gave 10/10/10/9/9, which is the flat donut
  -- this seed exists to avoid. Staircase again, wider steps than skills.
  coalesce((
    select array_agg(g.id order by g.rn)
    from goals g
    where p.i <= greatest(2, :peer_count - (g.rn - 1) * 4)
  ), '{}'),
  (select g.id from goals g
    -- uneven split so the donut has a dominant slice rather than equal thirds
    where g.rn = case
                   when p.i <= 9  then 1
                   when p.i <= 15 then 2
                   when p.i <= 19 then 3
                   when p.i <= 22 then 4
                   else 5
                 end
    limit 1),
  -- 1–5 self-assessment. The jitter must be centred on a DIFFERENT base per axis:
  -- a uniform 2 + ((i + rn) % 4) averaged to exactly 3.50 on every axis over 24
  -- peers, i.e. a perfectly regular hexagon with nothing to compare against.
  -- Base cycles 3/4/2 by axis, jitter ±1 by peer, clamped to the 1–5 scale.
  coalesce((
    select jsonb_object_agg(
      c.slug,
      least(5, greatest(1, (2 + (c.rn % 3)) + ((p.i + c.rn) % 3) - 1))
    )
    from cats c
  ), '{}'::jsonb)
from peers p
where (select college_id from target) is not null
on conflict (lower(email)) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.student_intake where source = 'mock_seed';
  raise notice '% mock peers now present (re-running this script is a no-op).', n;
end $$;

commit;

-- ============================================================================
-- TEARDOWN (run this to remove every trace)
--   delete from public.student_intake where source = 'mock_seed';
--
-- VERIFY what the charts will now aggregate
--   select unnest(skills) as skill, count(*)
--   from public.student_intake where source = 'mock_seed'
--   group by 1 order by 2 desc;
--
-- THE #73 PERFORMANCE CHARTS ARE NOT COVERED BY THIS SCRIPT
--   They read chapter_quiz_attempt via student_mastery_grid / student_subject_scores
--   / student_study_plan, which only exist once migrations 154 and 155 are applied.
--   Preview gets those on merge to main (migrate-preview.yml). Seeding attempts
--   also means writing rows that look like real submitted assessments for a real
--   student, which is a heavier decision than adding intake peers — worth doing as
--   a separate, explicit step.
-- ============================================================================
