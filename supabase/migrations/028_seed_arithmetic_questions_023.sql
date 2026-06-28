-- 028_seed_arithmetic_questions_023.sql  (chapter: Compound Interest)
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

select public._seed_arith_q('Compound Interest','medium','The compound interest on ₹1000 at 10% per annum for 2 years is',array['₹200','₹210','₹220','₹100'],2);
select public._seed_arith_q('Compound Interest','easy','The amount on ₹2000 at 10% per annum compounded annually for 1 year is',array['₹2100','₹2200','₹2400','₹2020'],2);
select public._seed_arith_q('Compound Interest','easy','The compound interest on ₹5000 at 10% per annum for 1 year is',array['₹500','₹550','₹1000','₹250'],1);
select public._seed_arith_q('Compound Interest','medium','The amount on ₹8000 at 5% per annum compounded annually for 2 years is',array['₹8800','₹8820','₹8400','₹9000'],2);
select public._seed_arith_q('Compound Interest','hard','The difference between compound and simple interest on ₹100 at 10% per annum for 2 years is',array['₹1','₹2','₹10','₹0.50'],1);
select public._seed_arith_q('Compound Interest','medium','The amount on ₹1000 at 20% per annum compounded annually for 2 years is',array['₹1400','₹1440','₹1200','₹1320'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
