-- Server-side aggregation for the admin live-monitoring board and the printed
-- results (issue #78). Previously the app read every exam_attempt_question row
-- for a sitting and aggregated in JS — but a real sitting has (students ×
-- questions) rows, which for 18 students × 60 questions = 1080 exceeds
-- PostgREST's 1000-row response cap, silently dropping ~80 rows and undercounting
-- every column (one student rendered 0/0/0 despite 60 attempted / 32 correct).
--
-- This RPC does the aggregation in one grouped query and returns only the
-- relevant ~(students × sections) rows, so nothing is fetched that isn't shown
-- and there is no cap to hit. It computes, per student per section:
--   attempted — questions with a non-empty selection
--   marked    — questions flagged for review (migration 151)
--   correct   — LIVE correctness via the SAME exact-set-match rule as the grader
--               (_grade_attempts, migration 022): selected <@ correct AND
--               correct <@ selected, correct set non-empty
--   awarded   — sum of awarded_marks (0 until the attempt is graded)
--
-- SECURITY DEFINER so `correct` can be computed against question_option (whose
-- RLS is admin-only) for every authorised reviewer — not just platform admins.
-- The guard mirrors the exam_attempt_question read policy (migration 024): admin,
-- OR exam.results.view_all for the sitting's college, OR assigned exam staff.
create or replace function public.exam_session_progress(p_session_id uuid)
returns table (
  student_id uuid,
  section_id uuid,
  attempted integer,
  marked integer,
  correct integer,
  awarded numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (
    public.is_exam_admin()
    or public.has_college_permission('exam.results.view_all', public.exam_session_college(p_session_id))
    or public.is_exam_staff_for_session(p_session_id)
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    a.student_id,
    aq.section_id,
    count(*) filter (where array_length(aq.selected_option_ids, 1) is not null)::integer,
    count(*) filter (where aq.marked_for_review)::integer,
    count(*) filter (
      where ck.correct_ids is not null
        and array_length(ck.correct_ids, 1) is not null
        and aq.selected_option_ids <@ ck.correct_ids
        and ck.correct_ids <@ aq.selected_option_ids
    )::integer,
    coalesce(sum(aq.awarded_marks), 0)::numeric
  from public.exam_attempt a
  join public.exam_attempt_question aq on aq.attempt_id = a.id
  left join lateral (
    select array_agg(o.id) as correct_ids
    from public.question_option o
    where o.question_id = aq.question_id and o.is_correct
  ) ck on true
  where a.session_id = p_session_id
  group by a.student_id, aq.section_id;
end;
$$;

grant execute on function public.exam_session_progress(uuid) to authenticated;
