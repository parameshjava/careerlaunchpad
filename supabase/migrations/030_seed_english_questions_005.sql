-- 030_seed_english_questions_005.sql  (English chapter: Idioms and Phrases)
-- Verified English MCQs. Single-answer, idempotent. Depends on 029 (English subject).
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

select public._seed_subject_q('English','Idioms and Phrases','medium','The idiom "to break the ice" means',array['to start a conversation','to break something','to feel cold','to win a prize'],1);
select public._seed_subject_q('English','Idioms and Phrases','easy','The phrase "a piece of cake" means',array['a dessert','something very easy','a difficult task','a small portion'],2);
select public._seed_subject_q('English','Idioms and Phrases','medium','The idiom "to let the cat out of the bag" means',array['to free a cat','to reveal a secret','to make a mistake','to buy a pet'],2);
select public._seed_subject_q('English','Idioms and Phrases','medium','The phrase "once in a blue moon" means',array['very rarely','very often','at night','never'],1);
select public._seed_subject_q('English','Idioms and Phrases','medium','The idiom "to hit the books" means',array['to study hard','to throw books','to read for fun','to write a book'],1);
select public._seed_subject_q('English','Idioms and Phrases','medium','The phrase "under the weather" means',array['outside','feeling ill','raining','very happy'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
