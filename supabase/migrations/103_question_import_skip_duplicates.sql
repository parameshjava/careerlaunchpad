-- ============================================================================
-- 103_question_import_skip_duplicates.sql
-- Make bulk question import idempotent: instead of ABORTING the whole file when a
-- question already exists in the bank (same chapter + stem), SKIP that question
-- and import the rest. This lets large generated banks that partially overlap the
-- existing bank import cleanly (re-runs insert only what is new). Returns the
-- number of questions actually inserted. Supersedes the duplicate guard in 094.
-- ============================================================================

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
      stem, stem_image_url, explanation, created_by
    ) values (
      p_subject_id, v_chapter_id, v_passage_id,
      q->>'kind', q->>'difficulty', q->>'answer_type',
      v_stem, nullif(q->>'stem_image_url', ''), nullif(q->>'explanation', ''), v_uid
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
