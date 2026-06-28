-- 028_seed_arithmetic_questions_009.sql  (chapter: Surds and Indices)
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

select public._seed_arith_q('Surds and Indices','easy','The value of 2^3 × 2^2 is',array['16','32','64','8'],2);
select public._seed_arith_q('Surds and Indices','easy','The value of (3^2)^3 is',array['243','729','81','27'],2);
select public._seed_arith_q('Surds and Indices','easy','The value of 5^0 is',array['0','1','5','25'],2);
select public._seed_arith_q('Surds and Indices','medium','The value of the square root of 2 times the square root of 8 is',array['2','4','8','16'],2);
select public._seed_arith_q('Surds and Indices','medium','The value of 2^(-2) is',array['4','0.25','-4','0.5'],2);
select public._seed_arith_q('Surds and Indices','medium','The value of 16^(3/4) is',array['8','12','64','4'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
