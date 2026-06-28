-- 028_seed_arithmetic_questions_029.sql  (chapter: Stocks and Shares)
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

select public._seed_arith_q('Stocks and Shares','medium','A stock is said to be "at par" when its market value is',array['above its face value','equal to its face value','below its face value','zero'],2);
select public._seed_arith_q('Stocks and Shares','medium','A stock quoted at a premium has a market value that is its face value',array['greater than','less than','equal to','half of'],1);
select public._seed_arith_q('Stocks and Shares','medium','A stock quoted at a discount has a market value that is its face value',array['greater than','less than','equal to','double'],2);
select public._seed_arith_q('Stocks and Shares','easy','The annual income from a 10% stock on ₹500 of face value is',array['₹5','₹50','₹100','₹10'],2);
select public._seed_arith_q('Stocks and Shares','medium','Brokerage in a stock transaction is charged on the',array['face value','market value','dividend','annual income'],2);
select public._seed_arith_q('Stocks and Shares','medium','The dividend on shares is calculated on the',array['face value','market value','premium','brokerage'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
