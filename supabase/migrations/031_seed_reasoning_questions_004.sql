-- 031_seed_reasoning_questions_004.sql  (Reasoning chapter: Blood Relations)
-- Verified Reasoning MCQs. Single-answer, idempotent. Depends on 029 (Reasoning subject).
-- ============================================================================
create or replace function public._seed_subject_q(
  p_subject text, p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int
) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name) = lower(p_subject) limit 1;
  if v_subj is null then raise exception 'Subject % not found', p_subject; end if;
  select id into v_chap from public.chapter
    where subject_id = v_subj and lower(name) = lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found in %', p_chapter, p_subject; end if;
  if exists (select 1 from public.question where chapter_id = v_chap and stem = p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem) returning id into v_qid;
  for i in 1 .. array_length(p_opts, 1) loop
    insert into public.question_option (question_id, label, is_correct, position)
    values (v_qid, p_opts[i], i = p_correct, i - 1);
  end loop;
end;
$$;

select public._seed_subject_q('Reasoning','Blood Relations','medium','Pointing to a man, a woman said, "He is the son of my mother." The man is the woman''s',array['father','brother','son','uncle'],2);
select public._seed_subject_q('Reasoning','Blood Relations','easy','A is the father of B, and B is the daughter of A. So A is B''s',array['mother','father','brother','uncle'],2);
select public._seed_subject_q('Reasoning','Blood Relations','easy','My father''s brother is my',array['cousin','uncle','nephew','grandfather'],2);
select public._seed_subject_q('Reasoning','Blood Relations','easy','My mother''s sister is my',array['niece','aunt','cousin','sister'],2);
select public._seed_subject_q('Reasoning','Blood Relations','medium','The daughter of my brother is my',array['niece','nephew','cousin','sister'],1);
select public._seed_subject_q('Reasoning','Blood Relations','easy','My son''s son is my',array['nephew','grandson','son','cousin'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
