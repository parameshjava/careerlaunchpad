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
