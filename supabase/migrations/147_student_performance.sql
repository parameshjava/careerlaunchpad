-- ============================================================================
-- 147_student_performance.sql
-- Read-only aggregation RPCs for the student progress-analytics view (story #73).
-- No new tables — these summarise chapter_quiz_attempt (migration 143) for the
-- CALLING student only (SECURITY DEFINER, every query filtered on auth.uid()).
--
-- Locked decisions: a chapter's score = the student's BEST submitted attempt (Q12);
-- chapters with no submitted attempt are EXCLUDED from score averages and surfaced
-- separately as coverage (Q14). "Completed" chapters (batch_chapter.status) are the
-- universe; a quiz is only takeable once its chapter is completed.
--
-- Common shape: enrolled batches (optionally one) → completed batch_chapter rows →
-- best submitted attempt per (batch, chapter). Percent = 100*score/total_marks.
-- Idempotent (create or replace).
-- ============================================================================

begin;

-- 1) Snapshot tiles: overall average, pass rate, coverage counts, strongest/weakest.
create or replace function public.student_performance_summary(
  p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  overall_pct       numeric,
  pass_rate_pct     numeric,
  chapters_assessed int,
  chapters_completed int,
  strongest_subject text,
  strongest_pct     numeric,
  weakest_subject   text,
  weakest_pct       numeric
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
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2)) as best_pct,
           bool_or(qa.passed) as best_passed
    from public.chapter_quiz_attempt qa
    where qa.student_id = auth.uid() and qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
    group by qa.batch_id, qa.chapter_id
  ),
  chapters as (
    select bc.subject_id, bs.subject_name, b.best_pct, b.best_passed
    from public.batch_chapter bc
    join my_batches mb          on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    left join best b             on b.batch_id = bc.batch_id and b.chapter_id = bc.chapter_id
    where bc.status = 'completed'
  ),
  by_subject as (
    select subject_id, max(subject_name) as sn,
           avg(best_pct) filter (where best_pct is not null) as sp
    from chapters group by subject_id
  )
  select
    round(avg(best_pct) filter (where best_pct is not null), 2),
    round(100.0 * count(*) filter (where best_passed) / nullif(count(*) filter (where best_pct is not null), 0), 2),
    count(*) filter (where best_pct is not null)::int,
    count(*)::int,
    (select sn from by_subject where sp is not null order by sp desc, sn limit 1),
    (select round(sp, 2) from by_subject where sp is not null order by sp desc, sn limit 1),
    (select sn from by_subject where sp is not null order by sp asc, sn limit 1),
    (select round(sp, 2) from by_subject where sp is not null order by sp asc, sn limit 1)
  from chapters;
$$;

-- 2) Per-subject scores (the strengths/weaknesses bar chart). score_pct averages
--    only ASSESSED chapters (Q14); chapters_completed is the coverage denominator.
create or replace function public.student_subject_scores(
  p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  subject_id         uuid,
  subject_name       text,
  score_pct          numeric,
  chapters_assessed  int,
  chapters_completed int
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
    select bc.subject_id, bs.subject_name, b.best_pct
    from public.batch_chapter bc
    join my_batches mb          on mb.batch_id = bc.batch_id
    join public.batch_subject bs on bs.batch_id = bc.batch_id and bs.subject_id = bc.subject_id
    left join best b             on b.batch_id = bc.batch_id and b.chapter_id = bc.chapter_id
    where bc.status = 'completed'
  )
  select subject_id, max(subject_name),
         round(avg(best_pct) filter (where best_pct is not null), 2),
         count(*) filter (where best_pct is not null)::int,
         count(*)::int
  from chapters
  group by subject_id
  order by max(subject_name);
$$;

-- 3) Per-chapter scores within a subject (drill-down + improvement). first_pct is
--    the earliest submitted attempt's percent, best_pct the best (Q12).
create or replace function public.student_chapter_scores(
  p_subject uuid, p_from date default null, p_to date default null, p_batch uuid default null)
returns table (
  chapter_id     uuid,
  chapter_name   text,
  best_pct       numeric,
  first_pct      numeric,
  attempts_used  int,
  passed         boolean
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
    select distinct bc.chapter_id, bc.chapter_name, bc.sort_order
    from public.batch_chapter bc
    join my_batches mb on mb.batch_id = bc.batch_id
    where bc.subject_id = p_subject and bc.status = 'completed'
  )
  select chs.chapter_id, chs.chapter_name,
         max(a.pct),
         (array_agg(a.pct order by a.attempt_no))[1],
         count(a.pct)::int,
         bool_or(a.passed)
  from chs
  left join atts a on a.chapter_id = chs.chapter_id
  group by chs.chapter_id, chs.chapter_name, chs.sort_order
  order by chs.sort_order, chs.chapter_name;
$$;

-- 4) Monthly score trend. Always returns overall rows (subject_id null); when
--    p_group='subject' it also returns a row per subject per month.
create or replace function public.student_score_trend(
  p_from date default null, p_to date default null, p_batch uuid default null,
  p_group text default 'overall')
returns table (
  month        date,
  subject_id   uuid,
  subject_name text,
  pct          numeric
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
    select date_trunc('month', qa.submitted_at)::date as month,
           bc.subject_id, bs.subject_name,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join my_batches mb           on mb.batch_id = qa.batch_id
    join public.batch_chapter bc  on bc.batch_id = qa.batch_id and bc.chapter_id = qa.chapter_id
    join public.batch_subject bs  on bs.batch_id = qa.batch_id and bs.subject_id = bc.subject_id
    where qa.student_id = auth.uid() and qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  )
  select month, null::uuid, null::text, round(avg(pct), 2)
  from atts group by month
  union all
  select month, subject_id, max(subject_name), round(avg(pct), 2)
  from atts where p_group = 'subject' group by month, subject_id
  order by month, subject_id nulls first;
$$;

-- 5) Study plan: the completed chapters the student has NOT yet passed, ranked as
--    actionable focus items. 'not_attempted' (no submitted attempt), 'quick_win'
--    (failed but close to the pass mark, attempts left), 'needs_study' (well below).
create or replace function public.student_study_plan(p_batch uuid default null)
returns table (
  chapter_id         uuid,
  chapter_name       text,
  subject_name       text,
  best_pct           numeric,
  attempts_used      int,
  attempts_remaining int,
  pass_pct           int,
  category           text
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
      and coalesce(a.passed, false) = false            -- only what still needs work
  )
  select chapter_id, chapter_name, subject_name, best_pct, used::int, remaining::int, pass_pct,
         case
           when best_pct is null then 'not_attempted'
           when best_pct >= pass_pct * 0.6 and remaining > 0 then 'quick_win'
           else 'needs_study'
         end as category
  from rows
  -- quick wins first (achievable), then unattempted, then the hard ones; biggest gap first.
  order by case
             when best_pct is not null and best_pct >= pass_pct * 0.6 then 0
             when best_pct is null then 1
             else 2
           end,
           (coalesce(pass_pct, 40) - coalesce(best_pct, 0)) desc,
           subject_name, chapter_name;
$$;

grant execute on function public.student_performance_summary(date, date, uuid)        to authenticated;
grant execute on function public.student_subject_scores(date, date, uuid)             to authenticated;
grant execute on function public.student_chapter_scores(uuid, date, date, uuid)       to authenticated;
grant execute on function public.student_score_trend(date, date, uuid, text)          to authenticated;
grant execute on function public.student_study_plan(uuid)                             to authenticated;

commit;
