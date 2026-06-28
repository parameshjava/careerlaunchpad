-- 028_seed_arithmetic_questions_005.sql  (chapter: Square Roots and Cube Roots)
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

select public._seed_arith_q('Square Roots and Cube Roots','easy','The square root of 1764 is',array['38','42','44','46'],2);
select public._seed_arith_q('Square Roots and Cube Roots','easy','The cube root of 2744 is',array['12','13','14','16'],3);
select public._seed_arith_q('Square Roots and Cube Roots','easy','The value of the square root of 0.0081 is',array['0.9','0.09','0.009','0.3'],2);
select public._seed_arith_q('Square Roots and Cube Roots','easy','If the square root of x is 7, then x is',array['14','49','7','343'],2);
select public._seed_arith_q('Square Roots and Cube Roots','easy','The square root of 0.16 is',array['0.04','0.4','1.6','4'],2);
select public._seed_arith_q('Square Roots and Cube Roots','medium','The cube root of 0.000216 is',array['0.6','0.06','0.006','0.36'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
