-- ============================================================================
-- 116_exam_question_subject.sql
-- Surface each question's subject on the exam runner so the question palette can
-- group by section (subject) and label each question with its subject. Adds
-- `section_title` (subject name) and `section_position` (section order) to every
-- question object returned by start_exam_attempt. Body is otherwise identical to
-- the migration 115 version.
-- Idempotent (create or replace).
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
    if v_attempt.status = 'aborted' then
      if v_attempt.resume_count = 0 then
        -- First-time self-resume: flip back to in_progress and hand it back.
        update public.exam_attempt set status = 'in_progress', resume_count = 1
          where id = v_attempt.id
          returning * into v_attempt;
      else
        raise exception 'This exam was closed and is awaiting review by your administrator.';
      end if;
    elsif v_attempt.status <> 'in_progress' then
      raise exception 'You have already submitted this exam';
    end if;
  else
    if v_session.status in ('closed', 'graded') then raise exception 'This exam is closed'; end if;

    insert into public.exam_session_student (session_id, student_id, status)
    values (p_session_id, uid, 'started')
    on conflict (session_id, student_id) do nothing;

    insert into public.exam_attempt (session_id, student_id, status)
    values (p_session_id, uid, 'in_progress')
    on conflict (session_id, student_id) do nothing
    returning * into v_attempt;

    if not found then
      select * into v_attempt from public.exam_attempt
        where session_id = p_session_id and student_id = uid;
    else
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
          -- Subject the question belongs to, so the palette can band by section.
          'section_title', subj.name, 'section_position', es.position,
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
      from public.exam_attempt_question aq
        join public.question q on q.id = aq.question_id
        left join public.exam_section es on es.id = aq.section_id
        left join public.subject subj on subj.id = es.subject_id
      where aq.attempt_id = v_attempt.id
    ), '[]'::jsonb));
end;
$$;
