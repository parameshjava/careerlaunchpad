-- ============================================================================
-- 144_import_assessment_questions.sql
-- Bulk JSON import for the ASSESSMENT question bank (migration 143), mirroring
-- import_questions (094/103) but for assessment_question / assessment_question_option.
-- No passages (Q10: standalone MCQs only). One subject per file; inserts in ONE
-- transaction (all-or-nothing per call). Duplicates (same chapter + stem, already
-- in the bank or earlier in the same batch) are SKIPPED, not aborted, so a file
-- that partially overlaps the bank still imports what's new.
--
-- The API route does the full dry-run validation and passes rows carrying a
-- resolved chapter_id; this function TRUSTS NOTHING — it re-checks the permission
-- (DEFINER bypasses RLS) and re-runs the chapter guard. Idempotent.
-- ============================================================================

begin;

create or replace function public.import_assessment_questions(
  p_subject_id uuid,
  p_questions  jsonb   -- [{ chapter_id, kind, difficulty, answer_type, stem,
                       --    stem_image_url?, explanation?, options:[{label,is_correct,position}] }]
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

    -- Already in the bank (or inserted earlier in this same batch)? Skip it.
    if exists (
      select 1 from public.assessment_question
      where chapter_id = v_chapter_id and lower(btrim(stem)) = lower(btrim(v_stem))
    ) then
      continue;
    end if;

    insert into public.assessment_question (
      subject_id, chapter_id, kind, difficulty, answer_type,
      stem, stem_image_url, explanation, created_by
    ) values (
      p_subject_id, v_chapter_id,
      q->>'kind', q->>'difficulty', q->>'answer_type',
      v_stem, nullif(q->>'stem_image_url', ''), nullif(q->>'explanation', ''), v_uid
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
