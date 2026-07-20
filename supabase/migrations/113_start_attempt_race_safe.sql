-- ============================================================================
-- 113_start_attempt_race_safe.sql
-- Fix: students hit "duplicate key value violates unique constraint
-- exam_attempt_session_id_student_id_key" when a scheduled exam opens.
--
-- start_exam_attempt did SELECT-then-INSERT with no conflict guard on
-- exam_attempt. When the sitting auto-opens, the client can fire two starts in
-- quick succession (auto-open poll + first render / a double-tap); both SELECT
-- find no attempt, both INSERT, and the second violates the (session_id,
-- student_id) unique key. The exam_session_student insert right above already
-- guards with ON CONFLICT DO NOTHING — the attempt insert didn't.
--
-- Make the attempt insert race-safe: ON CONFLICT DO NOTHING, and if we lost the
-- race, load the attempt the winner created. Its questions are committed by then
-- because our insert blocked on the winner's row lock until it committed, so we
-- only seed exam_attempt_question when WE created the attempt. Everything else is
-- identical to 109. Idempotent.
-- ============================================================================

create or replace function public.start_exam_attempt(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_session record; v_paper_id uuid; v_attempt record; v_duration int; v_ends_at timestamptz;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into v_session from public.exam_session where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_student_of_college(v_session.college_id) then
    raise exception 'This exam is not available to you';
  end if;

  -- Time window with a 1-minute grace on both sides (see 109).
  if v_session.opens_at is null or now() < v_session.opens_at - interval '1 minute' then
    raise exception 'This exam has not opened yet';
  end if;
  if v_session.closes_at is not null and now() > v_session.closes_at + interval '1 minute' then
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
    -- Auto-open: a new entry is allowed once the time window (checked above) is
    -- live, UNLESS the sitting was explicitly ended (see 109).
    if v_session.status in ('closed', 'graded') then raise exception 'This exam is closed'; end if;

    insert into public.exam_session_student (session_id, student_id, status)
    values (p_session_id, uid, 'started')
    on conflict (session_id, student_id) do nothing;

    -- Race-safe: a concurrent start may have created the attempt already.
    insert into public.exam_attempt (session_id, student_id, status)
    values (p_session_id, uid, 'in_progress')
    on conflict (session_id, student_id) do nothing
    returning * into v_attempt;

    if not found then
      -- Lost the race: the concurrent start won; load its attempt (its questions
      -- are committed — our insert blocked on its row lock until it committed).
      select * into v_attempt from public.exam_attempt
        where session_id = p_session_id and student_id = uid;
    else
      -- We created it: seed the per-attempt question rows from the paper.
      insert into public.exam_attempt_question
        (attempt_id, question_id, question_version, section_id, position)
      select v_attempt.id, pq.question_id, pq.question_version, pq.section_id, pq.position
      from public.exam_paper_question pq where pq.paper_id = v_paper_id;
      update public.exam_session_student set status = 'started'
        where session_id = p_session_id and student_id = uid and status = 'invited';
    end if;
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
