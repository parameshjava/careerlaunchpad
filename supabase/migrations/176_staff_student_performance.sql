-- ============================================================================
-- 176_staff_student_performance.sql
-- Let a college's staff open ONE of their own students and see the same
-- progress detail the student sees of themselves (issue #111, parent #107,
-- decision §7 Q3).
--
-- THE PROBLEM
--   Every reader in 147/153/154/155/156 is filtered on auth.uid() — they answer
--   only "how am I doing?". There is no staff-facing read of a student's chapter
--   scores at ANY privilege level: not for a college admin, not for a platform
--   admin, not for an owner. "Monitor their students' progress" is therefore a
--   database gap, not a screen we forgot to build.
--
-- WHY ONE SET OF FUNCTIONS AND NOT A PARALLEL staff_* SET
--   The obvious move is six staff_student_* copies. That is ~450 lines of
--   near-identical SQL holding the definitions of "best attempt", "assessed
--   chapter", "achievability" and the ladder — the exact shape that drifts,
--   which this codebase has already been bitten by (see 174's post-mortem, and
--   155's four corrections to 154). So instead each existing function gains a
--   trailing `p_student uuid default null` and resolves its subject through ONE
--   helper. Callers that pass nothing behave exactly as before.
--
--   The bodies below are otherwise VERBATIM from their latest definitions —
--   batches from 153, summary and trend from 147, subject/chapter scores and the
--   mastery grid from 155, the study plan from 156. The only edit is
--   auth.uid() -> public.perf_target(p_student). Nothing about what the numbers
--   mean has changed.
--
-- THE AUTHORIZATION
--   perf_target() is the whole security boundary and is deliberately tiny:
--     * p_student null, or the caller themselves -> auth.uid(), unchanged.
--     * anyone else -> allowed by an UNSCOPED grant of any permission that
--       already means "you may look at student records", or by a COLLEGE-SCOPED
--       college.students.view for THAT student's own college. Otherwise it
--       raises, so an unauthorized read fails loudly instead of returning an
--       empty set that reads like "this student has done nothing".
--
--   The global set is not just college.students.view: platform_admin and
--   coordinator hold student.profile.view / .search / user.manage and NO
--   college.students.view at all (see 035, 007), so keying only on the latter
--   would have locked the platform team out of the drilldown entirely. This
--   mirrors canViewStudents() in lib/nav.ts, which decides who sees the Students
--   console — the same question, so the same answer.
--
--   has_global_permission / has_college_permission, never has_permission — the
--   latter is true for a college-scoped grant and would hand every college's
--   students to any college admin (174 section 1).
--
-- Idempotent. Each function is dropped by its OLD signature first: adding a
-- defaulted parameter creates an overload, and a no-arg call would then be
-- ambiguous rather than resolving to the new one.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- The resolver. Also usable on its own as an authorization probe.
-- ----------------------------------------------------------------------------
create or replace function public.perf_target(p_student uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_me      uuid := auth.uid();
  v_college uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  -- The overwhelmingly common case: a student reading their own progress.
  if p_student is null or p_student = v_me then
    return v_me;
  end if;

  -- A global student-records grant needs no college at all, so it is checked
  -- first — a platform admin can open a student whose profile has no college.
  if public.has_global_permission('user.manage')
     or public.has_global_permission('student.profile.view')
     or public.has_global_permission('student.profile.search')
     or public.has_global_permission('college.students.view') then
    return p_student;
  end if;

  select college_id into v_college from public.student_profile where user_id = p_student;
  if v_college is null then
    -- No profile, or no college on it: no scoped grant can match it, and saying
    -- so beats reporting an empty progress view as fact.
    raise exception 'Not authorized to view this student''s progress';
  end if;

  if public.has_college_permission('college.students.view', v_college) then
    return p_student;
  end if;

  raise exception 'Not authorized to view this student''s progress';
end;
$fn$;

comment on function public.perf_target(uuid) is
  'Resolves whose progress a performance reader reports on. Returns auth.uid() '
  'for self; for anyone else requires college.students.view scoped to THAT '
  'student''s college (or an unscoped grant), and raises otherwise. The single '
  'authorization point for every student_* performance function.';

grant execute on function public.perf_target(uuid) to authenticated;

-- ============================================================================
-- The readers, re-declared with p_student. Bodies unchanged except for the
-- auth.uid() -> perf_target(p_student) swap described in the header.
-- ============================================================================
drop function if exists public.student_performance_batches();

create or replace function public.student_performance_batches(p_student uuid default null)
returns table (batch_id uuid, batch_name text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name
  from public.student_enrollment e
  join public.batch b on b.id = e.batch_id
  where e.student_id = public.perf_target(p_student)
    and e.status in ('pending', 'active', 'completed')
  order by b.start_date desc nulls last, b.name;
$$;

drop function if exists public.student_performance_summary(date, date, uuid);

create or replace function public.student_performance_summary(
  p_from date default null, p_to date default null, p_batch uuid default null, p_student uuid default null)
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
    where e.student_id = public.perf_target(p_student) and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  best as (
    select qa.batch_id, qa.chapter_id,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2)) as best_pct,
           bool_or(qa.passed) as best_passed
    from public.chapter_quiz_attempt qa
    where qa.student_id = public.perf_target(p_student) and qa.status = 'submitted'
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

drop function if exists public.student_subject_scores(date, date, uuid);

create or replace function public.student_subject_scores(
  p_from date default null, p_to date default null, p_batch uuid default null, p_student uuid default null)
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
    where e.student_id = public.perf_target(p_student) and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  best as (
    select qa.batch_id, qa.chapter_id,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2)) as best_pct
    from public.chapter_quiz_attempt qa
    where qa.student_id = public.perf_target(p_student) and qa.status = 'submitted'
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

drop function if exists public.student_chapter_scores(uuid, date, date, uuid);

create or replace function public.student_chapter_scores(
  p_subject uuid, p_from date default null, p_to date default null, p_batch uuid default null, p_student uuid default null)
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
    where e.student_id = public.perf_target(p_student) and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  -- SCORES: windowed, because the range filter is a question about scores.
  atts as (
    select qa.chapter_id, qa.attempt_no, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join my_batches mb on mb.batch_id = qa.batch_id
    where qa.student_id = public.perf_target(p_student) and qa.status = 'submitted'
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
          and qa.student_id = public.perf_target(p_student)
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

drop function if exists public.student_score_trend(date, date, uuid, text);

create or replace function public.student_score_trend(
  p_from date default null, p_to date default null, p_batch uuid default null,
  p_group text default 'overall', p_student uuid default null)
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
    where e.student_id = public.perf_target(p_student) and e.status in ('pending', 'active', 'completed')
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
    where qa.student_id = public.perf_target(p_student) and qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  )
  select month, null::uuid as subject_id, null::text as subject_name, round(avg(pct), 2) as pct
  from atts group by month
  union all
  select month, subject_id, max(subject_name), round(avg(pct), 2)
  from atts where p_group = 'subject' group by month, subject_id
  order by month, subject_id nulls first;
$$;

drop function if exists public.student_mastery_grid(date, date, uuid);

create or replace function public.student_mastery_grid(
  p_from date default null, p_to date default null, p_batch uuid default null, p_student uuid default null)
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
    where e.student_id = public.perf_target(p_student) and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  atts as (
    select qa.chapter_id,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2)) as best_pct,
           count(*)::int                                             as used
    from public.chapter_quiz_attempt qa
    join my_batches mb on mb.batch_id = qa.batch_id
    where qa.student_id = public.perf_target(p_student) and qa.status = 'submitted'
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

drop function if exists public.student_study_plan(uuid, integer);

create or replace function public.student_study_plan(
  p_batch uuid default null, p_target int default null, p_student uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with my_batches as (
    select e.batch_id from public.student_enrollment e
    where e.student_id = public.perf_target(p_student) and e.status in ('pending', 'active', 'completed')
      and (p_batch is null or e.batch_id = p_batch)
  ),
  agg as (
    select qa.batch_id, qa.chapter_id,
           count(*) filter (where qa.status = 'submitted') as used,
           max(round(100 * qa.score / nullif(qa.total_marks, 0), 2))
             filter (where qa.status = 'submitted') as best_pct,
           bool_or(qa.passed) as passed
    from public.chapter_quiz_attempt qa
    where qa.student_id = public.perf_target(p_student)
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

-- ----------------------------------------------------------------------------
-- Grants. Re-issued because dropping a function drops its grants with it.
-- ----------------------------------------------------------------------------
grant execute on function public.student_performance_batches(uuid) to authenticated;
grant execute on function public.student_performance_summary(date, date, uuid, uuid) to authenticated;
grant execute on function public.student_subject_scores(date, date, uuid, uuid) to authenticated;
grant execute on function public.student_chapter_scores(uuid, date, date, uuid, uuid) to authenticated;
grant execute on function public.student_score_trend(date, date, uuid, text, uuid) to authenticated;
grant execute on function public.student_mastery_grid(date, date, uuid, uuid) to authenticated;
grant execute on function public.student_study_plan(uuid, integer, uuid) to authenticated;

commit;
