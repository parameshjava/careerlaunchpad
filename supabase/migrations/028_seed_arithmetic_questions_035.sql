-- 028_seed_arithmetic_questions_035.sql  (chapter: Odd Man Out and Series)
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

select public._seed_arith_q('Odd Man Out and Series','easy','Find the odd one out: 2, 3, 5, 7, 9',array['3','5','7','9'],4);
select public._seed_arith_q('Odd Man Out and Series','easy','Find the next number in the series: 2, 4, 6, 8, ?',array['9','10','12','16'],2);
select public._seed_arith_q('Odd Man Out and Series','easy','Find the next number in the series: 1, 4, 9, 16, ?',array['20','25','24','36'],2);
select public._seed_arith_q('Odd Man Out and Series','medium','Find the odd one out: 4, 8, 12, 14, 16',array['8','12','14','16'],3);
select public._seed_arith_q('Odd Man Out and Series','medium','Find the next number in the series: 5, 10, 20, 40, ?',array['60','70','80','100'],3);
select public._seed_arith_q('Odd Man Out and Series','medium','Find the next number in the series: 1, 1, 2, 3, 5, ?',array['6','7','8','13'],3);

drop function public._seed_arith_q(text, text, text, text[], int);
