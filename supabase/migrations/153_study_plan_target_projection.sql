-- ============================================================================
-- 153_study_plan_target_projection.sql
-- Completes FR-8 of the student progress-analytics story (#73): the study plan's
-- TARGET & PROJECTION, plus the multi-batch filter (FR-7).
--
--  1) student_study_plan(p_batch, p_target) — was (p_batch) returning only the
--     ranked focus list. Now returns jsonb { items, projection } so a target the
--     student sets (e.g. 70%) yields, in the same round-trip:
--       - current_avg      the overall average today (= performance_summary.overall_pct)
--       - projected_avg    the average IF every still-unpassed *assessed* chapter is
--                          lifted to its pass mark ("clear the pending chapters")
--       - chapters_to_lift how many assessed chapters are below their pass mark
--       - gap_to_target    target − current_avg   (null when no target given)
--       - reaches_target   projected_avg >= target (null when no target given)
--     Transparent recompute, no ML (O-9). The projection universe is ASSESSED
--     chapters only, matching overall_pct's definition (O-8 excludes unattempted
--     from the score); unattempted chapters stay in `items` as easy next steps.
--
--  2) student_performance_batches() — the enrolled batches (id + name) that back
--     the batch filter; self-scoped, so the picker only appears with >1 batch.
--
-- Read-only, self-only (auth.uid()), SECURITY DEFINER — same pattern as 147.
-- ============================================================================

begin;

-- The list-only signature is replaced by the (p_batch, p_target) jsonb version.
-- create-or-replace cannot change a function's return type, so drop first.
drop function if exists public.student_study_plan(uuid);

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
  -- score and pass mark. This is the universe both the list and the projection use.
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
  -- The focus list: chapters not yet passed, categorised + ranked (unchanged from 147).
  plan_rows as (
    select chapter_id, chapter_name, subject_name, best_pct, used, remaining, pass_pct,
           case
             when best_pct is null then 'not_attempted'
             when best_pct >= pass_pct * 0.6 and remaining > 0 then 'quick_win'
             else 'needs_study'
           end as category,
           case
             when best_pct is not null and best_pct >= pass_pct * 0.6 then 0
             when best_pct is null then 1
             else 2
           end as sort_bucket
    from rows
    where passed = false
  ),
  -- Projection over ASSESSED chapters only (best_pct not null). "Lift to pass" =
  -- greatest(best_pct, pass_pct): passed chapters are unchanged, failing ones rise
  -- to their pass mark. Honest and conservative — if this still misses the target,
  -- reaches_target is false and the student sees clearing pending chapters isn't enough.
  proj as (
    select
      round(avg(best_pct), 2)                         as current_avg,
      round(avg(greatest(best_pct, pass_pct)), 2)     as projected_avg,
      count(*) filter (where best_pct < pass_pct)::int as chapters_to_lift
    from rows
    where best_pct is not null
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
            'category',           category)
          order by sort_bucket, (pass_pct - coalesce(best_pct, 0)) desc, subject_name, chapter_name)
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
                                 else coalesce((select projected_avg from proj), 0) >= p_target end)
  );
$$;

-- The enrolled batches that back the FR-7 batch filter. Self-only; ordered newest
-- first by start_date so the picker's default (most recent) is sensible.
create or replace function public.student_performance_batches()
returns table (batch_id uuid, batch_name text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name
  from public.student_enrollment e
  join public.batch b on b.id = e.batch_id
  where e.student_id = auth.uid()
    and e.status in ('pending', 'active', 'completed')
  order by b.start_date desc nulls last, b.name;
$$;

grant execute on function public.student_study_plan(uuid, integer)   to authenticated;
grant execute on function public.student_performance_batches()       to authenticated;

commit;
