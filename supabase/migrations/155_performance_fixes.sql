-- ============================================================================
-- 155_performance_fixes.sql
-- Corrects four defects introduced by 154 (found in review of #73 phase 2).
-- Forward-only: 154 has already been applied, so these are replacements rather
-- than edits to that file.
--
--  1) student_chapter_scores.attempts_remaining was derived from a DATE-WINDOWED
--     attempt count, while the 3-attempt cap is lifetime and per (batch, chapter)
--     — see start_chapter_quiz_attempt (143), which counts submitted attempts with
--     no date filter, and student_chapter_quizzes, which reports
--     greatest(0, 3 - used) the same way. A chapter whose 3 attempts all fell
--     outside the selected range came back "0 used / 3 remaining", so the UI
--     invited a retake the server refuses. Attempt counts are now unwindowed;
--     only the SCORES stay windowed (that is what a range filter is for).
--     The cap is also per batch, so a chapter shared by two batches reports the
--     most attemptable batch — that is the one an action can actually use.
--
--  2) student_subject_scores exposed pass_pct as round(avg(pass_pct)) across the
--     subject's chapters. There is no such thing as a subject pass mark anywhere
--     in this schema (chapter_quiz is one row per chapter, pass_pct default 40 and
--     freely settable), and averaging marks invented one: a subject with marks
--     40/40/80 and scores 45/45/60 got pass_pct 53 and was painted "below pass"
--     despite passing two of three chapters. Replaced with facts the schema
--     actually has: pass_pct_min, pass_pct_max, and chapters_below_pass — each
--     chapter compared with ITS OWN mark.
--
--  3) student_mastery_grid used `select distinct` over a list that included the
--     per-(batch,subject) columns bc.sort_order / bc.chapter_name /
--     bs.sort_order / bs.subject_name, so it could not collapse a chapter shared
--     by two batches — the grid rendered the chapter twice and the column
--     numbering desynchronised. Now aggregates per chapter explicitly.
--
--  4) student_study_plan:
--       - ordering had been changed to points_to_target desc, which is monotonic
--         in the score gap and therefore put the LEAST achievable chapters first
--         and pushed quick wins off the end of the rendered list. Achievability
--         is the primary key again (FR-8: "so effort goes where it pays"), with
--         points_to_target as the tiebreak inside each bucket.
--       - points_to_target divided the lift by the ladder denominator (assessed +
--         attemptable) while the average on screen is over ASSESSED chapters, so
--         the per-row points never reconciled with the ladder's gains. Now divided
--         by the assessed count. For an unassessed chapter, attempting it moves
--         numerator AND denominator, so no single division states its effect
--         honestly — those rows return 0 and the UI shows the coverage message.
--
-- Also corrects a claim in 154's header: the ladder's "today" rung is NOT
-- summary.overall_pct. The plan is deliberately not date-filtered ("what should I
-- do next" is not a question about a window), so its baseline is all-time while
-- the tiles obey the range filter. The UI now says so instead of implying they match.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Chapter scores: windowed scores, lifetime attempt counts.
-- ----------------------------------------------------------------------------
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
  -- SCORES: windowed, because the range filter is a question about scores.
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
    select bc.batch_id, bc.chapter_id, bc.chapter_name, bc.sort_order,
           coalesce(cq.pass_pct, 40) as pass_pct
    from public.batch_chapter bc
    join my_batches mb on mb.batch_id = bc.batch_id
    left join public.chapter_quiz cq on cq.chapter_id = bc.chapter_id and cq.status = 'active'
    where bc.subject_id = p_subject and bc.status = 'completed'
  ),
  -- ATTEMPT COUNTS: never windowed, and per (batch, chapter) because that is the
  -- grain the cap is enforced at.
  used_per_batch as (
    select chs.batch_id, chs.chapter_id,
           count(*) filter (where qa.status = 'submitted')::int as used
    from chs
    left join public.chapter_quiz_attempt qa
           on qa.batch_id = chs.batch_id and qa.chapter_id = chs.chapter_id
          and qa.student_id = auth.uid()
    group by chs.batch_id, chs.chapter_id
  ),
  -- One row per chapter. min(used) pairs with max(remaining): the batch where a
  -- retake is still possible is the one the student can act in.
  attempts as (
    select chapter_id, min(used)::int as used, greatest(0, 3 - min(used))::int as remaining
    from used_per_batch group by chapter_id
  ),
  chapter_rows as (
    select chapter_id, max(chapter_name) as chapter_name,
           min(sort_order) as sort_order, max(pass_pct) as pass_pct
    from chs group by chapter_id
  )
  select c.chapter_id, c.chapter_name,
         max(a.pct),
         (array_agg(a.pct order by a.attempt_no))[1],
         coalesce(t.used, 0),
         coalesce(t.remaining, 3),
         c.pass_pct::int,
         bool_or(a.passed)
  from chapter_rows c
  left join atts a     on a.chapter_id = c.chapter_id
  left join attempts t on t.chapter_id = c.chapter_id
  group by c.chapter_id, c.chapter_name, c.sort_order, c.pass_pct, t.used, t.remaining
  order by c.sort_order, c.chapter_name;
$$;

-- ----------------------------------------------------------------------------
-- 2) Subject scores: real pass-mark facts instead of an invented average mark.
-- ----------------------------------------------------------------------------
drop function if exists public.student_subject_scores(date, date, uuid);

create or replace function public.student_subject_scores(
  p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  subject_id          uuid,
  subject_name        text,
  score_pct           numeric,
  chapters_assessed   int,
  chapters_completed  int,
  pass_pct_min        int,
  pass_pct_max        int,
  chapters_below_pass int
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
  -- one row per (subject, chapter): a chapter shared by two of the student's
  -- batches must not count twice toward the averages or the counts
  chapters as (
    select bc.subject_id, max(bs.subject_name) as subject_name, bc.chapter_id,
           max(b.best_pct) as best_pct,
           max(coalesce(cq.pass_pct, 40)) as pass_pct
    from public.batch_chapter bc
    join my_batches mb           on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    left join best b             on b.batch_id = bc.batch_id and b.chapter_id = bc.chapter_id
    left join public.chapter_quiz cq on cq.chapter_id = bc.chapter_id and cq.status = 'active'
    where bc.status = 'completed'
    group by bc.subject_id, bc.chapter_id
  )
  select subject_id, max(subject_name),
         round(avg(best_pct) filter (where best_pct is not null), 2),
         count(*) filter (where best_pct is not null)::int,
         count(*)::int,
         min(pass_pct)::int,
         max(pass_pct)::int,
         -- each chapter against ITS OWN mark
         count(*) filter (where best_pct is not null and best_pct < pass_pct)::int
  from chapters
  group by subject_id
  order by max(subject_name);
$$;

-- ----------------------------------------------------------------------------
-- 3) Mastery grid: one row per chapter, whatever the batch overlap.
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
  -- Aggregate per (subject, chapter) rather than relying on `select distinct`:
  -- sort_order and the denormalised names are per (batch, subject), so a DISTINCT
  -- over them cannot collapse a chapter that two of the student's batches share.
  chs as (
    select bc.subject_id, bc.chapter_id,
           max(bs.subject_name)  as subject_name,
           max(bc.chapter_name)  as chapter_name,
           min(bs.sort_order)    as subject_order,
           min(bc.sort_order)    as chapter_order
    from public.batch_chapter bc
    join my_batches mb           on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    where bc.status = 'completed'
    group by bc.subject_id, bc.chapter_id
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
-- 4) Study plan: achievability-first ordering, reconciling points_to_target.
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
  -- One row per chapter (not per batch-chapter), so a shared chapter is a single
  -- focus item and is counted once in every average below.
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
      avg(best_pct) filter (where best_pct is not null)          as current_avg
    from rows
  ),
  denom as (
    select coalesce(n_assessed, 0) + coalesce(n_attemptable, 0) as n, current_avg,
           coalesce(assessed_sum, 0) as assessed_sum, coalesce(n_assessed, 0) as n_assessed,
           coalesce(n_attemptable, 0) as n_attemptable
    from base
  ),
  step1 as (
    select assessed_sum + n_attemptable * coalesce(current_avg, 0) as total, n from denom
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
      count(*) filter (where best_pct < pass_pct)::int  as chapters_to_lift
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
           -- Reconciles with the overall average the student sees, which is over
           -- ASSESSED chapters. An unassessed chapter changes the denominator too,
           -- so no single division states its effect honestly — it returns 0 and
           -- the UI shows the coverage message instead of a points figure.
           case
             when r.remaining = 0 then 0
             when r.best_pct is null then 0
             when (select n_assessed from denom) = 0 then 0
             else round(
               greatest(0, greatest(coalesce(p_target, r.pass_pct), r.pass_pct) - r.best_pct)
               / (select n_assessed from denom), 2)
           end as points_to_target,
           -- Achievability first. Ranking purely by points is monotonic in the
           -- score gap, which buries the retakes that would actually clear a pass
           -- under chapters the student has no realistic shot at this week.
           case
             when r.best_pct is not null and not r.passed
                  and r.best_pct >= r.pass_pct * 0.8 and r.remaining > 0 then 0  -- quick win
             when r.passed then 1                                                -- below target
             when r.best_pct is null then 2                                       -- not attempted
             else 3                                                               -- needs study
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

grant execute on function public.student_chapter_scores(uuid, date, date, uuid)  to authenticated;
grant execute on function public.student_subject_scores(date, date, uuid)        to authenticated;
grant execute on function public.student_mastery_grid(date, date, uuid)          to authenticated;
grant execute on function public.student_study_plan(uuid, integer)               to authenticated;

commit;
