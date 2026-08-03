-- ============================================================================
-- 156_study_plan_readable.sql
-- The ladder was arithmetically correct and communicatively useless. On a real
-- preview student (2 assessed chapters: 100% and 33%; 2 never attempted; the 33%
-- one has all 3 attempts spent) it rendered four identical 67% bars, said "+0 pts"
-- three times, claimed "you've passed everything you've attempted" while a chapter
-- sat below its pass mark, and concluded 80% was out of reach when in fact the
-- student's ceiling is 83%.
--
-- Three fixes, all in student_study_plan:
--
--  1) UNATTEMPTED CHAPTERS ARE ASSUMED AT THE TARGET, not at the current average.
--     Assuming a new chapter scores exactly the current average makes that rung add
--     precisely zero by construction — the arithmetic is unarguable and the advice
--     is worthless, which is the worst combination. A student sitting a new chapter
--     is aiming at their target, so that is the assumption to state. With no target
--     set it still falls back to the current average.
--
--  2) NEW: blocked_chapters — assessed, below its own pass mark, and out of
--     attempts. The old copy inferred "you passed everything" from
--     clear_below_pass = 0, but that count deliberately excludes chapters with no
--     attempts left, so a failed-and-locked chapter produced a false statement.
--     Now it is counted separately and can be named honestly.
--
--  3) NEW: ceiling_avg — the highest average still reachable: 100% on everything
--     retakeable or unattempted, and the existing best on anything locked. This is
--     the single most useful number for the student in the example above (83%),
--     because it explains WHY a target is or is not reachable instead of just
--     asserting it.
--
-- Read-only, self-only (auth.uid()), SECURITY DEFINER — same as 147/153/154/155.
-- ============================================================================

begin;

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
  rows as (
    select bc.chapter_id,
           max(bc.chapter_name)  as chapter_name,
           max(bs.subject_name)  as subject_name,
           max(a.best_pct)       as best_pct,
           min(coalesce(a.used, 0))                       as used,
           greatest(0, 3 - min(coalesce(a.used, 0)))       as remaining,
           max(coalesce(cq.pass_pct, 40))                 as pass_pct,
           coalesce(bool_or(a.passed), false)             as passed
    from public.batch_chapter bc
    join my_batches mb           on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    left join agg a              on a.batch_id = bc.batch_id and a.chapter_id = bc.chapter_id
    left join public.chapter_quiz cq on cq.chapter_id = bc.chapter_id and cq.status = 'active'
    where bc.status = 'completed'
    group by bc.chapter_id
  ),
  base as (
    select
      sum(best_pct) filter (where best_pct is not null)          as assessed_sum,
      count(*) filter (where best_pct is not null)               as n_assessed,
      count(*) filter (where best_pct is null and remaining > 0) as n_attemptable,
      avg(best_pct) filter (where best_pct is not null)          as current_avg,
      -- (2) failed and out of attempts: not a lever, but it must be said out loud
      count(*) filter (where best_pct is not null and best_pct < pass_pct and remaining = 0)
                                                                 as blocked_chapters,
      -- (3) the ceiling: 100 on anything still actionable, the existing best on
      -- anything locked. Unattempted-and-out-of-attempts can never be scored, so it
      -- is excluded from both numerator and denominator, matching n below.
      sum(case when remaining > 0 then 100 else best_pct end)
        filter (where best_pct is not null or remaining > 0)      as ceiling_sum
    from rows
  ),
  denom as (
    select coalesce(n_assessed, 0) + coalesce(n_attemptable, 0) as n, current_avg,
           coalesce(assessed_sum, 0) as assessed_sum, coalesce(n_assessed, 0) as n_assessed,
           coalesce(n_attemptable, 0) as n_attemptable,
           coalesce(blocked_chapters, 0) as blocked_chapters,
           coalesce(ceiling_sum, 0) as ceiling_sum
    from base
  ),
  -- (1) unattempted chapters are assumed at the TARGET when one is set
  step1 as (
    select assessed_sum
             + n_attemptable * coalesce(p_target, current_avg, 0) as total,
           n
    from denom
  ),
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
    where running - lift < greatest(0, p_target * (select n from step2) - (select total from step2))
  ),
  step3 as (
    select (select total from step2) + coalesce((select sum(lift) from step3_rows), 0) as total,
           (select n from step2) as n,
           (select count(*) from step3_rows)::int as chapters
  ),
  proj as (
    select
      round(avg(best_pct), 2)                          as current_avg,
      round(avg(greatest(best_pct, pass_pct)), 2)       as projected_avg,
      count(*) filter (where best_pct < pass_pct)::int  as chapters_to_lift,
      -- how many of those can actually be retaken; the rest are blocked
      count(*) filter (where best_pct < pass_pct and remaining > 0)::int as liftable_chapters
    from rows
    where best_pct is not null
  ),
  plan_rows as (
    select r.chapter_id, r.chapter_name, r.subject_name, r.best_pct, r.used, r.remaining, r.pass_pct,
           case
             when r.best_pct is null then 'not_attempted'
             when r.passed then 'below_target'
             when r.best_pct >= r.pass_pct * 0.8 and r.remaining > 0 then 'quick_win'
             else 'needs_study'
           end as category,
           case
             when r.remaining = 0 then 0
             when r.best_pct is null then 0
             when (select n_assessed from denom) = 0 then 0
             else round(
               greatest(0, greatest(coalesce(p_target, r.pass_pct), r.pass_pct) - r.best_pct)
               / (select n_assessed from denom), 2)
           end as points_to_target,
           case
             when r.best_pct is not null and not r.passed
                  and r.best_pct >= r.pass_pct * 0.8 and r.remaining > 0 then 0
             when r.passed then 1
             when r.best_pct is null then 2
             else 3
           end as sort_bucket
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
          order by sort_bucket, points_to_target desc, subject_name, chapter_name)
        from plan_rows
      ), '[]'::jsonb),
    'projection',
      jsonb_build_object(
        'target',            p_target,
        'current_avg',       (select current_avg from proj),
        'projected_avg',     (select projected_avg from proj),
        'chapters_to_lift',  coalesce((select chapters_to_lift from proj), 0),
        'liftable_chapters', coalesce((select liftable_chapters from proj), 0),
        'blocked_chapters',  (select blocked_chapters from denom),
        'ceiling_avg',       case when (select n from denom) = 0 then null
                                  else round((select ceiling_sum from denom)
                                             / (select n from denom), 2) end,
        'gap_to_target',     case when p_target is null then null
                                  else round(p_target - coalesce((select current_avg from proj), 0), 2) end,
        'reaches_target',    case when p_target is null then null
                                  else coalesce((select projected_avg from proj), 0) >= p_target end),
    'ladder',
      case when (select n from denom) = 0 then '[]'::jsonb else
      jsonb_build_array(
        jsonb_build_object(
          'key', 'today', 'chapters', (select n_assessed from denom), 'assumed_pct', null,
          'avg', round(coalesce((select current_avg from denom), 0), 2)),
        jsonb_build_object(
          'key', 'attempt_unassessed', 'chapters', (select n_attemptable from denom),
          'assumed_pct', coalesce(p_target, round(coalesce((select current_avg from denom), 0), 2)),
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

grant execute on function public.student_study_plan(uuid, integer) to authenticated;

commit;
