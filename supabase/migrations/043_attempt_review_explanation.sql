-- ============================================================================
-- 043_attempt_review_explanation.sql
-- Surface question.explanation on the admin/evaluator attempt-review screen.
-- get_attempt_for_review (026) returned stem/kind/options but not the worked
-- solution. Recreate it with 'explanation' added to each question object so
-- graders see the reference working alongside the correct answer. Access gating
-- (is_exam_staff_for_session) and all other fields are unchanged. Idempotent.
-- ============================================================================
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
        'explanation', q.explanation,
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

grant execute on function public.get_attempt_for_review(uuid) to authenticated;
