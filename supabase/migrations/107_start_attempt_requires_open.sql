-- ============================================================================
-- 107_start_attempt_requires_open.sql
-- Make the sitting's status authoritative for ENTRY. Previously start_exam_attempt
-- gated only on the time window (opens_at/closes_at), so a rostered student could
-- begin whenever the clock was open regardless of status, and closing early did
-- not actually block new starts. Now a NEW attempt requires status = 'open':
--   • Open button = students may enter.
--   • Close = entry blocked immediately, even if closes_at is still in the future.
-- Resumes of an already in-progress attempt are unaffected, so closing mid-exam
-- (which auto-grades in-progress attempts) never strands a student who is finishing
-- within the time window. Idempotent — only the new-attempt guard is added.
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

  -- Time window with a 1-minute grace on both sides: the paper is fetchable
  -- 1 min before opens_at; a resume within 1 min after closes_at is allowed so
  -- the client can auto-submit (the ends_at below still clamps to closes_at).
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
    -- New entries require the sitting to be actively open. Resumes (the branch
    -- above) skip this, so closing mid-exam lets in-progress students finish.
    if v_session.status <> 'open' then raise exception 'This exam is not open'; end if;

    insert into public.exam_session_student (session_id, student_id, status)
    values (p_session_id, uid, 'started')
    on conflict (session_id, student_id) do nothing;

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
