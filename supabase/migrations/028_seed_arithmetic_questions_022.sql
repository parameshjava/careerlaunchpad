-- 028_seed_arithmetic_questions_022.sql  (chapter: Simple Interest)
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

select public._seed_arith_q('Simple Interest','easy','The simple interest on ₹1000 at 5% per annum for 2 years is',array['₹50','₹100','₹150','₹200'],2);
select public._seed_arith_q('Simple Interest','easy','The simple interest on ₹2000 at 10% per annum for 1 year is',array['₹100','₹200','₹220','₹20'],2);
select public._seed_arith_q('Simple Interest','easy','The simple interest on ₹500 for 4 years at 5% per annum is',array['₹100','₹120','₹80','₹125'],1);
select public._seed_arith_q('Simple Interest','medium','At what rate per annum will ₹1000 yield ₹200 as simple interest in 2 years?',array['5%','10%','20%','15%'],2);
select public._seed_arith_q('Simple Interest','medium','₹800 amounts to ₹960 in 2 years at simple interest. The rate per annum is',array['8%','10%','12%','20%'],2);
select public._seed_arith_q('Simple Interest','medium','The simple interest on ₹1200 at 6% per annum for 6 months is',array['₹36','₹72','₹144','₹18'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
