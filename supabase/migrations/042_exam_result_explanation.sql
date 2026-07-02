-- ============================================================================
-- 042_exam_result_explanation.sql
-- Surface question.explanation on the student's post-exam review. get_exam_result
-- (022) returned stem/options/awarded_marks but not the worked solution, so the
-- explanation seeded in 041 never reached the student. Recreate the function with
-- 'explanation' added to each question object. Gating/logic are otherwise
-- unchanged (own attempt only, still gated on results_published). Idempotent.
-- ============================================================================
create or replace function public.get_exam_result(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_attempt record; v_published boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into v_attempt from public.exam_attempt
    where session_id = p_session_id and student_id = uid;
  if not found then raise exception 'No attempt found'; end if;
  select results_published into v_published from public.exam_session where id = p_session_id;
  if not coalesce(v_published, false) then return jsonb_build_object('published', false); end if;

  return jsonb_build_object(
    'published', true, 'score', v_attempt.score, 'status', v_attempt.status,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', aq.position, 'stem', q.stem, 'explanation', q.explanation,
        'awarded_marks', aq.awarded_marks,
        'selected_option_ids', aq.selected_option_ids,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct)
                 order by o.position)
          from public.question_option o where o.question_id = q.id), '[]'::jsonb)
      ) order by aq.position)
      from public.exam_attempt_question aq join public.question q on q.id = aq.question_id
      where aq.attempt_id = v_attempt.id), '[]'::jsonb));
end;
$$;

grant execute on function public.get_exam_result(uuid) to authenticated;
