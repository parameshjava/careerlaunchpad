-- ============================================================================
-- 022_exam_rpcs.sql  (clean, final)
-- SECURITY DEFINER RPCs for exam-taking, grading and atomic blueprint edits.
-- Students touch exam content ONLY through these (they have no RLS read on the
-- bank; option correctness never leaves the server). College admins use the
-- blueprint/grading helpers. All check auth/permission/ownership internally.
--
--   start_exam_attempt(session)            -> hydrated paper (no is_correct) + ends_at
--   save_exam_answer(attempt, q, options)  -> store selection only, before the deadline
--   submit_exam_attempt(attempt)           -> grade server-side, return score
--   grade_session_in_progress(session)     -> finalize abandoned attempts on close
--   get_exam_result(session)               -> own result, gated on results_published
--   replace_blueprint_sections(exam, json) -> atomic section+quota replace
-- ============================================================================

-- ---- internal grader (set-based; not callable directly by clients) -----------
create or replace function public._grade_attempts(p_attempt_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.exam_attempt_question aq
  set awarded_marks = g.award
  from (
    select x.attempt_id, x.position,
      case
        when x.correct_ids is not null and array_length(x.correct_ids, 1) is not null
             and x.selected_option_ids <@ x.correct_ids
             and x.correct_ids <@ x.selected_option_ids
          then x.marks
        when array_length(x.selected_option_ids, 1) is not null then -x.neg
        else 0
      end as award
    from (
      select aq2.attempt_id, aq2.position, aq2.selected_option_ids,
             es.marks_per_question as marks,
             coalesce(e.negative_mark_per_wrong, 0) as neg,
             (select array_agg(o.id) from public.question_option o
              where o.question_id = aq2.question_id and o.is_correct) as correct_ids
      from public.exam_attempt_question aq2
      join public.exam_attempt a   on a.id = aq2.attempt_id
      join public.exam_session s   on s.id = a.session_id
      join public.exam e           on e.id = s.exam_id
      join public.exam_section es  on es.id = aq2.section_id
      where aq2.attempt_id = any(p_attempt_ids)
    ) x
  ) g
  where aq.attempt_id = g.attempt_id and aq.position = g.position;

  update public.exam_attempt a
  set score = coalesce((select sum(aq.awarded_marks)
                        from public.exam_attempt_question aq where aq.attempt_id = a.id), 0),
      status = 'graded', submitted_at = now()
  where a.id = any(p_attempt_ids) and a.status = 'in_progress';

  update public.exam_session_student ss
  set status = 'submitted'
  from public.exam_attempt a
  where a.id = any(p_attempt_ids)
    and ss.session_id = a.session_id and ss.student_id = a.student_id;
end;
$$;
revoke all on function public._grade_attempts(uuid[]) from public;

-- ---- start_exam_attempt ------------------------------------------------------
create or replace function public.start_exam_attempt(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_session record; v_paper_id uuid; v_attempt record; v_duration int; v_ends_at timestamptz;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.exam_session_student
                 where session_id = p_session_id and student_id = uid) then
    raise exception 'You are not assigned to this exam';
  end if;

  select * into v_session from public.exam_session where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if v_session.status <> 'open' then raise exception 'This exam is not open'; end if;
  if v_session.opens_at is not null and now() < v_session.opens_at then
    raise exception 'This exam has not opened yet';
  end if;
  if v_session.closes_at is not null and now() > v_session.closes_at then
    raise exception 'This exam has closed';
  end if;

  select id into v_paper_id from public.exam_paper where session_id = p_session_id limit 1;
  if v_paper_id is null then raise exception 'No paper has been generated for this exam'; end if;

  select duration_minutes into v_duration from public.exam where id = v_session.exam_id;

  select * into v_attempt from public.exam_attempt
    where session_id = p_session_id and student_id = uid;
  if found then
    if v_attempt.status <> 'in_progress' then raise exception 'You have already submitted this exam'; end if;
  else
    insert into public.exam_attempt (session_id, student_id, status)
    values (p_session_id, uid, 'in_progress') returning * into v_attempt;
    insert into public.exam_attempt_question
      (attempt_id, question_id, question_version, section_id, position)
    select v_attempt.id, pq.question_id, pq.question_version, pq.section_id, pq.position
    from public.exam_paper_question pq where pq.paper_id = v_paper_id;
    update public.exam_session_student set status = 'started'
      where session_id = p_session_id and student_id = uid and status = 'invited';
  end if;

  v_ends_at := v_attempt.started_at + make_interval(mins => v_duration);
  if v_session.closes_at is not null and v_session.closes_at < v_ends_at then
    v_ends_at := v_session.closes_at;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'duration_minutes', v_duration,
    'ends_at', v_ends_at,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', aq.position, 'question_id', q.id, 'section_id', aq.section_id,
          'kind', q.kind, 'answer_type', q.answer_type, 'stem', q.stem,
          'stem_image_url', q.stem_image_url,
          'passage', case when q.passage_id is not null then (
              select jsonb_build_object('title', p.title, 'body', p.body)
              from public.passage p where p.id = q.passage_id) else null end,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
            from public.question_option o where o.question_id = q.id), '[]'::jsonb),
          'selected_option_ids', aq.selected_option_ids
        ) order by aq.position)
      from public.exam_attempt_question aq join public.question q on q.id = aq.question_id
      where aq.attempt_id = v_attempt.id
    ), '[]'::jsonb));
end;
$$;

-- ---- save_exam_answer (deadline-enforced) ------------------------------------
create or replace function public.save_exam_answer(
  p_attempt_id uuid, p_question_id uuid, p_selected uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); v record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select a.student_id, a.status, a.started_at, e.duration_minutes, s.closes_at into v
  from public.exam_attempt a
  join public.exam_session s on s.id = a.session_id
  join public.exam e on e.id = s.exam_id
  where a.id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if v.student_id <> uid then raise exception 'Not your attempt'; end if;
  if v.status <> 'in_progress' then raise exception 'This attempt is no longer open'; end if;
  if now() > v.started_at + make_interval(mins => v.duration_minutes)
     or (v.closes_at is not null and now() > v.closes_at) then
    raise exception 'Time is up';
  end if;

  update public.exam_attempt_question set selected_option_ids = coalesce(p_selected, '{}')
    where attempt_id = p_attempt_id and question_id = p_question_id;
end;
$$;

-- ---- submit_exam_attempt -----------------------------------------------------
create or replace function public.submit_exam_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_attempt record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.student_id <> uid then raise exception 'Not your attempt'; end if;
  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('score', v_attempt.score);
  end if;
  perform public._grade_attempts(array[p_attempt_id]);
  return jsonb_build_object('score', (select score from public.exam_attempt where id = p_attempt_id));
end;
$$;

-- ---- grade_session_in_progress (admin; finalize abandoned attempts) ----------
create or replace function public.grade_session_in_progress(p_session_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_college uuid; v_ids uuid[];
begin
  select college_id into v_college from public.exam_session where id = p_session_id;
  if v_college is null then raise exception 'Session not found'; end if;
  if not public.has_college_permission('exam.assign', v_college) then raise exception 'Forbidden'; end if;
  select array_agg(id) into v_ids from public.exam_attempt
    where session_id = p_session_id and status = 'in_progress';
  if v_ids is null then return 0; end if;
  perform public._grade_attempts(v_ids);
  return array_length(v_ids, 1);
end;
$$;

-- ---- get_exam_result (student; gated on publish) -----------------------------
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
        'position', aq.position, 'stem', q.stem, 'awarded_marks', aq.awarded_marks,
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

-- ---- replace_blueprint_sections (atomic) -------------------------------------
create or replace function public.replace_blueprint_sections(p_exam_id uuid, p_sections jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_college uuid; sec jsonb; v_section_id uuid; q jsonb;
begin
  select college_id into v_college from public.exam where id = p_exam_id;
  if v_college is null then raise exception 'Blueprint not found'; end if;
  if not public.has_college_permission('exam.blueprint.manage', v_college) then raise exception 'Forbidden'; end if;
  if exists (select 1 from public.exam_session where exam_id = p_exam_id) then
    raise exception 'Blueprint already has sittings; sections cannot be replaced';
  end if;

  delete from public.exam_section where exam_id = p_exam_id;
  for sec in select * from jsonb_array_elements(p_sections) loop
    insert into public.exam_section
      (exam_id, subject_id, num_questions, marks_per_question,
       pct_easy, pct_medium, pct_hard, pct_very_hard, position)
    values (p_exam_id, (sec->>'subject_id')::uuid, (sec->>'num_questions')::int,
       (sec->>'marks_per_question')::numeric, (sec->>'pct_easy')::int, (sec->>'pct_medium')::int,
       (sec->>'pct_hard')::int, (sec->>'pct_very_hard')::int, (sec->>'position')::int)
    returning id into v_section_id;
    if jsonb_typeof(sec->'chapter_quota') = 'array' then
      for q in select * from jsonb_array_elements(sec->'chapter_quota') loop
        insert into public.exam_section_chapter (section_id, subject_id, chapter_id, pct)
        values (v_section_id, (sec->>'subject_id')::uuid, (q->>'chapter_id')::uuid, (q->>'pct')::int);
      end loop;
    end if;
  end loop;
end;
$$;

grant execute on function public.start_exam_attempt(uuid)                to authenticated;
grant execute on function public.save_exam_answer(uuid, uuid, uuid[])    to authenticated;
grant execute on function public.submit_exam_attempt(uuid)               to authenticated;
grant execute on function public.grade_session_in_progress(uuid)         to authenticated;
grant execute on function public.get_exam_result(uuid)                   to authenticated;
grant execute on function public.replace_blueprint_sections(uuid, jsonb) to authenticated;
