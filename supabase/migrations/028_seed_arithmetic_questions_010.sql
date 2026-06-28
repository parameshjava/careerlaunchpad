-- 028_seed_arithmetic_questions_010.sql  (chapter: Logarithms)
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

select public._seed_arith_q('Logarithms','easy','The value of log to base 10 of 1000 is',array['2','3','10','100'],2);
select public._seed_arith_q('Logarithms','easy','The value of log to base 2 of 8 is',array['2','3','4','8'],2);
select public._seed_arith_q('Logarithms','easy','The value of log to base 10 of 1 is',array['0','1','10','undefined'],1);
select public._seed_arith_q('Logarithms','medium','If log of x to base 10 is 2, then x is',array['20','100','200','10'],2);
select public._seed_arith_q('Logarithms','medium','log a + log b equals',array['log (a + b)','log (ab)','log (a/b)','log a × log b'],2);
select public._seed_arith_q('Logarithms','easy','The value of log to base 5 of 25 is',array['2','5','25','1'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
