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
