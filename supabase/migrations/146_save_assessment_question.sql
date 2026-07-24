-- ============================================================================
-- 146_save_assessment_question.sql
-- Transactional, RLS-crossing write path for the assessment question bank,
-- fixing three code-review findings in app/api/assessment/questions/[id]:
--
--  (1) The immutability guard was defeated: the route counted
--      chapter_quiz_attempt_question under the ADMIN's RLS session, but the only
--      SELECT policy on that table is self-read (student_id = auth.uid()), so an
--      admin always saw zero rows and the "used in a quiz — can't edit" 409 never
--      fired. This SECURITY DEFINER function checks the reference by bypassing RLS.
--  (2) The route swallowed a failed count (treated an error as "not referenced").
--      Here any failure raises, so the caller returns 500 rather than silently
--      editing a referenced question.
--  (3)/(4) Option replace / create were non-transactional delete-then-insert with
--      no rollback, risking a question left with zero options. A plpgsql function
--      body is one transaction, so create/update + option replacement are atomic.
--
-- One function handles both create (p_id null) and edit. Idempotent.
-- ============================================================================

begin;

create or replace function public.save_assessment_question(
  p_id             uuid,        -- null = create; non-null = edit
  p_subject_id     uuid,
  p_chapter_id     uuid,
  p_kind           text,
  p_difficulty     text,
  p_answer_type    text,
  p_stem           text,
  p_stem_image_url text,
  p_explanation    text,
  p_source         text,
  p_source_year    int,
  p_options        jsonb        -- [{ label, is_correct, position }]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_qid uuid;
  o     jsonb;
begin
  if not public.has_permission('exam.question.manage') then
    raise exception 'Forbidden';
  end if;

  if p_id is not null then
    -- Immutability guard (bypasses RLS as definer): a question already used in a
    -- quiz attempt is frozen — its option UUIDs are referenced by attempt snapshots.
    if exists (
      select 1 from public.chapter_quiz_attempt_question where question_id = p_id
    ) then
      raise exception 'REFERENCED: question is used in a quiz attempt and cannot be edited';
    end if;

    update public.assessment_question set
      subject_id     = p_subject_id,
      chapter_id     = p_chapter_id,
      kind           = p_kind,
      difficulty     = p_difficulty,
      answer_type    = p_answer_type,
      stem           = p_stem,
      stem_image_url = p_stem_image_url,
      explanation    = p_explanation,
      source         = p_source,
      source_year    = p_source_year,
      version        = version + 1,
      updated_at     = now()
    where id = p_id
    returning id into v_qid;

    if v_qid is null then
      raise exception 'NOT_FOUND: assessment question % does not exist', p_id;
    end if;

    delete from public.assessment_question_option where question_id = p_id;
  else
    insert into public.assessment_question (
      subject_id, chapter_id, kind, difficulty, answer_type,
      stem, stem_image_url, explanation, source, source_year, created_by
    ) values (
      p_subject_id, p_chapter_id, p_kind, p_difficulty, p_answer_type,
      p_stem, p_stem_image_url, p_explanation, p_source, p_source_year, v_uid
    )
    returning id into v_qid;
  end if;

  for o in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb))
  loop
    insert into public.assessment_question_option (question_id, label, is_correct, position)
    values (v_qid, o->>'label', (o->>'is_correct')::boolean, (o->>'position')::int);
  end loop;

  return v_qid;
end;
$$;

grant execute on function public.save_assessment_question(
  uuid, uuid, uuid, text, text, text, text, text, text, text, int, jsonb
) to authenticated;

commit;
