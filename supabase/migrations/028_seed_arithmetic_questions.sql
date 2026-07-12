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
-- ============================================================================
-- 028_seed_arithmetic_questions_002.sql  (chapter: H.C.F. and L.C.M. of Numbers)
-- Verified sample for the "H.C.F. and L.C.M. of Numbers" chapter, sourced from
-- public/arithmatic-syllabus.pdf. Correct answers computed/verified by hand.
-- Options may be 4 or 5. Idempotent (guarded by chapter + stem). Depends on 023.
-- Self-contained: re-declares the seed helper and drops it at the end.
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
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem)
  returning id into v_qid;

  for i in 1 .. array_length(p_opts, 1) loop
    insert into public.question_option (question_id, label, is_correct, position)
    values (v_qid, p_opts[i], i = p_correct, i - 1);
  end loop;
end;
$$;

-- ---- H.C.F. and L.C.M. of Numbers (verified) --------------------------------
select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'easy',
  'The maximum number of students among whom 1001 pens and 910 pencils can be distributed such that each student gets the same number of pens and the same number of pencils is',
  array['91', '910', '1001', '1911'], 1);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'A rectangular courtyard 3.78 metres long and 5.25 metres wide is to be paved exactly with square tiles, all of the same size. What is the largest size of tile that could be used?',
  array['14 cm', '21 cm', '42 cm', 'None of these'], 2);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'Three sets of English, Mathematics and Science books containing 336, 240 and 96 books respectively have to be stacked subjectwise so that the height of each stack is the same. The total number of stacks will be',
  array['14', '21', '22', '48'], 1);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'Four metal rods of lengths 78 cm, 104 cm, 117 cm and 169 cm are to be cut into parts of equal length. What is the maximum number of pieces that can be cut?',
  array['27', '36', '43', '480'], 2);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'Find the greatest number that will divide 43, 91 and 183 so as to leave the same remainder in each case.',
  array['4', '7', '9', '13'], 1);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'The greatest number which can divide 1356, 1868 and 2764 leaving the same remainder 12 in each case is',
  array['64', '124', '156', '260'], 1);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'Which greatest number will divide 3026 and 5053 leaving remainders 11 and 13 respectively?',
  array['15', '30', '45', '60'], 3);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'The least number of five digits which is exactly divisible by 12, 15 and 18 is',
  array['10010', '10015', '10020', '10080'], 4);

select public._seed_arith_q('H.C.F. and L.C.M. of Numbers', 'medium',
  'The greatest number of four digits which is divisible by 15, 25, 40 and 75 is',
  array['9000', '9400', '9600', '9800'], 3);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- ============================================================================
-- 028_seed_arithmetic_questions_004.sql  (chapter: Simplification)
-- Verified sample for the "Simplification" chapter (arithmatic-syllabus.pdf).
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

-- ---- Simplification (verified) ----------------------------------------------
select public._seed_arith_q('Simplification', 'easy',
  'How many boxes are required for filling 15 kg of sweet if each box is filled with 250 grams of sweet?',
  array['30', '70', '80', '120', 'None of these'], 5);

select public._seed_arith_q('Simplification', 'medium',
  'The cost of 6 pens and 3 pencils is ₹84. One-third of the cost of one pen equals the cost of one pencil. What is the total cost of 4 pens and 5 pencils?',
  array['₹66', '₹68', '₹72', '₹78', 'None of these'], 2);

select public._seed_arith_q('Simplification', 'medium',
  'If an amount of ₹4,36,563 is distributed equally amongst 69 persons, how much amount would each person get?',
  array['₹5876', '₹5943', '₹6148', '₹6327', 'None of these'], 4);

select public._seed_arith_q('Simplification', 'medium',
  'A canteen requires 798 bananas for a week. How many bananas did it require for the months of January, February and March 2008?',
  array['10277', '10374', '10480', '10586', 'None of these'], 2);

select public._seed_arith_q('Simplification', 'medium',
  'Ram has ₹6 more than Mohan and ₹9 more than Sohan. All three together have ₹33. Ram has a share of',
  array['₹7', '₹10', '₹13', '₹16', 'None of these'], 4);

select public._seed_arith_q('Simplification', 'medium',
  'What is the maximum number of half-pint bottles of cream that can be filled with a 4-gallon can of cream? (2 pt. = 1 qt. and 4 qt. = 1 gal.)',
  array['16', '24', '30', '64'], 4);

select public._seed_arith_q('Simplification', 'medium',
  'The sum of the weights of A and B is 80 kg. Half of the weight of A is equal to 5/6 times the weight of B. Find the weight of B.',
  array['20 kg', '30 kg', '40 kg', '60 kg'], 2);

select public._seed_arith_q('Simplification', 'easy',
  'How many pieces of 85 cm length can be cut from a rod 42.5 metres long?',
  array['30', '40', '60', 'None of these'], 4);

select public._seed_arith_q('Simplification', 'medium',
  'The number of students in each section of a school is 24. After admitting new students, three new sections were started. Now the total number of sections is 16 and there are 21 students in each section. The number of new students admitted is',
  array['14', '24', '48', '114'], 2);

select public._seed_arith_q('Simplification', 'medium',
  'A group of 1200 persons consisting of captains and soldiers is travelling in a train. For every 15 soldiers there is one captain. The number of captains in the group is',
  array['70', '75', '80', '82'], 2);

select public._seed_arith_q('Simplification', 'medium',
  'Water boils at 212°F or 100°C and melts at 32°F or 0°C. If the temperature of a particular day is 35°C, it is equivalent to',
  array['85°F', '90°F', '95°F', '99°F'], 3);

select public._seed_arith_q('Simplification', 'easy',
  '12 buckets of water fill a tank when the capacity of each bucket is 13.5 litres. How many buckets will be needed to fill the same tank if the capacity of each bucket is 9 litres?',
  array['8', '15', '16', '18'], 4);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- 028_seed_arithmetic_questions_006.sql  (chapter: Average)
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

select public._seed_arith_q('Average','easy','The average of the first 5 natural numbers is',array['2.5','3','3.5','4'],2);
select public._seed_arith_q('Average','easy','The average of 2, 4, 6, 8 and 10 is',array['5','6','7','30'],2);
select public._seed_arith_q('Average','easy','The average of 10, 20, 30, 40 and 50 is',array['25','30','35','150'],2);
select public._seed_arith_q('Average','medium','The average of the first 10 even numbers is',array['10','11','12','55'],2);
select public._seed_arith_q('Average','medium','The mean of three numbers is 20. If two of them are 18 and 22, the third number is',array['18','20','22','24'],2);
select public._seed_arith_q('Average','medium','The average of the first 7 multiples of 3 is',array['9','12','15','84'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_007.sql  (chapter: Problems on Numbers)
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

select public._seed_arith_q('Problems on Numbers','easy','The sum of two numbers is 25 and their difference is 5. The larger number is',array['10','15','20','12'],2);
select public._seed_arith_q('Problems on Numbers','easy','A number when multiplied by 7 gives 91. The number is',array['12','13','14','7'],2);
select public._seed_arith_q('Problems on Numbers','easy','Three consecutive integers have a sum of 72. The middle integer is',array['23','24','25','22'],2);
select public._seed_arith_q('Problems on Numbers','easy','If one-third of a number is 15, the number is',array['30','45','5','60'],2);
select public._seed_arith_q('Problems on Numbers','medium','The sum of a number and its half is 30. The number is',array['15','20','10','45'],2);
select public._seed_arith_q('Problems on Numbers','medium','A number exceeds its two-fifths by 90. The number is',array['120','150','90','180'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_008.sql  (chapter: Problems on Ages)
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

select public._seed_arith_q('Problems on Ages','easy','The present age of A is 30 years. His age after 5 years will be',array['25','35','40','30'],2);
select public._seed_arith_q('Problems on Ages','easy','A is twice as old as B. If B is 12 years old, A is',array['20','24','36','12'],2);
select public._seed_arith_q('Problems on Ages','medium','The ratio of the ages of A and B is 3:4 and the sum of their ages is 35. The age of A is',array['15','20','21','14'],1);
select public._seed_arith_q('Problems on Ages','easy','Five years ago a man''s age was 25 years. His present age is',array['20','30','35','25'],2);
select public._seed_arith_q('Problems on Ages','medium','The sum of the ages of a mother and her daughter is 50 years. The mother is 4 times as old as the daughter. The daughter''s age is',array['10','12','40','8'],1);
select public._seed_arith_q('Problems on Ages','easy','A is 4 years older than B. If B is 16, then A is',array['12','20','24','16'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_009.sql  (chapter: Surds and Indices)
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

select public._seed_arith_q('Surds and Indices','easy','The value of 2^3 × 2^2 is',array['16','32','64','8'],2);
select public._seed_arith_q('Surds and Indices','easy','The value of (3^2)^3 is',array['243','729','81','27'],2);
select public._seed_arith_q('Surds and Indices','easy','The value of 5^0 is',array['0','1','5','25'],2);
select public._seed_arith_q('Surds and Indices','medium','The value of the square root of 2 times the square root of 8 is',array['2','4','8','16'],2);
select public._seed_arith_q('Surds and Indices','medium','The value of 2^(-2) is',array['4','0.25','-4','0.5'],2);
select public._seed_arith_q('Surds and Indices','medium','The value of 16^(3/4) is',array['8','12','64','4'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_010.sql  (chapter: Logarithms)
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

select public._seed_arith_q('Logarithms','easy','The value of log to base 10 of 1000 is',array['2','3','10','100'],2);
select public._seed_arith_q('Logarithms','easy','The value of log to base 2 of 8 is',array['2','3','4','8'],2);
select public._seed_arith_q('Logarithms','easy','The value of log to base 10 of 1 is',array['0','1','10','undefined'],1);
select public._seed_arith_q('Logarithms','medium','If log of x to base 10 is 2, then x is',array['20','100','200','10'],2);
select public._seed_arith_q('Logarithms','medium','log a + log b equals',array['log (a + b)','log (ab)','log (a/b)','log a × log b'],2);
select public._seed_arith_q('Logarithms','easy','The value of log to base 5 of 25 is',array['2','5','25','1'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_011.sql  (chapter: Percentage)
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

select public._seed_arith_q('Percentage','easy','25% of 200 is',array['25','50','75','100'],2);
select public._seed_arith_q('Percentage','easy','What percent of 50 is 10?',array['10%','20%','25%','5%'],2);
select public._seed_arith_q('Percentage','medium','A number increased by 20% becomes 120. The original number is',array['96','100','144','80'],2);
select public._seed_arith_q('Percentage','easy','0.5 expressed as a percentage is',array['5%','50%','0.5%','500%'],2);
select public._seed_arith_q('Percentage','easy','40% of 250 is',array['100','40','125','60'],1);
select public._seed_arith_q('Percentage','medium','If 30% of a number is 60, the number is',array['180','200','120','90'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- 028_seed_arithmetic_questions_013.sql  (chapter: Ratio and Proportion)
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

select public._seed_arith_q('Ratio and Proportion','easy','The ratio 4 : 6 in its simplest form is',array['2 : 3','3 : 2','4 : 6','1 : 2'],1);
select public._seed_arith_q('Ratio and Proportion','medium','If a : b = 2 : 3 and b : c = 4 : 5, then a : c is',array['8 : 15','2 : 5','6 : 5','8 : 5'],1);
select public._seed_arith_q('Ratio and Proportion','medium','Two numbers are in the ratio 3 : 5 and their sum is 64. The smaller number is',array['24','40','32','30'],1);
select public._seed_arith_q('Ratio and Proportion','medium','The fourth proportional to 4, 6 and 8 is',array['10','12','14','16'],2);
select public._seed_arith_q('Ratio and Proportion','easy','When ₹600 is divided in the ratio 1 : 2, the larger share is',array['₹200','₹400','₹300','₹450'],2);
select public._seed_arith_q('Ratio and Proportion','medium','The mean proportional between 9 and 16 is',array['12','12.5','24','144'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_014.sql  (chapter: Partnership)
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

select public._seed_arith_q('Partnership','medium','A and B invest ₹3000 and ₹2000 for the same time. A profit of ₹500 is shared. A''s share is',array['₹200','₹300','₹250','₹350'],2);
select public._seed_arith_q('Partnership','easy','Two partners invest equal amounts for the same time. They share the profit in the ratio',array['1 : 1','2 : 1','1 : 2','3 : 2'],1);
select public._seed_arith_q('Partnership','medium','A invests ₹4000 for 6 months and B invests ₹2000 for 12 months. The ratio of their profits is',array['1 : 1','2 : 1','1 : 2','3 : 1'],1);
select public._seed_arith_q('Partnership','medium','A, B and C invest in the ratio 2 : 3 : 5. From a total profit of ₹10000, C''s share is',array['₹2000','₹3000','₹5000','₹4000'],3);
select public._seed_arith_q('Partnership','medium','In a business A''s capital is twice B''s, for the same time. A profit of ₹900 is shared. A gets',array['₹300','₹600','₹450','₹900'],2);
select public._seed_arith_q('Partnership','easy','A and B share profit in the ratio 5 : 3. If the total profit is ₹800, B''s share is',array['₹500','₹300','₹400','₹250'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- 028_seed_arithmetic_questions_016.sql  (chapter: Pipes and Cisterns)
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

select public._seed_arith_q('Pipes and Cisterns','easy','A pipe fills a tank in 6 hours. In 1 hour it fills',array['1/3 of the tank','1/6 of the tank','6 tanks','1/2 of the tank'],2);
select public._seed_arith_q('Pipes and Cisterns','medium','Two pipes can fill a tank in 12 hours and 6 hours. Together they fill it in',array['3 hours','4 hours','6 hours','9 hours'],2);
select public._seed_arith_q('Pipes and Cisterns','medium','A pipe fills a tank in 4 hours while a leak empties it in 8 hours. With both open, the tank fills in',array['8 hours','4 hours','6 hours','12 hours'],1);
select public._seed_arith_q('Pipes and Cisterns','medium','Two pipes fill a tank in 10 hours and 15 hours. Together they fill it in',array['5 hours','6 hours','12 hours','25 hours'],2);
select public._seed_arith_q('Pipes and Cisterns','easy','A tap fills a tank in 5 hours. Two such taps together fill it in',array['2.5 hours','5 hours','10 hours','1 hour'],1);
select public._seed_arith_q('Pipes and Cisterns','easy','A pipe empties a full tank in 8 hours. In 2 hours it empties',array['1/4 of the tank','1/8 of the tank','1/2 of the tank','4 tanks'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_017.sql  (chapter: Time and Work)
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

select public._seed_arith_q('Time and Work','easy','A can do a piece of work in 10 days. In one day he does',array['1/5 of the work','1/10 of the work','10 works','1/2 of the work'],2);
select public._seed_arith_q('Time and Work','medium','A does a work in 12 days and B in 6 days. Working together they finish it in',array['3 days','4 days','6 days','9 days'],2);
select public._seed_arith_q('Time and Work','medium','A and B together finish a work in 8 days. A alone takes 12 days. B alone takes',array['16 days','24 days','20 days','4 days'],2);
select public._seed_arith_q('Time and Work','easy','If 8 men do a work in 6 days, then 4 men do it in',array['3 days','12 days','24 days','6 days'],2);
select public._seed_arith_q('Time and Work','medium','A is twice as efficient as B. A finishes a work in 6 days. B alone takes',array['3 days','12 days','9 days','6 days'],2);
select public._seed_arith_q('Time and Work','medium','A does 1/4 of a work in 5 days. The whole work takes',array['10 days','20 days','15 days','25 days'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_018.sql  (chapter: Time and Distance)
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

select public._seed_arith_q('Time and Distance','easy','A car travels 150 km in 3 hours. Its speed is',array['45 km/h','50 km/h','60 km/h','30 km/h'],2);
select public._seed_arith_q('Time and Distance','easy','At a speed of 60 km/h, the distance covered in 2 hours is',array['100 km','120 km','150 km','60 km'],2);
select public._seed_arith_q('Time and Distance','medium','A train running at 72 km/h has a speed in metres per second of',array['10','20','25','36'],2);
select public._seed_arith_q('Time and Distance','easy','The time to cover 100 km at 25 km/h is',array['3 hours','4 hours','5 hours','2 hours'],2);
select public._seed_arith_q('Time and Distance','medium','A speed of 10 m/s expressed in km/h is',array['18','36','27','50'],2);
select public._seed_arith_q('Time and Distance','medium','A man walks 6 km in 90 minutes. His speed in km/h is',array['3','4','5','6'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_019.sql  (chapter: Boats and Streams)
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

select public._seed_arith_q('Boats and Streams','easy','A boat''s speed in still water is 10 km/h and the stream is 2 km/h. Its downstream speed is',array['8 km/h','12 km/h','10 km/h','5 km/h'],2);
select public._seed_arith_q('Boats and Streams','easy','A boat''s speed in still water is 10 km/h and the stream is 2 km/h. Its upstream speed is',array['8 km/h','12 km/h','10 km/h','6 km/h'],1);
select public._seed_arith_q('Boats and Streams','medium','If the downstream speed is 16 km/h and the upstream speed is 8 km/h, the speed in still water is',array['4 km/h','12 km/h','8 km/h','24 km/h'],2);
select public._seed_arith_q('Boats and Streams','medium','If the downstream speed is 16 km/h and the upstream speed is 8 km/h, the speed of the stream is',array['4 km/h','12 km/h','2 km/h','8 km/h'],1);
select public._seed_arith_q('Boats and Streams','easy','A boat covers 20 km downstream in 2 hours. Its downstream speed is',array['5 km/h','10 km/h','40 km/h','2 km/h'],2);
select public._seed_arith_q('Boats and Streams','easy','Speed in still water is 8 km/h and the stream is 3 km/h. The upstream speed is',array['11 km/h','5 km/h','8 km/h','3 km/h'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_020.sql  (chapter: Problems on Trains)
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

select public._seed_arith_q('Problems on Trains','medium','A train 100 m long running at 36 km/h crosses a pole in',array['5 s','10 s','20 s','36 s'],2);
select public._seed_arith_q('Problems on Trains','medium','A train 150 m long at 10 m/s crosses a platform 150 m long in',array['15 s','30 s','45 s','20 s'],2);
select public._seed_arith_q('Problems on Trains','medium','A train 120 m long passes a man standing on the platform in 6 s. Its speed is',array['10 m/s','20 m/s','24 m/s','12 m/s'],2);
select public._seed_arith_q('Problems on Trains','medium','A train running at 60 km/h crosses a pole in 6 s. Its length is',array['100 m','120 m','60 m','360 m'],1);
select public._seed_arith_q('Problems on Trains','medium','A train 200 m long crosses a bridge 300 m long in 25 s. Its speed is',array['15 m/s','20 m/s','25 m/s','40 m/s'],2);
select public._seed_arith_q('Problems on Trains','easy','A speed of 90 km/h in metres per second is',array['20','25','30','15'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_021.sql  (chapter: Alligation or Mixture)
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

select public._seed_arith_q('Alligation or Mixture','medium','In what ratio must rice at ₹10/kg be mixed with rice at ₹15/kg to get a mixture worth ₹12/kg?',array['3 : 2','2 : 3','1 : 1','5 : 2'],1);
select public._seed_arith_q('Alligation or Mixture','easy','A 20-litre mixture contains milk and water in the ratio 3 : 1. The quantity of milk is',array['10 litres','15 litres','5 litres','12 litres'],2);
select public._seed_arith_q('Alligation or Mixture','easy','Two qualities priced ₹8 and ₹12 are mixed in equal quantities. The average price is',array['₹9','₹10','₹11','₹20'],2);
select public._seed_arith_q('Alligation or Mixture','easy','To 40 litres of milk, 10 litres of water is added. The ratio of milk to water is',array['4 : 1','1 : 4','3 : 1','5 : 1'],1);
select public._seed_arith_q('Alligation or Mixture','medium','In what ratio must two varieties at ₹12 and ₹18 be mixed to get a mixture worth ₹15?',array['1 : 1','2 : 1','1 : 2','3 : 2'],1);
select public._seed_arith_q('Alligation or Mixture','easy','A 30-litre mixture contains 20% water. The quantity of water is',array['6 litres','5 litres','10 litres','24 litres'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_022.sql  (chapter: Simple Interest)
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

select public._seed_arith_q('Simple Interest','easy','The simple interest on ₹1000 at 5% per annum for 2 years is',array['₹50','₹100','₹150','₹200'],2);
select public._seed_arith_q('Simple Interest','easy','The simple interest on ₹2000 at 10% per annum for 1 year is',array['₹100','₹200','₹220','₹20'],2);
select public._seed_arith_q('Simple Interest','easy','The simple interest on ₹500 for 4 years at 5% per annum is',array['₹100','₹120','₹80','₹125'],1);
select public._seed_arith_q('Simple Interest','medium','At what rate per annum will ₹1000 yield ₹200 as simple interest in 2 years?',array['5%','10%','20%','15%'],2);
select public._seed_arith_q('Simple Interest','medium','₹800 amounts to ₹960 in 2 years at simple interest. The rate per annum is',array['8%','10%','12%','20%'],2);
select public._seed_arith_q('Simple Interest','medium','The simple interest on ₹1200 at 6% per annum for 6 months is',array['₹36','₹72','₹144','₹18'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_023.sql  (chapter: Compound Interest)
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

select public._seed_arith_q('Compound Interest','medium','The compound interest on ₹1000 at 10% per annum for 2 years is',array['₹200','₹210','₹220','₹100'],2);
select public._seed_arith_q('Compound Interest','easy','The amount on ₹2000 at 10% per annum compounded annually for 1 year is',array['₹2100','₹2200','₹2400','₹2020'],2);
select public._seed_arith_q('Compound Interest','easy','The compound interest on ₹5000 at 10% per annum for 1 year is',array['₹500','₹550','₹1000','₹250'],1);
select public._seed_arith_q('Compound Interest','medium','The amount on ₹8000 at 5% per annum compounded annually for 2 years is',array['₹8800','₹8820','₹8400','₹9000'],2);
select public._seed_arith_q('Compound Interest','hard','The difference between compound and simple interest on ₹100 at 10% per annum for 2 years is',array['₹1','₹2','₹10','₹0.50'],1);
select public._seed_arith_q('Compound Interest','medium','The amount on ₹1000 at 20% per annum compounded annually for 2 years is',array['₹1400','₹1440','₹1200','₹1320'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- 028_seed_arithmetic_questions_025.sql  (chapter: Volume and Surface Area)
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

select public._seed_arith_q('Volume and Surface Area','easy','The volume of a cube of side 3 cm is',array['9 cu cm','27 cu cm','18 cu cm','81 cu cm'],2);
select public._seed_arith_q('Volume and Surface Area','easy','The volume of a cuboid 2 cm × 3 cm × 4 cm is',array['9 cu cm','24 cu cm','18 cu cm','12 cu cm'],2);
select public._seed_arith_q('Volume and Surface Area','medium','The total surface area of a cube of side 2 cm is',array['8 sq cm','24 sq cm','16 sq cm','12 sq cm'],2);
select public._seed_arith_q('Volume and Surface Area','medium','The volume of a cylinder of radius 7 cm and height 10 cm (pi = 22/7) is',array['1540 cu cm','220 cu cm','440 cu cm','154 cu cm'],1);
select public._seed_arith_q('Volume and Surface Area','easy','The volume of a cube of side 5 cm is',array['25 cu cm','125 cu cm','75 cu cm','100 cu cm'],2);
select public._seed_arith_q('Volume and Surface Area','medium','The surface area of a sphere of radius 7 cm (pi = 22/7) is',array['154 sq cm','616 sq cm','308 sq cm','88 sq cm'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_026.sql  (chapter: Races and Games of Skill)
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

select public._seed_arith_q('Races and Games of Skill','medium','In a 100 m race, A beats B by 20 m. When A finishes, B has run',array['60 m','80 m','100 m','120 m'],2);
select public._seed_arith_q('Races and Games of Skill','medium','"A can give B 10 points in a game of 100" means when A scores 100, B scores',array['90','100','110','80'],1);
select public._seed_arith_q('Races and Games of Skill','medium','In a 200 m race, A beats B by 10 m. When A finishes, B has run',array['180 m','190 m','200 m','210 m'],2);
select public._seed_arith_q('Races and Games of Skill','easy','A runs 100 m in 10 seconds. His speed is',array['5 m/s','10 m/s','20 m/s','100 m/s'],2);
select public._seed_arith_q('Races and Games of Skill','medium','In a 1 km race, A beats B by 100 m. When A runs 1000 m, B runs',array['800 m','900 m','1000 m','1100 m'],2);
select public._seed_arith_q('Races and Games of Skill','easy','A "dead heat" in a race means',array['A wins','B wins','the race ends in a tie','a rematch'],3);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_027.sql  (chapter: Calendar)
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

select public._seed_arith_q('Calendar','easy','An ordinary (non-leap) year has',array['364 days','365 days','366 days','360 days'],2);
select public._seed_arith_q('Calendar','easy','A leap year has',array['365 days','366 days','367 days','360 days'],2);
select public._seed_arith_q('Calendar','medium','The number of odd days in an ordinary year is',array['0','1','2','3'],2);
select public._seed_arith_q('Calendar','medium','The number of odd days in a leap year is',array['0','1','2','3'],3);
select public._seed_arith_q('Calendar','medium','The year 2000 was',array['a leap year','not a leap year','a century year hence skipped','none of these'],1);
select public._seed_arith_q('Calendar','easy','The month of February in a leap year has',array['28 days','29 days','30 days','31 days'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_028.sql  (chapter: Clocks)
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

select public._seed_arith_q('Clocks','medium','The angle traced by the hour hand in 12 hours is',array['180°','360°','720°','60°'],2);
select public._seed_arith_q('Clocks','medium','The minute hand of a clock moves through, per minute,',array['1°','6°','30°','12°'],2);
select public._seed_arith_q('Clocks','easy','At 3 o''clock, the angle between the hour and minute hands is',array['60°','90°','120°','180°'],2);
select public._seed_arith_q('Clocks','medium','The hour hand of a clock moves through, per minute,',array['0.5°','1°','6°','30°'],1);
select public._seed_arith_q('Clocks','easy','At 6 o''clock, the angle between the hands is',array['90°','120°','180°','360°'],3);
select public._seed_arith_q('Clocks','easy','In 60 minutes, the minute hand completes',array['half a revolution','one full revolution','two revolutions','a quarter revolution'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- 028_seed_arithmetic_questions_030.sql  (chapter: Permutations and Combinations)
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

select public._seed_arith_q('Permutations and Combinations','easy','The value of 5! (5 factorial) is',array['20','120','60','24'],2);
select public._seed_arith_q('Permutations and Combinations','easy','The number of ways to arrange 3 distinct books in a row is',array['3','6','9','27'],2);
select public._seed_arith_q('Permutations and Combinations','medium','The value of C(5, 2) (5 choose 2) is',array['10','20','25','5'],1);
select public._seed_arith_q('Permutations and Combinations','medium','The value of P(4, 2) is',array['8','12','16','24'],2);
select public._seed_arith_q('Permutations and Combinations','easy','The value of C(n, 0) is',array['0','1','n','n!'],2);
select public._seed_arith_q('Permutations and Combinations','easy','The number of ways to choose 2 items from 4 is',array['4','6','8','12'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
-- 028_seed_arithmetic_questions_031.sql  (chapter: Probability)
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

select public._seed_arith_q('Probability','easy','The probability of getting a head on a single toss of a fair coin is',array['1/4','1/2','1','1/3'],2);
select public._seed_arith_q('Probability','easy','The probability of rolling a 3 on a fair die is',array['1/2','1/3','1/6','1/4'],3);
select public._seed_arith_q('Probability','easy','The probability of an impossible event is',array['0','1','0.5','-1'],1);
select public._seed_arith_q('Probability','easy','The probability of a certain event is',array['0','0.5','1','2'],3);
select public._seed_arith_q('Probability','medium','The probability of getting an even number on a fair die is',array['1/3','1/2','2/3','1/6'],2);
select public._seed_arith_q('Probability','medium','The probability of drawing a red card from a standard deck of 52 cards is',array['1/4','1/2','1/13','1/26'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
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
-- 028_seed_arithmetic_questions_034.sql  (chapter: Heights and Distances)
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

select public._seed_arith_q('Heights and Distances','easy','The value of tan 45° is',array['0','1','√3','1/√3'],2);
select public._seed_arith_q('Heights and Distances','easy','The value of sin 30° is',array['1/2','√3/2','1','0'],1);
select public._seed_arith_q('Heights and Distances','medium','As an observer moves closer to a tower, the angle of elevation of its top',array['increases','decreases','stays the same','becomes zero'],1);
select public._seed_arith_q('Heights and Distances','easy','The value of cos 60° is',array['1/2','√3/2','1','0'],1);
select public._seed_arith_q('Heights and Distances','medium','If a tower casts a shadow equal to its own height, the angle of elevation of the sun is',array['30°','45°','60°','90°'],2);
select public._seed_arith_q('Heights and Distances','medium','The value of tan 30° is',array['√3','1/√3','1','1/2'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
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
