-- 028_seed_arithmetic_questions_012.sql  (chapter: Profit and Loss)
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

select public._seed_arith_q('Profit and Loss','easy','A man buys an article for ₹100 and sells it for ₹120. His profit percent is',array['10%','20%','25%','15%'],2);
select public._seed_arith_q('Profit and Loss','easy','If the cost price is ₹500 and the selling price is ₹450, the loss percent is',array['5%','10%','15%','50%'],2);
select public._seed_arith_q('Profit and Loss','easy','An article costing ₹80 is sold at 25% profit. The selling price is',array['₹100','₹105','₹120','₹96'],1);
select public._seed_arith_q('Profit and Loss','medium','By selling an article for ₹270 a man gains 8%. The cost price is',array['₹240','₹250','₹260','₹270'],2);
select public._seed_arith_q('Profit and Loss','easy','If the cost price equals the selling price, there is',array['profit','loss','no profit no loss','100% profit'],3);
select public._seed_arith_q('Profit and Loss','easy','A shopkeeper marks an article at ₹200 and allows a 10% discount. The selling price is',array['₹190','₹180','₹220','₹200'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
