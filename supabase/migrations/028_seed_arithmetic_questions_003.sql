-- ============================================================================
-- 028_seed_arithmetic_questions_003.sql  (chapter: Decimal Fractions)
-- Verified sample for the "Decimal Fractions" chapter (arithmatic-syllabus.pdf).
-- Answers computed/verified by hand. Options 4 or 5. Idempotent. Depends on 023.
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

-- ---- Decimal Fractions (verified) -------------------------------------------
select public._seed_arith_q('Decimal Fractions', 'easy',
  '(3.5 × 1.4) ÷ 0.7 = ?',
  array['0.7', '2.4', '3.5', '7.1', 'None of these'], 5);

select public._seed_arith_q('Decimal Fractions', 'easy',
  '(1.6 × 3.2) ÷ 0.08 = ?',
  array['0.8', '6.4', '8', '64', 'None of these'], 4);

select public._seed_arith_q('Decimal Fractions', 'medium',
  '(4.41 × 0.16) ÷ (2.1 × 1.6 × 0.21) is simplified to',
  array['1', '0.1', '0.01', '10'], 1);

select public._seed_arith_q('Decimal Fractions', 'medium',
  '(3.6 × 0.48 × 2.50) ÷ (0.12 × 0.09 × 0.5) is',
  array['80', '800', '8000', '80000'], 2);

select public._seed_arith_q('Decimal Fractions', 'easy',
  '(5 × 1.6 − 2 × 1.4) ÷ 1.3 = ?',
  array['0.4', '1.2', '1.4', '4'], 4);

select public._seed_arith_q('Decimal Fractions', 'easy',
  'The value of (4.7 × 13.26 + 4.7 × 9.43 + 4.7 × 77.31) is',
  array['0.47', '47', '470', '4700'], 3);

select public._seed_arith_q('Decimal Fractions', 'medium',
  'Simplify: (0.2 × 0.2 + 0.2 × 0.02) ÷ 0.044',
  array['0.004', '0.4', '1', '2'], 3);

select public._seed_arith_q('Decimal Fractions', 'medium',
  '(7.5 × 7.5 + 37.5 + 2.5 × 2.5) is equal to',
  array['30', '60', '80', '100'], 4);

select public._seed_arith_q('Decimal Fractions', 'hard',
  'The value of ((2.697 − 0.498)² + (2.697 + 0.498)²) ÷ (2.697 × 2.697 + 0.498 × 0.498) is',
  array['0.5', '2', '2.199', '3.195'], 2);

select public._seed_arith_q('Decimal Fractions', 'hard',
  'The value of ((0.137 + 0.098)² − (0.137 − 0.098)²) ÷ (0.137 × 0.098) is',
  array['0.039', '0.235', '0.25', '4'], 4);

select public._seed_arith_q('Decimal Fractions', 'hard',
  'The value of (5.71 × 5.71 × 5.71 − 2.79 × 2.79 × 2.79) ÷ (5.71 × 5.71 + 5.71 × 2.79 + 2.79 × 2.79) is',
  array['2.82', '2.92', '8.5', '8.6'], 2);

drop function public._seed_arith_q(text, text, text, text[], int);
