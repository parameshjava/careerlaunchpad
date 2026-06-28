-- 028_seed_arithmetic_questions_008.sql  (chapter: Problems on Ages)
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

select public._seed_arith_q('Problems on Ages','easy','The present age of A is 30 years. His age after 5 years will be',array['25','35','40','30'],2);
select public._seed_arith_q('Problems on Ages','easy','A is twice as old as B. If B is 12 years old, A is',array['20','24','36','12'],2);
select public._seed_arith_q('Problems on Ages','medium','The ratio of the ages of A and B is 3:4 and the sum of their ages is 35. The age of A is',array['15','20','21','14'],1);
select public._seed_arith_q('Problems on Ages','easy','Five years ago a man''s age was 25 years. His present age is',array['20','30','35','25'],2);
select public._seed_arith_q('Problems on Ages','medium','The sum of the ages of a mother and her daughter is 50 years. The mother is 4 times as old as the daughter. The daughter''s age is',array['10','12','40','8'],1);
select public._seed_arith_q('Problems on Ages','easy','A is 4 years older than B. If B is 16, then A is',array['12','20','24','16'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
