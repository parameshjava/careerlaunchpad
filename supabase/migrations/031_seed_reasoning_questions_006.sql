-- 031_seed_reasoning_questions_006.sql  (Reasoning chapter: Analogy)
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

select public._seed_subject_q('Reasoning','Analogy','easy','Hand is to glove as foot is to',array['hat','sock','head','ring'],2);
select public._seed_subject_q('Reasoning','Analogy','easy','Dog is to puppy as cat is to',array['kitten','calf','cub','foal'],1);
select public._seed_subject_q('Reasoning','Analogy','easy','Hot is to cold as up is to',array['high','down','top','over'],2);
select public._seed_subject_q('Reasoning','Analogy','medium','Pen is to write as knife is to',array['cut','eat','draw','read'],1);
select public._seed_subject_q('Reasoning','Analogy','easy','Teacher is to school as doctor is to',array['hospital','court','office','shop'],1);
select public._seed_subject_q('Reasoning','Analogy','easy','Bird is to fly as fish is to',array['walk','swim','run','jump'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
