-- ============================================================================
-- 102_student_exam_window.sql
-- Student exam timing + list metadata:
--   1. list_my_exam_sessions() — everything the student "My exams" list shows:
--      sessions of the student's college + exam title/duration/pattern
--      (sections, marks) which students cannot read via RLS (exam/exam_section
--      stay staff-only; this SECURITY DEFINER RPC exposes only the metadata).
--   2. start_exam_attempt — 1-minute GRACE on both ends: the paper can be
--      fetched from opens_at - 1 min, and a resume (to auto-submit) is allowed
--      until closes_at + 1 min.
--   3. save_exam_answer — same +1 min grace past the deadline/close so the
--      final answer flush during auto-submit at the deadline still persists.
-- Idempotent.
-- ============================================================================

-- 1) Student list: sessions + exam pattern -------------------------------------
create or replace function public.list_my_exam_sessions()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id',        s.id,
    'label',             s.label,
    'status',            s.status,
    'opens_at',          s.opens_at,
    'closes_at',         s.closes_at,
    'results_published', s.results_published,
    'roster_status',     coalesce(r.status, 'invited'),
    'exam_title',        e.title,
    'duration_minutes',  e.duration_minutes,
    'negative_mark_per_wrong', e.negative_mark_per_wrong,
    'total_questions',   p.total_questions,
    'total_marks',       p.total_marks,
    'sections',          p.sections
  ) order by s.opens_at asc nulls last, s.created_at asc), '[]'::jsonb)
  from public.exam_session s
  join public.exam e on e.id = s.exam_id
  left join public.exam_session_student r
    on r.session_id = s.id and r.student_id = auth.uid()
  cross join lateral (
    select coalesce(sum(sec.num_questions), 0)                            as total_questions,
           coalesce(sum(sec.num_questions * sec.marks_per_question), 0)   as total_marks,
           coalesce(jsonb_agg(jsonb_build_object(
             'subject',            subj.name,
             'num_questions',      sec.num_questions,
             'marks_per_question', sec.marks_per_question
           ) order by sec.position), '[]'::jsonb)                         as sections
    from public.exam_section sec
    join public.subject subj on subj.id = sec.subject_id
    where sec.exam_id = e.id
  ) p
  where public.is_student_of_college(s.college_id);
$$;
grant execute on function public.list_my_exam_sessions() to authenticated;

-- 2) start_exam_attempt — open window widened by 1 min on each side ------------
--    (otherwise identical to the 095 version)
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

  insert into public.exam_session_student (session_id, student_id, status)
  values (p_session_id, uid, 'started')
  on conflict (session_id, student_id) do nothing;

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

-- 3) save_exam_answer — +1 min grace so the auto-submit flush persists ---------
--    (otherwise identical to the 022 version)
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
  if now() > v.started_at + make_interval(mins => v.duration_minutes) + interval '1 minute'
     or (v.closes_at is not null and now() > v.closes_at + interval '1 minute') then
    raise exception 'Time is up';
  end if;

  update public.exam_attempt_question set selected_option_ids = coalesce(p_selected, '{}')
    where attempt_id = p_attempt_id and question_id = p_question_id;
end;
$$;
