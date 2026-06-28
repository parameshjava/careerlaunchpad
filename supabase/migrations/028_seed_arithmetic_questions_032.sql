-- 028_seed_arithmetic_questions_032.sql  (chapter: True Discount)
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

select public._seed_arith_q('True Discount','medium','True discount is the simple interest on the',array['present worth','face value','amount','bankers gain'],1);
select public._seed_arith_q('True Discount','easy','If the present worth is ₹100 and the amount (sum due) is ₹110, the true discount is',array['₹5','₹10','₹11','₹100'],2);
select public._seed_arith_q('True Discount','medium','Present worth plus true discount equals the',array['present worth','amount (sum due)','interest','discount'],2);
select public._seed_arith_q('True Discount','medium','The true discount on ₹110 due after 1 year at 10% per annum is',array['₹10','₹11','₹100','₹110'],1);
select public._seed_arith_q('True Discount','medium','The present worth of ₹220 due after 1 year at 10% per annum is',array['₹200','₹210','₹198','₹180'],1);
select public._seed_arith_q('True Discount','medium','Compared with the simple interest on the sum due, the true discount is',array['less','greater','equal','double'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
