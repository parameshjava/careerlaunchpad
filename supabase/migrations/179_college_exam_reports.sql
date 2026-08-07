-- ============================================================================
-- 179_college_exam_reports.sql
-- Exam performance for a WHOLE COLLEGE, over a period, across every exam at
-- once — the read behind /dashboard/reports.
--
-- THE GAP
--   Everything that exists answers one exam or one student. /dashboard/exams/
--   results lists sittings; a sitting's page shows that sitting; 176 gave staff
--   one student's chapter-quiz progress. Nothing answers "how are our students
--   doing, across all our exams, over the last six months?" without opening every
--   paper in turn and holding the comparison in your head.
--
-- WHAT AN EXAM SCORE IS HERE
--   exam_attempt.score is MARKS, not a percentage, and there is no total on the
--   attempt. An exam's total is derived from its sections:
--       sum(exam_section.num_questions * exam_section.marks_per_question)
--   so every percentage below is 100 * score / that. Exams differ in total marks,
--   so raw marks cannot be compared or averaged across them — the percentage is
--   the only comparable unit, and computing it in one place is why these are RPCs
--   rather than five queries in the app.
--
-- THERE IS NO PASS MARK FOR AN EXAM, SO NOTHING HERE REPORTS A PASS RATE
--   `pass_pct` exists on chapter_quiz only. An exam has none anywhere in the
--   schema. Inventing one — 40%, say — would put a hard line through every chart
--   that the product never defined, which is exactly the mistake 155 corrected
--   for subjects ("averaging marks invented a pass mark that does not exist").
--   So these report averages, spread, bands and participation, and let the reader
--   apply their own standard.
--
-- TIME IS submitted_at, NOT the sitting's date
--   A score exists when the student submits. Using exam_session.opens_at would
--   put a late or resumed attempt in the wrong month. opens_at is the fallback
--   only for an attempt with no submitted_at (aborted), which is excluded from
--   score maths anyway.
--
-- AUTHORIZATION — one helper, the 174 rule
--   exam_report_college() resolves and authorizes the college in a single place:
--   an UNSCOPED exam.results.view_all may ask for any college or for all of them;
--   a college-scoped grant is pinned to its own and cannot widen by passing null.
--   has_global_permission / has_college_permission, never has_permission.
--
-- Idempotent.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- The one authorization point. Returns the college to report on, or NULL for
-- "every college" — which only an unscoped holder can get.
-- ---------------------------------------------------------------------------
create or replace function public.exam_report_college(p_college uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scoped uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Unscoped holder: whatever they asked for, including all colleges.
  if public.has_global_permission('exam.results.view_all')
     or public.has_global_permission('user.manage') then
    return p_college;
  end if;

  -- Otherwise they must hold the permission scoped to a college. Their own
  -- scope wins over the argument, so passing null (or someone else's id) cannot
  -- widen the result.
  select ur.scope_college_id into v_scoped
  from public.user_role ur
  join public.role_permission rp on rp.role_id = ur.role_id
  join public.permission p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and ur.scope_college_id is not null
    and p.key = 'exam.results.view_all'
  order by (ur.scope_college_id = p_college) desc   -- honour the ask when allowed
  limit 1;

  if v_scoped is null then
    raise exception 'Not authorized to view exam reports';
  end if;
  return v_scoped;
end;
$$;

comment on function public.exam_report_college(uuid) is
  'Resolves + authorizes the college an exam report covers. NULL means every '
  'college and is reachable only with an UNSCOPED exam.results.view_all; a '
  'college-scoped grant is pinned to its own college whatever it passes.';

grant execute on function public.exam_report_college(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared shape: every scored attempt in range, with its exam's total marks.
-- Inlined into each function below (a view could not carry the auth argument).
-- 'graded' and 'submitted' both count; 'in_progress' and 'aborted' never do.
-- ---------------------------------------------------------------------------

-- 1) Tiles ------------------------------------------------------------------
create or replace function public.college_exam_report_summary(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  sittings          int,
  students          int,
  attempts          int,
  assigned          int,
  avg_pct           numeric,
  median_pct        numeric,
  best_exam         text,
  best_pct          numeric,
  weakest_exam      text,
  weakest_pct       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.exam_report_college(p_college) as college),
  totals as (
    select s.exam_id, sum(s.num_questions * s.marks_per_question) as total_marks
    from public.exam_section s group by s.exam_id
  ),
  sess as (
    select es.id, es.exam_id, e.title, es.opens_at
    from public.exam_session es
    join public.exam e on e.id = es.exam_id
    cross join scope
    where (scope.college is null or es.college_id = scope.college)
  ),
  att as (
    select a.id, a.student_id, sess.id as session_id, sess.exam_id, sess.title,
           round(100 * a.score / nullif(t.total_marks, 0), 2) as pct
    from public.exam_attempt a
    join sess on sess.id = a.session_id
    join totals t on t.exam_id = sess.exam_id
    where a.status in ('submitted', 'graded')
      and (p_from is null or coalesce(a.submitted_at, sess.opens_at) >= p_from)
      and (p_to   is null or coalesce(a.submitted_at, sess.opens_at) <  (p_to + 1))
  ),
  per_exam as (
    select title, round(avg(pct), 2) as pct from att where pct is not null group by title
  )
  select
    (select count(distinct id)::int from sess),
    (select count(distinct student_id)::int from att),
    (select count(*)::int from att),
    (select count(*)::int from public.exam_session_student ess
       where ess.session_id in (select id from sess)),
    (select round(avg(pct), 2) from att),
    -- Median alongside the mean: one very low cohort drags an average in a way
    -- that reads as "everyone did badly" when half the students did fine.
    (select round(percentile_cont(0.5) within group (order by pct)::numeric, 2) from att),
    (select title from per_exam order by pct desc nulls last limit 1),
    (select pct   from per_exam order by pct desc nulls last limit 1),
    (select title from per_exam order by pct asc  nulls last limit 1),
    (select pct   from per_exam order by pct asc  nulls last limit 1);
$$;

-- 2) Trend over time -------------------------------------------------------
create or replace function public.college_exam_report_trend(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (month date, avg_pct numeric, attempts int, students int)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.exam_report_college(p_college) as college),
  totals as (
    select s.exam_id, sum(s.num_questions * s.marks_per_question) as total_marks
    from public.exam_section s group by s.exam_id
  ),
  att as (
    select a.student_id,
           date_trunc('month', coalesce(a.submitted_at, es.opens_at))::date as month,
           round(100 * a.score / nullif(t.total_marks, 0), 2) as pct
    from public.exam_attempt a
    join public.exam_session es on es.id = a.session_id
    join totals t on t.exam_id = es.exam_id
    cross join scope
    where a.status in ('submitted', 'graded')
      and (scope.college is null or es.college_id = scope.college)
      and (p_from is null or coalesce(a.submitted_at, es.opens_at) >= p_from)
      and (p_to   is null or coalesce(a.submitted_at, es.opens_at) <  (p_to + 1))
  )
  select month, round(avg(pct), 2), count(*)::int, count(distinct student_id)::int
  from att where month is not null
  group by month order by month;
$$;

-- 3) Every exam at once ----------------------------------------------------
create or replace function public.college_exam_report_exams(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  session_id uuid, exam_id uuid, title text, label text, college_name text,
  held_on date, results_published boolean,
  assigned int, attempts int, avg_pct numeric, high_pct numeric, low_pct numeric,
  total_marks numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.exam_report_college(p_college) as college),
  totals as (
    select s.exam_id, sum(s.num_questions * s.marks_per_question) as total_marks
    from public.exam_section s group by s.exam_id
  ),
  sess as (
    select es.id, es.exam_id, e.title, es.label, es.opens_at, es.results_published,
           c.name as college_name, t.total_marks
    from public.exam_session es
    join public.exam e on e.id = es.exam_id
    left join public.college c on c.id = es.college_id
    left join totals t on t.exam_id = es.exam_id
    cross join scope
    where (scope.college is null or es.college_id = scope.college)
  ),
  att as (
    select a.session_id, round(100 * a.score / nullif(s.total_marks, 0), 2) as pct
    from public.exam_attempt a
    join sess s on s.id = a.session_id
    where a.status in ('submitted', 'graded')
      and (p_from is null or coalesce(a.submitted_at, s.opens_at) >= p_from)
      and (p_to   is null or coalesce(a.submitted_at, s.opens_at) <  (p_to + 1))
  )
  select s.id, s.exam_id, s.title, s.label, s.college_name,
         s.opens_at::date, s.results_published,
         (select count(*)::int from public.exam_session_student ess where ess.session_id = s.id),
         (select count(*)::int from att where att.session_id = s.id),
         (select round(avg(pct), 2) from att where att.session_id = s.id),
         (select max(pct) from att where att.session_id = s.id),
         (select min(pct) from att where att.session_id = s.id),
         s.total_marks
  from sess s
  -- A sitting with no attempts in range still appears, with nulls: "nobody sat
  -- it" is a finding, and dropping the row hides it.
  order by s.opens_at desc nulls last, s.title;
$$;

-- 4) Subject strength across every exam ------------------------------------
-- The question this page exists for that no single paper can answer: which
-- SUBJECTS are weak college-wide. Built from awarded_marks per question against
-- its section's marks_per_question, so it is comparable across exams.
create or replace function public.college_exam_report_subjects(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (subject text, avg_pct numeric, questions int, attempts int)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.exam_report_college(p_college) as college),
  aq as (
    select coalesce(subj.name, 'Unclassified') as subject,
           aq.awarded_marks, sec.marks_per_question, a.id as attempt_id
    from public.exam_attempt_question aq
    join public.exam_attempt a on a.id = aq.attempt_id
    join public.exam_session es on es.id = a.session_id
    join public.exam_section sec on sec.id = aq.section_id
    left join public.subject subj on subj.id = sec.subject_id
    cross join scope
    where a.status in ('submitted', 'graded')
      and (scope.college is null or es.college_id = scope.college)
      and (p_from is null or coalesce(a.submitted_at, es.opens_at) >= p_from)
      and (p_to   is null or coalesce(a.submitted_at, es.opens_at) <  (p_to + 1))
  )
  select subject,
         round(100 * sum(awarded_marks) / nullif(sum(marks_per_question), 0), 2),
         count(*)::int,
         count(distinct attempt_id)::int
  from aq
  group by subject
  order by 2 nulls last;
$$;

-- 5) Score distribution ----------------------------------------------------
-- Deliberately bands rather than a pass line (see the header): the SHAPE is what
-- tells a reader whether a cohort is uniformly weak or split.
create or replace function public.college_exam_report_distribution(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (band text, lower_pct int, attempts int)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.exam_report_college(p_college) as college),
  totals as (
    select s.exam_id, sum(s.num_questions * s.marks_per_question) as total_marks
    from public.exam_section s group by s.exam_id
  ),
  att as (
    select round(100 * a.score / nullif(t.total_marks, 0), 2) as pct
    from public.exam_attempt a
    join public.exam_session es on es.id = a.session_id
    join totals t on t.exam_id = es.exam_id
    cross join scope
    where a.status in ('submitted', 'graded')
      and (scope.college is null or es.college_id = scope.college)
      and (p_from is null or coalesce(a.submitted_at, es.opens_at) >= p_from)
      and (p_to   is null or coalesce(a.submitted_at, es.opens_at) <  (p_to + 1))
  ),
  bands as (
    select * from (values
      ('0–20%', 0, 20), ('20–40%', 20, 40), ('40–60%', 40, 60),
      ('60–80%', 60, 80), ('80–100%', 80, 101)
    ) as b(band, lo, hi)
  )
  select b.band, b.lo,
         (select count(*)::int from att where att.pct >= b.lo and att.pct < b.hi)
  from bands b order by b.lo;
$$;

-- 6) Every student against every exam — the matrix behind the Excel-like table
-- ---------------------------------------------------------------------------
-- The charts above answer "how is the cohort doing"; this answers "who". One row
-- per (student, sitting) so the client can pivot it into students-by-exams — a
-- shape that has to be built here, because the percentage depends on each exam's
-- own total marks and cannot be recomputed from marks in the browser.
--
-- Deliberately NOT aggregated per student: with the raw pairs the reader can see
-- an individual exam AND an average, whereas an average alone hides the student
-- who did well once and stopped turning up.
--
-- Row count is bounded by the date filter, not by a LIMIT: silently truncating a
-- report reads as "these are all your students" when it is not.
create or replace function public.college_exam_report_students(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  student_id uuid, student_name text, roll_number text, college_name text,
  session_id uuid, exam_title text, session_label text, held_on date,
  score numeric, total_marks numeric, pct numeric, submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.exam_report_college(p_college) as college),
  totals as (
    select s.exam_id, sum(s.num_questions * s.marks_per_question) as total_marks
    from public.exam_section s group by s.exam_id
  )
  select a.student_id,
         coalesce(sp.full_name, au.full_name, au.email),
         sp.roll_number,
         c.name,
         es.id, e.title, es.label, es.opens_at::date,
         a.score, t.total_marks,
         round(100 * a.score / nullif(t.total_marks, 0), 2),
         a.submitted_at
  from public.exam_attempt a
  join public.exam_session es on es.id = a.session_id
  join public.exam e          on e.id = es.exam_id
  left join totals t          on t.exam_id = es.exam_id
  left join public.college c  on c.id = es.college_id
  left join public.app_user au on au.id = a.student_id
  left join public.student_profile sp on sp.user_id = a.student_id
  cross join scope
  where a.status in ('submitted', 'graded')
    and (scope.college is null or es.college_id = scope.college)
    and (p_from is null or coalesce(a.submitted_at, es.opens_at) >= p_from)
    and (p_to   is null or coalesce(a.submitted_at, es.opens_at) <  (p_to + 1))
  order by 2, es.opens_at;
$$;

grant execute on function public.college_exam_report_summary(date, date, uuid)      to authenticated;
grant execute on function public.college_exam_report_students(date, date, uuid)     to authenticated;
grant execute on function public.college_exam_report_trend(date, date, uuid)        to authenticated;
grant execute on function public.college_exam_report_exams(date, date, uuid)        to authenticated;
grant execute on function public.college_exam_report_subjects(date, date, uuid)     to authenticated;
grant execute on function public.college_exam_report_distribution(date, date, uuid) to authenticated;

commit;
