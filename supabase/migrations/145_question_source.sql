-- ============================================================================
-- 145_question_source.sql
-- Provenance for both question banks: where a question originally appeared (which
-- past paper / test), captured as a free-text label + an optional year so it can
-- be filtered/grouped in analytics later. Follows the simple defaulted-text
-- precedent of student_intake.source (011), but split out the year as its own
-- column. Both nullable — hand-authored questions may have no source.
--
--   source       text  -- e.g. "ICET 2019 - Slot 2", "SBI PO 2021 Prelims"
--   source_year  int   -- e.g. 2019 (nullable, filterable)
--
-- Applies to the exam bank (question, 021) AND the assessment bank
-- (assessment_question, 143). The two bulk-import RPCs are re-created to carry the
-- new fields. Idempotent.
-- ============================================================================

begin;

-- 1) Columns on both banks.
alter table public.question            add column if not exists source      text;
alter table public.question            add column if not exists source_year int;
alter table public.assessment_question add column if not exists source      text;
alter table public.assessment_question add column if not exists source_year int;

-- 2) Re-create import_questions (supersedes 103) to carry source/source_year.
create or replace function public.import_questions(
  p_subject_id uuid,
  p_passages   jsonb,
  p_questions  jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  p            jsonb;
  q            jsonb;
  o            jsonb;
  v_ref_map    jsonb := '{}'::jsonb;
  v_passage_id uuid;
  v_chapter_id uuid;
  v_stem       text;
  v_qid        uuid;
  n_inserted   int := 0;
begin
  if not public.has_permission('exam.question.manage') then
    raise exception 'not authorized to import questions';
  end if;
  if not exists (select 1 from public.subject where id = p_subject_id) then
    raise exception 'subject not found';
  end if;

  for p in select * from jsonb_array_elements(coalesce(p_passages, '[]'::jsonb))
  loop
    insert into public.passage (subject_id, title, body, created_by)
    values (p_subject_id, nullif(p->>'title', ''), p->>'body', v_uid)
    returning id into v_passage_id;
    v_ref_map := v_ref_map || jsonb_build_object(p->>'ref', v_passage_id::text);
  end loop;

  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb))
  loop
    v_chapter_id := (q->>'chapter_id')::uuid;
    v_stem := q->>'stem';

    if not exists (
      select 1 from public.chapter where id = v_chapter_id and subject_id = p_subject_id
    ) then
      raise exception 'chapter % is not in the selected subject', v_chapter_id;
    end if;

    -- Already in the bank (or inserted earlier in this same batch)? Skip it.
    if exists (
      select 1 from public.question
      where chapter_id = v_chapter_id and lower(btrim(stem)) = lower(btrim(v_stem))
    ) then
      continue;
    end if;

    v_passage_id := case
      when nullif(q->>'passage_ref', '') is not null
      then (v_ref_map->>(q->>'passage_ref'))::uuid
      else null
    end;

    insert into public.question (
      subject_id, chapter_id, passage_id, kind, difficulty, answer_type,
      stem, stem_image_url, explanation, source, source_year, created_by
    ) values (
      p_subject_id, v_chapter_id, v_passage_id,
      q->>'kind', q->>'difficulty', q->>'answer_type',
      v_stem, nullif(q->>'stem_image_url', ''), nullif(q->>'explanation', ''),
      nullif(q->>'source', ''), nullif(q->>'source_year', '')::int, v_uid
    )
    returning id into v_qid;

    for o in select * from jsonb_array_elements(q->'options')
    loop
      insert into public.question_option (question_id, label, is_correct, position)
      values (v_qid, o->>'label', (o->>'is_correct')::boolean, (o->>'position')::int);
    end loop;

    n_inserted := n_inserted + 1;
  end loop;

  return n_inserted;
end;
$$;

grant execute on function public.import_questions(uuid, jsonb, jsonb) to authenticated;

-- 3) Re-create import_assessment_questions (supersedes 144) to carry source/source_year.
create or replace function public.import_assessment_questions(
  p_subject_id uuid,
  p_questions  jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  q            jsonb;
  o            jsonb;
  v_chapter_id uuid;
  v_stem       text;
  v_qid        uuid;
  n_inserted   int := 0;
begin
  if not public.has_permission('exam.question.manage') then
    raise exception 'not authorized to import assessment questions';
  end if;
  if not exists (select 1 from public.subject where id = p_subject_id) then
    raise exception 'subject not found';
  end if;

  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb))
  loop
    v_chapter_id := (q->>'chapter_id')::uuid;
    v_stem := q->>'stem';

    if not exists (
      select 1 from public.chapter where id = v_chapter_id and subject_id = p_subject_id
    ) then
      raise exception 'chapter % is not in the selected subject', v_chapter_id;
    end if;

    if exists (
      select 1 from public.assessment_question
      where chapter_id = v_chapter_id and lower(btrim(stem)) = lower(btrim(v_stem))
    ) then
      continue;
    end if;

    insert into public.assessment_question (
      subject_id, chapter_id, kind, difficulty, answer_type,
      stem, stem_image_url, explanation, source, source_year, created_by
    ) values (
      p_subject_id, v_chapter_id,
      q->>'kind', q->>'difficulty', q->>'answer_type',
      v_stem, nullif(q->>'stem_image_url', ''), nullif(q->>'explanation', ''),
      nullif(q->>'source', ''), nullif(q->>'source_year', '')::int, v_uid
    )
    returning id into v_qid;

    for o in select * from jsonb_array_elements(q->'options')
    loop
      insert into public.assessment_question_option (question_id, label, is_correct, position)
      values (v_qid, o->>'label', (o->>'is_correct')::boolean, (o->>'position')::int);
    end loop;

    n_inserted := n_inserted + 1;
  end loop;

  return n_inserted;
end;
$$;

grant execute on function public.import_assessment_questions(uuid, jsonb) to authenticated;

commit;
