-- 031_seed_reasoning_questions_007.sql  (Reasoning chapter: Classification)
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

select public._seed_subject_q('Reasoning','Classification','easy','Find the odd one out: Rose, Lotus, Lily, Mango',array['Rose','Lotus','Lily','Mango'],4);
select public._seed_subject_q('Reasoning','Classification','easy','Find the odd one out: Apple, Banana, Carrot, Mango',array['Apple','Banana','Carrot','Mango'],3);
select public._seed_subject_q('Reasoning','Classification','easy','Find the odd one out: Dog, Cat, Cow, Sparrow',array['Dog','Cat','Cow','Sparrow'],4);
select public._seed_subject_q('Reasoning','Classification','medium','Find the odd one out: 2, 3, 5, 9',array['2','3','5','9'],4);
select public._seed_subject_q('Reasoning','Classification','medium','Find the odd one out: Square, Circle, Triangle, Cube',array['Square','Circle','Triangle','Cube'],4);
select public._seed_subject_q('Reasoning','Classification','medium','Find the odd one out: Copper, Iron, Gold, Plastic',array['Copper','Iron','Gold','Plastic'],4);

drop function public._seed_subject_q(text, text, text, text, text[], int);
