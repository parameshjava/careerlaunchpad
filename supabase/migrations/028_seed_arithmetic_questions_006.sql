-- 028_seed_arithmetic_questions_006.sql  (chapter: Average)
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

select public._seed_arith_q('Average','easy','The average of the first 5 natural numbers is',array['2.5','3','3.5','4'],2);
select public._seed_arith_q('Average','easy','The average of 2, 4, 6, 8 and 10 is',array['5','6','7','30'],2);
select public._seed_arith_q('Average','easy','The average of 10, 20, 30, 40 and 50 is',array['25','30','35','150'],2);
select public._seed_arith_q('Average','medium','The average of the first 10 even numbers is',array['10','11','12','55'],2);
select public._seed_arith_q('Average','medium','The mean of three numbers is 20. If two of them are 18 and 22, the third number is',array['18','20','22','24'],2);
select public._seed_arith_q('Average','medium','The average of the first 7 multiples of 3 is',array['9','12','15','84'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
