-- 028_seed_arithmetic_questions_024.sql  (chapter: Area)
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

select public._seed_arith_q('Area','easy','The area of a rectangle 5 m long and 4 m wide is',array['9 sq m','20 sq m','18 sq m','40 sq m'],2);
select public._seed_arith_q('Area','easy','The area of a square of side 6 cm is',array['24 sq cm','36 sq cm','12 sq cm','18 sq cm'],2);
select public._seed_arith_q('Area','easy','The area of a triangle with base 10 cm and height 6 cm is',array['30 sq cm','60 sq cm','16 sq cm','15 sq cm'],1);
select public._seed_arith_q('Area','medium','The area of a circle of radius 7 cm (taking pi = 22/7) is',array['44 sq cm','154 sq cm','49 sq cm','22 sq cm'],2);
select public._seed_arith_q('Area','medium','The perimeter of a square whose area is 49 sq cm is',array['14 cm','28 cm','49 cm','21 cm'],2);
select public._seed_arith_q('Area','easy','The area of a rectangle of length 12 cm and breadth 5 cm is',array['34 sq cm','60 sq cm','17 sq cm','120 sq cm'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
