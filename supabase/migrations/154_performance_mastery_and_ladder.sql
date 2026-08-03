-- ============================================================================
-- 154_performance_mastery_and_ladder.sql
-- Phase 2 of the student progress-analytics story (#73). Three changes, all
-- read-only / self-only (SECURITY DEFINER on auth.uid()) — same pattern as 147/153.
--
--  1) student_mastery_grid(p_from, p_to, p_batch) — NEW. The FR-5 subject × chapter
--     heatmap: one row per completed chapter across every subject, in syllabus
--     order, with the best score and that chapter's pass mark. This is
--     student_chapter_scores without the p_subject filter; it was specified in §6
--     of the story and never built.
--
--  2) pass_pct on student_subject_scores + student_chapter_scores. The charts drew
--     their reference line from a hardcoded 40 in the client while chapter_quiz.pass_pct
--     is per-quiz, so a chapter with a 50% pass mark and a 45% score rendered as
--     passing. Chapter rows carry their own pass mark; a subject row carries the
--     average of its chapters' marks plus pass_pct_mixed so the UI can say
--     "avg pass mark" when its chapters disagree.
--
--  3) student_study_plan gains points_to_target per item and a `ladder` — the
--     ordered, transparent route from today's average to the student's target:
--       today → attempt the unassessed → clear the below-pass → push the rest up.
--     The 153 pass-mark projection is UNCHANGED and still returned, as the
--     pessimistic floor shown beside the ladder.
--     The quick-win cut also tightens from pass_pct * 0.6 to * 0.8: at the default
--     40% pass mark 0.6 called a 29% score a "quick win" (11 points short), which is
--     not what FR-8 means by "a retake likely clears them".
--     Only chapters with attempts_remaining > 0 can be lifted — a chapter with all
--     3 attempts used is not a lever, and promising points from it would be a lie.
--
-- The (student_id, chapter_id, submitted_at) index the story asked for already
-- exists (chapter_quiz_attempt_student_idx, migration 143).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) FR-5 mastery grid: every completed chapter, every subject, syllabus order.
-- ----------------------------------------------------------------------------
create or replace function public.student_mastery_grid(
  p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  subject_id     uuid,
  subject_name   text,
  chapter_id     uuid,
  chapter_name   text,
  best_pct       numeric,
  pass_pct       int,
  attempts_used  int
)
language sql
stable
security definer
set search_path = public
as $$
  with my_batches as (
    select e.batch_id from public.student_enrollment e
    where e.student_id = auth.uid() and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  atts as (
    select qa.chapter_id,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2)) as best_pct,
           count(*)::int                                             as used
    from public.chapter_quiz_attempt qa
    join my_batches mb on mb.batch_id = qa.batch_id
    where qa.student_id = auth.uid() and qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
    group by qa.chapter_id
  ),
  -- distinct so a chapter shared by two of the student's batches appears once
  chs as (
    select distinct bc.subject_id, bs.subject_name, bs.sort_order as subject_order,
           bc.chapter_id, bc.chapter_name, bc.sort_order as chapter_order
    from public.batch_chapter bc
    join my_batches mb           on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    where bc.status = 'completed'
  )
  select chs.subject_id, chs.subject_name, chs.chapter_id, chs.chapter_name,
         a.best_pct,
         coalesce(cq.pass_pct, 40)::int,
         coalesce(a.used, 0)
  from chs
  left join atts a                 on a.chapter_id = chs.chapter_id
  left join public.chapter_quiz cq  on cq.chapter_id = chs.chapter_id and cq.status = 'active'
  order by chs.subject_order, chs.subject_name, chs.chapter_order, chs.chapter_name;
$$;

-- ----------------------------------------------------------------------------
-- 2) pass_pct on the subject + chapter score RPCs. create-or-replace cannot
--    widen a function's return type, so drop first (as 153 did).
-- ----------------------------------------------------------------------------
drop function if exists public.student_subject_scores(date, date, uuid);

create or replace function public.student_subject_scores(
  p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  subject_id         uuid,
  subject_name       text,
  score_pct          numeric,
  chapters_assessed  int,
  chapters_completed int,
  pass_pct           int,
  pass_pct_mixed     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with my_batches as (
    select e.batch_id from public.student_enrollment e
    where e.student_id = auth.uid() and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  best as (
    select qa.batch_id, qa.chapter_id,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2)) as best_pct
    from public.chapter_quiz_attempt qa
    where qa.student_id = auth.uid() and qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
    group by qa.batch_id, qa.chapter_id
  ),
  chapters as (
    select bc.subject_id, bs.subject_name, b.best_pct,
           coalesce(cq.pass_pct, 40) as pass_pct
    from public.batch_chapter bc
    join my_batches mb           on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    left join best b             on b.batch_id = bc.batch_id and b.chapter_id = bc.chapter_id
    left join public.chapter_quiz cq on cq.chapter_id = bc.chapter_id and cq.status = 'active'
    where bc.status = 'completed'
  )
  select subject_id, max(subject_name),
         round(avg(best_pct) filter (where best_pct is not null), 2),
         count(*) filter (where best_pct is not null)::int,
         count(*)::int,
         round(avg(pass_pct))::int,
         count(distinct pass_pct) > 1
  from chapters
  group by subject_id
  order by max(subject_name);
$$;

drop function if exists public.student_chapter_scores(uuid, date, date, uuid);

create or replace function public.student_chapter_scores(
  p_subject uuid, p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  chapter_id         uuid,
  chapter_name       text,
  best_pct           numeric,
  first_pct          numeric,
  attempts_used      int,
  attempts_remaining int,
  pass_pct           int,
  passed             boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with my_batches as (
    select e.batch_id from public.student_enrollment e
    where e.student_id = auth.uid() and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  atts as (
    select qa.chapter_id, qa.attempt_no, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join my_batches mb on mb.batch_id = qa.batch_id
    where qa.student_id = auth.uid() and qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  ),
  chs as (
    select distinct bc.chapter_id, bc.chapter_name, bc.sort_order,
           coalesce(cq.pass_pct, 40) as pass_pct
    from public.batch_chapter bc
    join my_batches mb on mb.batch_id = bc.batch_id
    left join public.chapter_quiz cq on cq.chapter_id = bc.chapter_id and cq.status = 'active'
    where bc.subject_id = p_subject and bc.status = 'completed'
  )
  select chs.chapter_id, chs.chapter_name,
         max(a.pct),
         (array_agg(a.pct order by a.attempt_no))[1],
         count(a.pct)::int,
         greatest(0, 3 - count(a.pct))::int,
         chs.pass_pct::int,
         bool_or(a.passed)
  from chs
  left join atts a on a.chapter_id = chs.chapter_id
  group by chs.chapter_id, chs.chapter_name, chs.sort_order, chs.pass_pct
  order by chs.sort_order, chs.chapter_name;
$$;

-- ----------------------------------------------------------------------------
-- 3) study plan: points_to_target per item + the target ladder.
--
-- The ladder is deliberately dumb arithmetic the student can audit. Denominator
-- for every step after the first is `denom` = assessed chapters + the unassessed
-- ones that are still attemptable, because that is the set they'd end the plan
-- having been scored on. Steps, in order:
--   today             avg over assessed chapters                    (= summary.overall_pct)
--   attempt_unassessed the attemptable unassessed ones, at today's average
--   clear_below_pass   below-pass chapters with attempts left, lifted to the target
--                      (or to their pass mark when no target is set)
--   push_to_target     passing-but-below-target chapters, cheapest lift first,
--                      only as many as it takes to reach the target
-- ----------------------------------------------------------------------------
create or replace function public.student_study_plan(
  p_batch uuid default null, p_target int default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with my_batches as (
    select e.batch_id from public.student_enrollment e
    where e.student_id = auth.uid() and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  agg as (
    select qa.batch_id, qa.chapter_id,
           count(*) filter (where qa.status = 'submitted') as used,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2))
             filter (where qa.status = 'submitted') as best_pct,
           bool_or(qa.passed) as passed
    from public.chapter_quiz_attempt qa
    where qa.student_id = auth.uid()
    group by qa.batch_id, qa.chapter_id
  ),
  -- Every completed chapter of the (optionally filtered) batches, with its best
  -- score and pass mark. This is the universe the list, projection and ladder use.
  rows as (
    select bc.chapter_id, bc.chapter_name, bs.subject_name,
           a.best_pct,
           coalesce(a.used, 0) as used,
           greatest(0, 3 - coalesce(a.used, 0)) as remaining,
           coalesce(cq.pass_pct, 40) as pass_pct,
           coalesce(a.passed, false) as passed
    from public.batch_chapter bc
    join my_batches mb           on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    left join agg a              on a.batch_id = bc.batch_id and a.chapter_id = bc.chapter_id
    left join public.chapter_quiz cq on cq.chapter_id = bc.chapter_id and cq.status = 'active'
    where bc.status = 'completed'
  ),
  -- Base quantities. denom is the ladder's denominator (see header).
  base as (
    select
      sum(best_pct) filter (where best_pct is not null)                        as assessed_sum,
      count(*) filter (where best_pct is not null)                             as n_assessed,
      count(*) filter (where best_pct is null and remaining > 0)               as n_attemptable,
      avg(best_pct) filter (where best_pct is not null)                        as current_avg
    from rows
  ),
  denom as (
    select coalesce(n_assessed, 0) + coalesce(n_attemptable, 0) as n, current_avg,
           coalesce(assessed_sum, 0) as assessed_sum, coalesce(n_assessed, 0) as n_assessed,
           coalesce(n_attemptable, 0) as n_attemptable
    from base
  ),
  -- Step 1: attempt the unassessed chapters at the student's current average.
  step1 as (
    select assessed_sum + n_attemptable * coalesce(current_avg, 0) as total, n
    from denom
  ),
  -- Step 2: below-pass chapters that can still be retaken, lifted to the target
  -- (or to their own pass mark when no target was set).
  step2_rows as (
    select r.chapter_id,
           greatest(coalesce(p_target, r.pass_pct), r.pass_pct) - r.best_pct as lift
    from rows r
    where r.best_pct is not null and r.remaining > 0
      and r.best_pct < greatest(coalesce(p_target, r.pass_pct), r.pass_pct)
      and r.best_pct < r.pass_pct
  ),
  step2 as (
    select (select total from step1) + coalesce((select sum(lift) from step2_rows), 0) as total,
           (select n from denom) as n,
           (select count(*) from step2_rows)::int as chapters
  ),
  -- Step 3: chapters already at/above their pass mark but below the target, cheapest
  -- lift first, taking only as many as it takes to close the remaining gap.
  step3_candidates as (
    select r.chapter_id, p_target - r.best_pct as lift,
           sum(p_target - r.best_pct) over (order by (p_target - r.best_pct), r.chapter_id
                                           rows between unbounded preceding and current row) as running
    from rows r
    where p_target is not null and r.best_pct is not null and r.remaining > 0
      and r.best_pct >= r.pass_pct and r.best_pct < p_target
  ),
  step3_rows as (
    select chapter_id, lift from step3_candidates
    -- keep rows until the running total covers the shortfall
    where running - lift < greatest(0, p_target * (select n from step2) - (select total from step2))
  ),
  step3 as (
    select (select total from step2) + coalesce((select sum(lift) from step3_rows), 0) as total,
           (select n from step2) as n,
           (select count(*) from step3_rows)::int as chapters
  ),
  -- 153's projection, unchanged: every unpassed ASSESSED chapter lifted to its pass
  -- mark. Kept as the pessimistic floor shown beside the ladder.
  proj as (
    select
      round(avg(best_pct), 2)                          as current_avg,
      round(avg(greatest(best_pct, pass_pct)), 2)       as projected_avg,
      count(*) filter (where best_pct < pass_pct)::int  as chapters_to_lift
    from rows
    where best_pct is not null
  ),
  -- The focus list. points_to_target is what this one chapter adds to the overall
  -- average if lifted to the target (its pass mark when no target is set) — 0 when
  -- there is no attempt left to act on, because an unactionable chapter is not a lever.
  --
  -- The universe is every chapter the student can still act on that is short of where
  -- they want to be: not yet passed, OR (with a target set) passing but below it — the
  -- latter are exactly the chapters the ladder's push_to_target step spends, so leaving
  -- them out of the list would name steps the student cannot see.
  --
  -- Ranked by points_to_target, not by category: the category is achievability (a chip
  -- the student reads), while the points are impact, and points_to_target is already 0
  -- for anything unactionable. Bucketing first buried the biggest lever under three
  -- quarter-point ones.
  plan_rows as (
    select r.chapter_id, r.chapter_name, r.subject_name, r.best_pct, r.used, r.remaining, r.pass_pct,
           case
             when r.best_pct is null then 'not_attempted'
             when r.passed then 'below_target'
             when r.best_pct >= r.pass_pct * 0.8 and r.remaining > 0 then 'quick_win'
             else 'needs_study'
           end as category,
           case
             when r.remaining = 0 or (select n from denom) = 0 then 0
             else round(
               greatest(0, greatest(coalesce(p_target, r.pass_pct), r.pass_pct)
                           - coalesce(r.best_pct, (select current_avg from denom)))
               / (select n from denom), 2)
           end as points_to_target
    from rows r
    where r.passed = false
       or (p_target is not null and r.best_pct < p_target and r.remaining > 0)
  )
  select jsonb_build_object(
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'chapter_id',         chapter_id,
            'chapter_name',       chapter_name,
            'subject_name',       subject_name,
            'best_pct',           best_pct,
            'attempts_used',      used,
            'attempts_remaining', remaining,
            'pass_pct',           pass_pct,
            'category',           category,
            'points_to_target',   points_to_target)
          order by points_to_target desc, subject_name, chapter_name)
        from plan_rows
      ), '[]'::jsonb),
    'projection',
      jsonb_build_object(
        'target',           p_target,
        'current_avg',      (select current_avg from proj),
        'projected_avg',    (select projected_avg from proj),
        'chapters_to_lift', coalesce((select chapters_to_lift from proj), 0),
        'gap_to_target',    case when p_target is null then null
                                 else round(p_target - coalesce((select current_avg from proj), 0), 2) end,
        'reaches_target',   case when p_target is null then null
                                 else coalesce((select projected_avg from proj), 0) >= p_target end),
    'ladder',
      case when (select n from denom) = 0 then '[]'::jsonb else
      jsonb_build_array(
        jsonb_build_object(
          'key', 'today', 'chapters', (select n_assessed from denom), 'assumed_pct', null,
          'avg', round(coalesce((select current_avg from denom), 0), 2)),
        jsonb_build_object(
          'key', 'attempt_unassessed', 'chapters', (select n_attemptable from denom),
          'assumed_pct', round(coalesce((select current_avg from denom), 0), 2),
          'avg', round((select total from step1) / nullif((select n from step1), 0), 2)),
        jsonb_build_object(
          'key', 'clear_below_pass', 'chapters', (select chapters from step2),
          'assumed_pct', p_target,
          'avg', round((select total from step2) / nullif((select n from step2), 0), 2)),
        jsonb_build_object(
          'key', 'push_to_target', 'chapters', (select chapters from step3),
          'assumed_pct', p_target,
          'avg', round((select total from step3) / nullif((select n from step3), 0), 2))
      ) end
  );
$$;

grant execute on function public.student_mastery_grid(date, date, uuid)          to authenticated;
grant execute on function public.student_subject_scores(date, date, uuid)        to authenticated;
grant execute on function public.student_chapter_scores(uuid, date, date, uuid)  to authenticated;
grant execute on function public.student_study_plan(uuid, integer)               to authenticated;

commit;
