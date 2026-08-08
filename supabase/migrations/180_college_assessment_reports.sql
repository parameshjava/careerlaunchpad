-- ============================================================================
-- 180_college_assessment_reports.sql
-- Chapter-ASSESSMENT results for every student of a college — the cohort-wide
-- counterpart of 176, which made one student's assessments readable to staff.
--
-- WHY THIS IS SEPARATE FROM 179's EXAM REPORT
--   They are different instruments and the schema treats them differently:
--     · an exam attempt stores MARKS with no total (179 derives it from sections)
--       and has NO pass mark anywhere, so 179 deliberately reports no pass rate;
--     · a chapter_quiz_attempt stores score AND total_marks AND a `passed`
--       boolean, and chapter_quiz.pass_pct is a real per-chapter mark.
--   So here a pass rate is a FACT the product defines, not something invented.
--   Reporting them through one function would have to drop that.
--
-- ONE SCORE PER CHAPTER: THE BEST SUBMITTED ATTEMPT
--   Chapter quizzes are retakeable (3 attempts, 143). 147/155 fixed the student's
--   own view as "a chapter's score is the student's BEST submitted attempt", and
--   this follows it exactly. Averaging all attempts instead would make the staff
--   view contradict the student's for the same student and chapter, which is
--   worse than either convention.
--
--   The trend is attributed to the month of that BEST attempt, so every number on
--   the page reconciles with every other. Plotting all attempts would give a
--   truer picture of activity but a series that cannot be squared with the
--   averages beside it.
--
-- SCOPE IS THE STUDENT'S COLLEGE
--   "All the students of their college" means student_profile.college_id — not the
--   batch's college. A batch can serve several colleges, so scoping by batch would
--   pull in other colleges' students; scoping by the student is what was asked and
--   is the tighter of the two.
--
-- AUTHORIZATION
--   assessment_report_college() mirrors perf_target (176): an UNSCOPED
--   student-records grant may ask for any college or all of them, a college-scoped
--   college.students.view is pinned to its own. It RAISES rather than returning
--   empty, so an unauthorized read is never mistaken for "no assessments yet".
--
-- Idempotent.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- The one authorization point for this report.
-- ---------------------------------------------------------------------------
create or replace function public.assessment_report_college(p_college uuid default null)
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

  -- Same global set perf_target (176) accepts, and for the same reason:
  -- platform_admin and coordinator hold student.profile.view / user.manage and no
  -- college.students.view at all, so keying only on the latter would lock the
  -- platform team out of a report about students.
  if public.has_global_permission('user.manage')
     or public.has_global_permission('student.profile.view')
     or public.has_global_permission('student.profile.search')
     or public.has_global_permission('college.students.view') then
    return p_college;
  end if;

  select ur.scope_college_id into v_scoped
  from public.user_role ur
  join public.role_permission rp on rp.role_id = ur.role_id
  join public.permission p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and ur.scope_college_id is not null
    and p.key = 'college.students.view'
  order by (ur.scope_college_id = p_college) desc
  limit 1;

  if v_scoped is null then
    raise exception 'Not authorized to view assessment reports';
  end if;
  return v_scoped;
end;
$$;

comment on function public.assessment_report_college(uuid) is
  'Resolves + authorizes the college a chapter-assessment report covers. NULL '
  'means every college and needs an UNSCOPED student-records grant; a '
  'college-scoped college.students.view is pinned to its own college.';

grant execute on function public.assessment_report_college(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Tiles
-- ---------------------------------------------------------------------------
create or replace function public.college_assessment_summary(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  students int, chapters_assessed int, attempts int,
  avg_pct numeric, median_pct numeric, pass_rate_pct numeric,
  best_subject text, best_pct numeric, weakest_subject text, weakest_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.assessment_report_college(p_college) as college),
  mine as (
    select sp.user_id
    from public.student_profile sp cross join scope
    where scope.college is null or sp.college_id = scope.college
  ),
  atts as (
    select qa.student_id, qa.chapter_id, qa.batch_id, qa.submitted_at, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join mine on mine.user_id = qa.student_id
    where qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  ),
  -- BEST submitted attempt per (student, chapter) — see the header.
  best as (
    select distinct on (student_id, chapter_id)
           student_id, chapter_id, batch_id, pct, passed, submitted_at
    from atts
    order by student_id, chapter_id, pct desc nulls last, submitted_at desc
  ),
  by_subject as (
    select coalesce(bs.subject_name, 'Unclassified') as subject,
           round(avg(best.pct), 2) as pct
    from best
    left join public.batch_subject bs
           on bs.batch_id = best.batch_id
          and bs.subject_id = (select bc.subject_id from public.batch_chapter bc
                               where bc.batch_id = best.batch_id and bc.chapter_id = best.chapter_id
                               limit 1)
    group by 1
  )
  select
    (select count(distinct student_id)::int from best),
    (select count(*)::int from best),
    (select count(*)::int from atts),
    (select round(avg(pct), 2) from best),
    (select round(percentile_cont(0.5) within group (order by pct)::numeric, 2) from best),
    -- A real pass rate: `passed` is stored on the attempt against the chapter's
    -- own pass_pct, so nothing is invented here (unlike 179's exams).
    (select round(100.0 * count(*) filter (where passed) / nullif(count(*), 0), 2) from best),
    (select subject from by_subject order by pct desc nulls last limit 1),
    (select pct     from by_subject order by pct desc nulls last limit 1),
    (select subject from by_subject order by pct asc  nulls last limit 1),
    (select pct     from by_subject order by pct asc  nulls last limit 1);
$$;

-- ---------------------------------------------------------------------------
-- 2) Trend
-- ---------------------------------------------------------------------------
create or replace function public.college_assessment_trend(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (month date, avg_pct numeric, pass_rate_pct numeric, chapters int, students int)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.assessment_report_college(p_college) as college),
  mine as (
    select sp.user_id from public.student_profile sp cross join scope
    where scope.college is null or sp.college_id = scope.college
  ),
  atts as (
    select qa.student_id, qa.chapter_id, qa.submitted_at, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join mine on mine.user_id = qa.student_id
    where qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  ),
  best as (
    select distinct on (student_id, chapter_id)
           student_id, chapter_id, pct, passed, submitted_at
    from atts order by student_id, chapter_id, pct desc nulls last, submitted_at desc
  )
  select date_trunc('month', submitted_at)::date,
         round(avg(pct), 2),
         round(100.0 * count(*) filter (where passed) / nullif(count(*), 0), 2),
         count(*)::int,
         count(distinct student_id)::int
  from best
  where submitted_at is not null
  group by 1 order by 1;
$$;

-- ---------------------------------------------------------------------------
-- 3) Per subject
-- ---------------------------------------------------------------------------
create or replace function public.college_assessment_subjects(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  subject_id uuid, subject text, avg_pct numeric, pass_rate_pct numeric,
  chapters int, students int
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.assessment_report_college(p_college) as college),
  mine as (
    select sp.user_id from public.student_profile sp cross join scope
    where scope.college is null or sp.college_id = scope.college
  ),
  atts as (
    select qa.student_id, qa.chapter_id, qa.batch_id, qa.submitted_at, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join mine on mine.user_id = qa.student_id
    where qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  ),
  best as (
    select distinct on (student_id, chapter_id)
           student_id, chapter_id, batch_id, pct, passed
    from atts order by student_id, chapter_id, pct desc nulls last
  ),
  tagged as (
    select b.*, bc.subject_id, coalesce(bs.subject_name, 'Unclassified') as subject
    from best b
    left join public.batch_chapter bc on bc.batch_id = b.batch_id and bc.chapter_id = b.chapter_id
    left join public.batch_subject bs on bs.batch_id = b.batch_id and bs.subject_id = bc.subject_id
  )
  select subject_id, subject,
         round(avg(pct), 2),
         round(100.0 * count(*) filter (where passed) / nullif(count(*), 0), 2),
         count(distinct chapter_id)::int,
         count(distinct student_id)::int
  from tagged
  group by subject_id, subject
  order by 3 nulls last;
$$;

-- ---------------------------------------------------------------------------
-- 4) Per chapter — the weakest-first list that says what to reteach
-- ---------------------------------------------------------------------------
create or replace function public.college_assessment_chapters(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  chapter_id uuid, chapter text, subject text,
  avg_pct numeric, pass_rate_pct numeric, students int, below_pass int
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.assessment_report_college(p_college) as college),
  mine as (
    select sp.user_id from public.student_profile sp cross join scope
    where scope.college is null or sp.college_id = scope.college
  ),
  atts as (
    select qa.student_id, qa.chapter_id, qa.batch_id, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join mine on mine.user_id = qa.student_id
    where qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  ),
  best as (
    select distinct on (student_id, chapter_id)
           student_id, chapter_id, batch_id, pct, passed
    from atts order by student_id, chapter_id, pct desc nulls last
  ),
  tagged as (
    select b.*,
           coalesce(bc.chapter_name, 'Unnamed chapter') as chapter,
           coalesce(bs.subject_name, 'Unclassified') as subject
    from best b
    left join public.batch_chapter bc on bc.batch_id = b.batch_id and bc.chapter_id = b.chapter_id
    left join public.batch_subject bs on bs.batch_id = b.batch_id and bs.subject_id = bc.subject_id
  )
  select chapter_id, chapter, subject,
         round(avg(pct), 2),
         round(100.0 * count(*) filter (where passed) / nullif(count(*), 0), 2),
         count(distinct student_id)::int,
         count(*) filter (where not passed)::int
  from tagged
  group by chapter_id, chapter, subject
  order by 4 nulls last;
$$;

-- ---------------------------------------------------------------------------
-- 5) Student × subject — the matrix
-- ---------------------------------------------------------------------------
-- Subject rather than chapter as the column: a college runs to hundreds of
-- chapters, which is not a table anyone reads. The per-chapter list above is
-- where "which chapter" is answered, and a student's own chapter detail is one
-- click away on their progress page (176).
create or replace function public.college_assessment_students(
  p_from date default null, p_to date default null, p_college uuid default null)
returns table (
  student_id uuid, student_name text, roll_number text, college_name text,
  subject_id uuid, subject text, avg_pct numeric, chapters int,
  passed_count int, pass_rate_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select public.assessment_report_college(p_college) as college),
  mine as (
    select sp.user_id, sp.full_name, sp.roll_number, c.name as college_name
    from public.student_profile sp
    left join public.college c on c.id = sp.college_id
    cross join scope
    where scope.college is null or sp.college_id = scope.college
  ),
  atts as (
    select qa.student_id, qa.chapter_id, qa.batch_id, qa.passed,
           round(100 * qa.score / nullif(qa.total_marks, 0), 2) as pct
    from public.chapter_quiz_attempt qa
    join mine on mine.user_id = qa.student_id
    where qa.status = 'submitted'
      and (p_from is null or qa.submitted_at >= p_from)
      and (p_to   is null or qa.submitted_at <  (p_to + 1))
  ),
  best as (
    select distinct on (student_id, chapter_id)
           student_id, chapter_id, batch_id, pct, passed
    from atts order by student_id, chapter_id, pct desc nulls last
  ),
  tagged as (
    select b.*, bc.subject_id, coalesce(bs.subject_name, 'Unclassified') as subject
    from best b
    left join public.batch_chapter bc on bc.batch_id = b.batch_id and bc.chapter_id = b.chapter_id
    left join public.batch_subject bs on bs.batch_id = b.batch_id and bs.subject_id = bc.subject_id
  )
  select t.student_id,
         coalesce(m.full_name, au.email),
         m.roll_number,
         m.college_name,
         t.subject_id, t.subject,
         round(avg(t.pct), 2),
         count(distinct t.chapter_id)::int,
         count(*) filter (where t.passed)::int,
         round(100.0 * count(*) filter (where t.passed) / nullif(count(*), 0), 2)
  from tagged t
  join mine m on m.user_id = t.student_id
  left join public.app_user au on au.id = t.student_id
  group by t.student_id, m.full_name, au.email, m.roll_number, m.college_name,
           t.subject_id, t.subject
  order by 2, 6;
$$;

grant execute on function public.college_assessment_summary(date, date, uuid)  to authenticated;
grant execute on function public.college_assessment_trend(date, date, uuid)    to authenticated;
grant execute on function public.college_assessment_subjects(date, date, uuid) to authenticated;
grant execute on function public.college_assessment_chapters(date, date, uuid) to authenticated;
grant execute on function public.college_assessment_students(date, date, uuid) to authenticated;

commit;
