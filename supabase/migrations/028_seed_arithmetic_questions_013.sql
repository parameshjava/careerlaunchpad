-- 028_seed_arithmetic_questions_013.sql  (chapter: Ratio and Proportion)
-- Verified Arithmetic MCQs. Single-answer, 4-5 options, idempotent. Depends on 023.
-- ============================================================================
create or replace function public._seed_arith_q(
  p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int
) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name) = 'arithmetic' limit 1;
  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;
  select id into v_chap from public.chapter
    where subject_id = v_subj and lower(name) = lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;
  if exists (select 1 from public.question where chapter_id = v_chap and stem = p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem) returning id into v_qid;
  for i in 1 .. array_length(p_opts, 1) loop
    insert into public.question_option (question_id, label, is_correct, position)
    values (v_qid, p_opts[i], i = p_correct, i - 1);
  end loop;
end;
$$;

select public._seed_arith_q('Ratio and Proportion','easy','The ratio 4 : 6 in its simplest form is',array['2 : 3','3 : 2','4 : 6','1 : 2'],1);
select public._seed_arith_q('Ratio and Proportion','medium','If a : b = 2 : 3 and b : c = 4 : 5, then a : c is',array['8 : 15','2 : 5','6 : 5','8 : 5'],1);
select public._seed_arith_q('Ratio and Proportion','medium','Two numbers are in the ratio 3 : 5 and their sum is 64. The smaller number is',array['24','40','32','30'],1);
select public._seed_arith_q('Ratio and Proportion','medium','The fourth proportional to 4, 6 and 8 is',array['10','12','14','16'],2);
select public._seed_arith_q('Ratio and Proportion','easy','When ₹600 is divided in the ratio 1 : 2, the larger share is',array['₹200','₹400','₹300','₹450'],2);
select public._seed_arith_q('Ratio and Proportion','medium','The mean proportional between 9 and 16 is',array['12','12.5','24','144'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
