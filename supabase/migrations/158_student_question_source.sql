-- ============================================================================
-- 158_student_question_source.sql
-- Issue #87 — surface a question's provenance to the STUDENT, so an assessment
-- or mock test visibly consists of real past-paper questions ("Asked in TS ICET
-- 2024") instead of anonymous MCQs. That confidence signal is the whole point of
-- importing past papers, and until now only staff could see it: the columns
-- landed in 145 (question.source / source_year, assessment_question.source /
-- source_year) and the console shows them, but every student-facing read dropped
-- them on the floor.
--
-- Nothing here changes storage, gating, or grading. Three student-facing reads
-- gain two fields each:
--   1) start_exam_attempt      — the mock-test paper (per question, while taking it)
--   2) get_chapter_quiz_attempt — the assessment paper (same, chapter quizzes)
--   3) get_exam_result          — the published answer key / review
--
-- WHY THE FULL BODIES ARE REPEATED
--   These are `create or replace` functions with no schema-diff tooling in the
--   pipeline, so a change of shape means restating the latest body. Each one below
--   is byte-for-byte its predecessor plus the two source fields; the predecessor is
--   named in a comment so the next editor knows which file to diff against.
--
-- get_chapter_quiz_attempt is DROPPED first: it returns a `table (...)`, and
-- Postgres refuses to `create or replace` a function whose OUT parameter list
-- changed ("cannot change return type of existing function"). The drop + create
-- pair is safe because nothing holds a dependency on it (it is called by RPC only).
--
-- Both fields are nullable and stay null for hand-authored questions — the UI
-- shows a chip only when a source exists, so an unsourced bank looks exactly as
-- it does today. Idempotent.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) start_exam_attempt — supersedes 118 (last_position). Body identical to 118
--    apart from 'source' / 'source_year' in the per-question object.
-- ---------------------------------------------------------------------------
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
          -- Provenance (#87): the past paper this question was asked in.
          'source', q.source, 'source_year', q.source_year,
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

-- ---------------------------------------------------------------------------
-- 2) get_exam_result — supersedes 104 (sections). Body identical apart from
--    'source' / 'source_year'. Still gated on results_published.
-- ---------------------------------------------------------------------------
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
        'max_marks', sec.marks_per_question,
        'subject', subj.name,
        -- Provenance (#87): the past paper this question was asked in.
        'source', q.source, 'source_year', q.source_year,
        'selected_option_ids', aq.selected_option_ids,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct)
                 order by o.position)
          from public.question_option o where o.question_id = q.id), '[]'::jsonb)
      ) order by aq.position)
      from public.exam_attempt_question aq
      join public.question q on q.id = aq.question_id
      left join public.exam_section sec on sec.id = aq.section_id
      left join public.subject subj on subj.id = sec.subject_id
      where aq.attempt_id = v_attempt.id), '[]'::jsonb));
end;
$$;

grant execute on function public.get_exam_result(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) get_chapter_quiz_attempt — supersedes 143 §7f. Same row-per-option shape
--    (still NO is_correct), plus source / source_year. Dropped first because the
--    OUT list changed; re-granted below since the drop takes the grant with it.
-- ---------------------------------------------------------------------------
drop function if exists public.get_chapter_quiz_attempt(uuid);

create or replace function public.get_chapter_quiz_attempt(p_attempt_id uuid)
returns table (
  q_position      int,
  question_id     uuid,
  stem            text,
  stem_image_url  text,
  answer_type     text,
  source          text,
  source_year     int,
  option_id       uuid,
  option_label    text,
  option_position int,
  selected        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select aq.position, q.id, q.stem, q.stem_image_url, q.answer_type,
         q.source, q.source_year,
         o.id, o.label, o.position,
         (o.id = any (aq.selected_option_ids))
  from public.chapter_quiz_attempt a
  join public.chapter_quiz_attempt_question aq on aq.attempt_id = a.id
  join public.assessment_question q            on q.id = aq.question_id
  join public.assessment_question_option o     on o.question_id = q.id
  where a.id = p_attempt_id and a.student_id = auth.uid()
  order by aq.position, o.position;
$$;

grant execute on function public.get_chapter_quiz_attempt(uuid) to authenticated;

commit;
