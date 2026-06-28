-- ============================================================================
-- 028_seed_arithmetic_questions_001.sql  (chapter: Number System)
-- Seed a VERIFIED sample of Arithmetic questions into the global bank, sourced
-- from public/arithmatic-syllabus.pdf (Number System exercise). Notes:
--   • The source PDF lists questions + options but NOT the correct answer inline
--     (answer keys are elsewhere), so each correct option below was computed and
--     verified by hand — not auto-scraped.
--   • Options may be 4 OR 5 (the book's 5th "(e) None of these" is supported).
--
-- Idempotent: a question is inserted only if its (chapter, stem) isn't present,
-- so re-running won't duplicate. Depends on 023 (Arithmetic subject + chapters).
-- ============================================================================

-- Helper: insert one single-answer question + its options (4 or 5) into a chapter
-- of the global Arithmetic subject. p_correct is the 1-based index of the answer.
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

  if exists (select 1 from public.question where chapter_id = v_chap and stem = p_stem) then
    return; -- already seeded
  end if;

  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem)
  returning id into v_qid;

  for i in 1 .. array_length(p_opts, 1) loop
    insert into public.question_option (question_id, label, is_correct, position)
    values (v_qid, p_opts[i], i = p_correct, i - 1);
  end loop;
end;
$$;

-- ---- Number System (verified) -----------------------------------------------
select public._seed_arith_q('Number System', 'easy',
  'The prime numbers dividing 143 and leaving a remainder of 3 in each case are',
  array['2 and 11', '11 and 13', '3 and 7', '5 and 7'], 4);

select public._seed_arith_q('Number System', 'easy',
  'The sum of the first four primes is',
  array['10', '11', '16', '17'], 4);

select public._seed_arith_q('Number System', 'easy',
  'The sum of all the prime numbers from 1 to 20 is',
  array['75', '76', '77', '78'], 3);

select public._seed_arith_q('Number System', 'medium',
  'A prime number N, in the range 10 to 50, remains unchanged when its digits are reversed. The square of such a number is',
  array['121', '484', '1089', '1936'], 1);

select public._seed_arith_q('Number System', 'easy',
  'Which of the following is not a prime number?',
  array['21', '23', '29', '43'], 1);

select public._seed_arith_q('Number System', 'easy',
  'Which of the following is a prime number?',
  array['19', '20', '21', '22'], 1);

select public._seed_arith_q('Number System', 'medium',
  'The smallest value of natural number n, for which 2n + 1 is not a prime number, is',
  array['3', '4', '5', 'None of these'], 2);

select public._seed_arith_q('Number System', 'medium',
  'Which one of the following is a prime number?',
  array['161', '221', '373', '437'], 3);

select public._seed_arith_q('Number System', 'medium',
  'The number of prime numbers between 301 and 320 are',
  array['3', '4', '5', '6'], 2);

select public._seed_arith_q('Number System', 'medium',
  '12345679 × 72 is equal to',
  array['88888888', '888888888', '898989898', '999999998'], 2);

-- 5-option items (with "None of these")
select public._seed_arith_q('Number System', 'easy',
  'How many of the integers between 110 and 120 are prime numbers?',
  array['0', '1', '2', '3', '4'], 2);

select public._seed_arith_q('Number System', 'medium',
  'What is 394 times 113?',
  array['44402', '44522', '44632', '44802', 'None of these'], 2);

select public._seed_arith_q('Number System', 'medium',
  '60840 ÷ 234 =?',
  array['225', '255', '260', '310', 'None of these'], 3);

select public._seed_arith_q('Number System', 'medium',
  '6 × 66 × 666 =?',
  array['263376', '263763', '263736', '267336', 'None of these'], 3);

select public._seed_arith_q('Number System', 'medium',
  '38649 − 1624 − 4483 =?',
  array['32425', '32452', '34522', '35422', 'None of these'], 5);

-- clean up the seed helper.
drop function public._seed_arith_q(text, text, text, text[], int);
