-- ============================================================================
-- 118_exam_last_position.sql
-- Precise cursor restore. Track the question the student is currently on
-- (exam_attempt.last_position, a 0-based index into the ordered paper) and hand
-- it back on resume so a resumed student lands exactly where they left off — not
-- at Q1, and not merely the first unanswered question (which differs if they
-- answered out of order).
--   • last_position column (nullable; null = never navigated / start at top).
--   • save_exam_position(attempt, pos): student records their cursor (fire-and-forget).
--   • start_exam_attempt: return last_position. Body otherwise identical to
--     migration 116 (self-resume + section_title/section_position).
-- New migration (not an edit to 116) because 116 is already merged & applied.
-- Idempotent.
-- ============================================================================

alter table public.exam_attempt add column if not exists last_position int;

-- Record the student's current question. Only their own live attempt; a no-op
-- once the attempt leaves in_progress so a stale write can't move a locked paper.
create or replace function public.save_exam_position(p_attempt_id uuid, p_position int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_attempt record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into v_attempt from public.exam_attempt where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.student_id <> uid then raise exception 'Not your attempt'; end if;
  if v_attempt.status <> 'in_progress' then return; end if;
  update public.exam_attempt set last_position = p_position where id = p_attempt_id;
end;
$$;
grant execute on function public.save_exam_position(uuid, int) to authenticated;

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
    'last_position', v_attempt.last_position,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', aq.position, 'question_id', q.id, 'section_id', aq.section_id,
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
