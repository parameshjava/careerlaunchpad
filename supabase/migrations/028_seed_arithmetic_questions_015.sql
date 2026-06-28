-- 028_seed_arithmetic_questions_015.sql  (chapter: Chain Rule)
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

select public._seed_arith_q('Chain Rule','easy','If 5 men do a piece of work in 10 days, then 10 men will do it in',array['5 days','10 days','20 days','2 days'],1);
select public._seed_arith_q('Chain Rule','easy','If 6 pencils cost ₹18, then 10 pencils cost',array['₹25','₹30','₹36','₹24'],2);
select public._seed_arith_q('Chain Rule','medium','A car travels 240 km in 4 hours. At the same speed, in 6 hours it travels',array['300 km','360 km','480 km','320 km'],2);
select public._seed_arith_q('Chain Rule','medium','If 4 taps fill a tank in 12 hours, then 6 taps fill it in',array['6 hours','8 hours','10 hours','18 hours'],2);
select public._seed_arith_q('Chain Rule','medium','15 workers build a wall in 48 hours. 30 workers build it in',array['24 hours','12 hours','96 hours','36 hours'],1);
select public._seed_arith_q('Chain Rule','easy','If 3 kg of rice cost ₹120, then 7 kg cost',array['₹240','₹280','₹210','₹300'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
