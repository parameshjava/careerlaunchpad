-- ============================================================================
-- 026_exam_review_rpcs.sql
-- Read RPCs for the evaluator surface. Assigned staff (employers/mentors/…) need
-- to see participant identities and per-question detail, but student name/email
-- (student_profile / app_user) are RLS-protected and not visible to them. These
-- SECURITY DEFINER functions return that data, gated by is_exam_staff_for_session
-- (which also passes for admins). They never expose anything for a session the
-- caller isn't staff/admin for.
--
--   get_exam_session_results(session) -> roster + scores (+ names/emails)
--   get_attempt_for_review(attempt)   -> per-question detail for manual grading
--   (marks are written via set_attempt_marks from migration 024)
-- ============================================================================

create or replace function public.get_exam_session_results(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_exam_staff_for_session(p_session_id) then raise exception 'Forbidden'; end if;

  return jsonb_build_object(
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', ss.student_id,
        'name', sp.full_name,
        'email', au.email,
        'roster_status', ss.status,
        'attempt_id', a.id,
        'attempt_status', a.status,
        'score', a.score
      ) order by au.email)
      from public.exam_session_student ss
      join public.app_user au on au.id = ss.student_id
      left join public.student_profile sp on sp.user_id = ss.student_id
      left join public.exam_attempt a on a.session_id = ss.session_id and a.student_id = ss.student_id
      where ss.session_id = p_session_id
    ), '[]'::jsonb));
end;
$$;

create or replace function public.get_attempt_for_review(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_attempt record;
begin
  select session_id into v_session from public.exam_attempt where id = p_attempt_id;
  if v_session is null then raise exception 'Attempt not found'; end if;
  if not public.is_exam_staff_for_session(v_session) then raise exception 'Forbidden'; end if;

  select a.id, a.status, a.score, a.student_id, au.email, sp.full_name
    into v_attempt
  from public.exam_attempt a
  join public.app_user au on au.id = a.student_id
  left join public.student_profile sp on sp.user_id = a.student_id
  where a.id = p_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'score', v_attempt.score,
    'name', v_attempt.full_name,
    'email', v_attempt.email,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', aq.position,
        'stem', q.stem,
        'kind', q.kind,
        'marks', es.marks_per_question,
        'awarded_marks', aq.awarded_marks,
        'selected_option_ids', aq.selected_option_ids,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct)
                 order by o.position)
          from public.question_option o where o.question_id = q.id), '[]'::jsonb)
      ) order by aq.position)
      from public.exam_attempt_question aq
      join public.question q on q.id = aq.question_id
      join public.exam_section es on es.id = aq.section_id
      where aq.attempt_id = p_attempt_id
    ), '[]'::jsonb));
end;
$$;

grant execute on function public.get_exam_session_results(uuid) to authenticated;
grant execute on function public.get_attempt_for_review(uuid)   to authenticated;
