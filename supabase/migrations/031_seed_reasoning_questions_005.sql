-- 031_seed_reasoning_questions_005.sql  (Reasoning chapter: Direction Sense)
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

select public._seed_subject_q('Reasoning','Direction Sense','medium','A man walks 3 km north, then 4 km east. How far is he from the starting point?',array['7 km','5 km','1 km','12 km'],2);
select public._seed_subject_q('Reasoning','Direction Sense','easy','If you face north and turn right, you now face',array['west','east','south','north'],2);
select public._seed_subject_q('Reasoning','Direction Sense','easy','If you face south and turn left, you now face',array['west','east','north','south'],2);
select public._seed_subject_q('Reasoning','Direction Sense','easy','The sun rises in the',array['west','east','north','south'],2);
select public._seed_subject_q('Reasoning','Direction Sense','medium','A person walks 5 km south and then 5 km north. The distance from the start is',array['10 km','0 km','5 km','25 km'],2);
select public._seed_subject_q('Reasoning','Direction Sense','medium','Facing east, after turning 180 degrees you face',array['north','west','south','east'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
