-- 028_seed_arithmetic_questions_007.sql  (chapter: Problems on Numbers)
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

select public._seed_arith_q('Problems on Numbers','easy','The sum of two numbers is 25 and their difference is 5. The larger number is',array['10','15','20','12'],2);
select public._seed_arith_q('Problems on Numbers','easy','A number when multiplied by 7 gives 91. The number is',array['12','13','14','7'],2);
select public._seed_arith_q('Problems on Numbers','easy','Three consecutive integers have a sum of 72. The middle integer is',array['23','24','25','22'],2);
select public._seed_arith_q('Problems on Numbers','easy','If one-third of a number is 15, the number is',array['30','45','5','60'],2);
select public._seed_arith_q('Problems on Numbers','medium','The sum of a number and its half is 30. The number is',array['15','20','10','45'],2);
select public._seed_arith_q('Problems on Numbers','medium','A number exceeds its two-fifths by 90. The number is',array['120','150','90','180'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
