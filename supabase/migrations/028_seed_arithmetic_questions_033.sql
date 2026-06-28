-- 028_seed_arithmetic_questions_033.sql  (chapter: Bankers Discount)
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

select public._seed_arith_q('Banker''s Discount','medium','Banker''s discount is the simple interest on the',array['present worth','face value (amount)','true discount','bankers gain'],2);
select public._seed_arith_q('Banker''s Discount','medium','Banker''s gain equals',array['banker''s discount − true discount','true discount − banker''s discount','banker''s discount + true discount','present worth'],1);
select public._seed_arith_q('Banker''s Discount','medium','The banker''s discount on ₹1000 due after 1 year at 10% per annum is',array['₹90','₹100','₹110','₹50'],2);
select public._seed_arith_q('Banker''s Discount','medium','Banker''s gain is the simple interest on the',array['true discount','present worth','face value','amount'],1);
select public._seed_arith_q('Banker''s Discount','medium','Compared with the true discount, the banker''s discount is always',array['greater','less','equal','half'],1);
select public._seed_arith_q('Banker''s Discount','easy','If the banker''s discount is ₹120 and the true discount is ₹100, the banker''s gain is',array['₹20','₹220','₹100','₹120'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
