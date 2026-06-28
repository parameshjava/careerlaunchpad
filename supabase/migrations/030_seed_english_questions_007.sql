-- 030_seed_english_questions_007.sql  (English chapter: Reading Comprehension)
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

select public._seed_subject_q('English','Reading Comprehension','easy','Passage: Ravi goes to school by bus every morning. According to the passage, how does Ravi travel to school?',array['By car','By bus','On foot','By train'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: The sun rises in the east and sets in the west. Where does the sun set?',array['East','West','North','South'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: Maya has three cats and two dogs. How many pets does Maya have in total?',array['Three','Five','Two','Six'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: The library opens at 9 am and closes at 6 pm. At what time does the library open?',array['6 am','9 am','6 pm','9 pm'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: Water boils at 100 degrees Celsius. At what temperature does water boil?',array['0°C','50°C','100°C','212°C'],3);
select public._seed_subject_q('English','Reading Comprehension','medium','Passage: Tom saved ₹50 each week for four weeks. How much did Tom save in total?',array['₹50','₹100','₹200','₹150'],3);

drop function public._seed_subject_q(text, text, text, text, text[], int);
