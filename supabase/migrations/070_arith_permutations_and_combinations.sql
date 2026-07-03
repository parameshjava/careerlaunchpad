-- ============================================================================
-- 070_arith_permutations_and_combinations.sql
-- Question-bank seed: Arithmetic chapter "Permutations and Combinations" -- 38 single-answer MCQs
-- from ACTUAL previous-year papers / standard aptitude texts (bank PO/Clerk, SSC,
-- ICET, IT placement). Exam-grade floor; answers independently recomputed & each
-- correct option verified; 4 distinct-valued options, one correct; each carries a
-- worked explanation. Depends on 023. Reuses idempotent _seed_arith_q. Safe to re-run.
-- nPr/nCr, word arrangements, committees, circular, restrictions, distribution.
-- ============================================================================

create or replace function public._seed_arith_q(p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int, p_explanation text) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name)='arithmetic' limit 1;
  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;
  select id into v_chap from public.chapter where subject_id=v_subj and lower(name)=lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;
  if exists (select 1 from public.question where chapter_id=v_chap and stem=p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem, explanation)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem, p_explanation) returning id into v_qid;
  for i in 1..array_length(p_opts,1) loop
    insert into public.question_option (question_id, label, is_correct, position) values (v_qid, p_opts[i], i=p_correct, i-1);
  end loop;
end; $$;

-- Permutations and Combinations (38 questions)
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$Find the value of ¹⁰P₃.$q$,array[$q$120$q$,$q$720$q$,$q$604$q$,$q$840$q$],2,$q$¹⁰P₃ = 10×9×8 = 720.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$Evaluate ¹⁰C₃.$q$,array[$q$720$q$,$q$150$q$,$q$120$q$,$q$210$q$],3,$q$¹⁰C₃ = 10!/(3!·7!) = (10×9×8)/6 = 120.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$Simplify 8! / (6! × 2!).$q$,array[$q$28$q$,$q$56$q$,$q$40$q$,$q$64$q$],1,$q$8!/(6!·2!) = (8×7)/2 = 28.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$In how many ways can all the letters of the word DELHI be arranged (all letters distinct)?$q$,array[$q$60$q$,$q$24$q$,$q$120$q$,$q$720$q$],3,$q$5 distinct letters → 5! = 120.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$How many 3-digit numbers can be formed using digits 1–9 if no digit is repeated?$q$,array[$q$729$q$,$q$504$q$,$q$648$q$,$q$720$q$],2,$q$9×8×7 = 504.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$A cricket committee of 2 is to be chosen from 8 players. In how many ways?$q$,array[$q$16$q$,$q$64$q$,$q$56$q$,$q$28$q$],4,$q$⁸C₂ = (8×7)/2 = 28.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$How many 3-digit numbers can be formed from digits {1,2,3,4,5} if repetition is allowed?$q$,array[$q$60$q$,$q$125$q$,$q$243$q$,$q$120$q$],2,$q$5×5×5 = 125.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$In how many ways can 3 distinct prizes be awarded to 5 students (no student gets more than one)?$q$,array[$q$10$q$,$q$125$q$,$q$60$q$,$q$20$q$],3,$q$5×4×3 = 60 (arrangement of 3 out of 5).$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$Find the value of ¹⁵C₁₃.$q$,array[$q$105$q$,$q$210$q$,$q$190$q$,$q$120$q$],1,$q$¹⁵C₁₃ = ¹⁵C₂ = (15×14)/2 = 105.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'easy',$q$In how many ways can all the letters of the word PENCIL be arranged (all distinct)?$q$,array[$q$120$q$,$q$360$q$,$q$720$q$,$q$5040$q$],3,$q$6 distinct letters → 6! = 720.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$In how many ways can the letters of the word ARRANGE be arranged?$q$,array[$q$5040$q$,$q$2520$q$,$q$1260$q$,$q$630$q$],3,$q$7 letters with A twice, R twice → 7!/(2!·2!) = 5040/4 = 1260.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$In how many ways can the letters of the word MATHEMATICS be arranged?$q$,array[$q$4989600$q$,$q$39916800$q$,$q$2494800$q$,$q$1247400$q$],1,$q$11 letters with M2, A2, T2 → 11!/(2!·2!·2!) = 39916800/8 = 4989600.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$A committee of 3 members is to be formed from 8 people. In how many ways can this be done?$q$,array[$q$336$q$,$q$24$q$,$q$56$q$,$q$512$q$],3,$q$⁸C₃ = (8×7×6)/6 = 56.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$How many 3-digit numbers formed from digits 1,2,3,4,5 (no repetition) are divisible by 5?$q$,array[$q$12$q$,$q$20$q$,$q$24$q$,$q$16$q$],1,$q$Units digit must be 5 (1 way); remaining two places 4×3 = 12.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$In how many ways can the letters of the word BALLOON be arranged?$q$,array[$q$5040$q$,$q$2520$q$,$q$1260$q$,$q$840$q$],3,$q$7 letters with L2, O2 → 7!/(2!·2!) = 5040/4 = 1260.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$From 5 men and 6 women, a committee of 2 men and 3 women is to be formed. In how many ways?$q$,array[$q$150$q$,$q$200$q$,$q$120$q$,$q$300$q$],2,$q$⁵C₂ × ⁶C₃ = 10 × 20 = 200.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$In how many ways can 5 members be selected from a group of 11 persons?$q$,array[$q$55$q$,$q$462$q$,$q$330$q$,$q$1287$q$],2,$q$¹¹C₅ = 462.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$A group has 4 boys and 5 girls. In how many ways can 4 be chosen so that at least one girl is included?$q$,array[$q$126$q$,$q$120$q$,$q$125$q$,$q$121$q$],3,$q$Total ⁹C₄ − (all boys) ⁴C₄ = 126 − 1 = 125.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'medium',$q$How many 3-digit even numbers can be formed from digits 1,2,3,4,5,6 without repetition?$q$,array[$q$48$q$,$q$60$q$,$q$72$q$,$q$36$q$],2,$q$Units digit ∈ {2,4,6} = 3 ways; remaining 5×4 = 20 → 3×20 = 60.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can the letters of the word LEADING be arranged so that all the vowels always come together?$q$,array[$q$720$q$,$q$360$q$,$q$5040$q$,$q$1440$q$],1,$q$Vowels E,A,I as one block → 5 units → 5! = 120; vowels internal 3! = 6 → 120×6 = 720.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can the letters of OPTICAL be arranged so that the vowels are never together?$q$,array[$q$720$q$,$q$5040$q$,$q$4320$q$,$q$1440$q$],3,$q$Total 7! = 5040; vowels together = 5!×3! = 720; never together = 5040 − 720 = 4320.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can 8 people be seated around a circular table?$q$,array[$q$40320$q$,$q$5040$q$,$q$720$q$,$q$20160$q$],2,$q$Circular arrangement of n = (n−1)! → 7! = 5040.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can 5 boys and 3 girls be arranged in a row so that no two girls are together?$q$,array[$q$7200$q$,$q$14400$q$,$q$2880$q$,$q$28800$q$],2,$q$Boys 5! = 120; 6 gaps, choose & arrange 3 girls = ⁶P₃ = 120 → 120×120 = 14400.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$There are 12 persons in a party and each shakes hands with every other. Total handshakes?$q$,array[$q$132$q$,$q$66$q$,$q$144$q$,$q$78$q$],2,$q$¹²C₂ = (12×11)/2 = 66.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$How many diagonals does a regular octagon have?$q$,array[$q$28$q$,$q$16$q$,$q$20$q$,$q$24$q$],3,$q$⁸C₂ − 8 sides = 28 − 8 = 20.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can the letters of the word FAILURE be arranged so that the four vowels always come together?$q$,array[$q$576$q$,$q$288$q$,$q$720$q$,$q$1440$q$],1,$q$7 distinct letters, vowels A,I,U,E as one block → 4 units → 4! = 24; vowels internal 4! = 24 → 24×24 = 576.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$How many rectangles can be formed from 4 horizontal and 5 vertical lines?$q$,array[$q$40$q$,$q$20$q$,$q$60$q$,$q$90$q$],3,$q$Choose 2 horizontal & 2 vertical: ⁴C₂ × ⁵C₂ = 6 × 10 = 60.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can the letters of CORPORATION be arranged so that all the vowels come together?$q$,array[$q$50400$q$,$q$25200$q$,$q$100800$q$,$q$10080$q$],1,$q$Consonants C,R,P,R,T,N (R2) + vowel block = 7 units → 7!/2! = 2520; vowels O,O,O,A,I → 5!/3! = 20 → 2520×20 = 50400.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'hard',$q$In how many ways can 6 different beads be arranged to form a necklace?$q$,array[$q$720$q$,$q$120$q$,$q$360$q$,$q$60$q$],4,$q$Necklace (clockwise = anticlockwise): (n−1)!/2 = 5!/2 = 60.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$In how many ways can 5 distinct balls be placed into 3 distinct boxes (any box may be empty)?$q$,array[$q$125$q$,$q$243$q$,$q$15$q$,$q$216$q$],2,$q$Each ball has 3 choices → 3⁵ = 243.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$A committee of 5 is to be formed from 4 men and 6 women. In how many ways can it include at least 2 men?$q$,array[$q$120$q$,$q$210$q$,$q$186$q$,$q$252$q$],3,$q$Sum m=2,3,4: ⁴C₂⁶C₃ + ⁴C₃⁶C₂ + ⁴C₄⁶C₁ = 120+60+6 = 186.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$From 15 players, a team of 11 is chosen. If 2 particular players must always be included, in how many ways?$q$,array[$q$1365$q$,$q$715$q$,$q$455$q$,$q$286$q$],2,$q$2 fixed; choose remaining 9 from 13 → ¹³C₉ = ¹³C₄ = 715.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$In how many ways can 10 identical chocolates be distributed among 3 children so that each gets at least one?$q$,array[$q$36$q$,$q$45$q$,$q$55$q$,$q$28$q$],1,$q$x+y+z=10, each ≥1 → C(10−1, 3−1) = ⁹C₂ = 36.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$How many 5-letter words (from distinct letters, no repetition) can be formed from DAUGHTER using exactly 2 vowels?$q$,array[$q$1800$q$,$q$7200$q$,$q$3600$q$,$q$2400$q$],3,$q$Vowels A,U,E; consonants D,G,H,T,R. Choose 2 vowels ³C₂=3, 3 consonants ⁵C₃=10, arrange 5! =120 → 3×10×120 = 3600.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$In how many ways can 12 students be divided into three distinct groups of 4 each?$q$,array[$q$5775$q$,$q$34650$q$,$q$495$q$,$q$103950$q$],2,$q$¹²C₄ × ⁸C₄ × ⁴C₄ = 495 × 70 × 1 = 34650.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$In how many ways can 6 different books be distributed among 3 students so that each gets exactly 2 books?$q$,array[$q$90$q$,$q$540$q$,$q$720$q$,$q$180$q$],1,$q$⁶C₂ × ⁴C₂ × ²C₂ = 15 × 6 × 1 = 90 (students distinct).$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$In how many ways can 3 men and 3 women be seated around a round table so that men and women sit alternately?$q$,array[$q$36$q$,$q$72$q$,$q$12$q$,$q$24$q$],3,$q$Fix men circularly: (3−1)! = 2; women in 3 gaps: 3! = 6 → 2×6 = 12.$q$);
select public._seed_arith_q($q$Permutations and Combinations$q$,'very_hard',$q$In how many ways can the letters of the word COMMITTEE be arranged so that all the vowels come together?$q$,array[$q$1080$q$,$q$2160$q$,$q$4320$q$,$q$540$q$],2,$q$Consonants C,M,M,T,T (M2,T2) + vowel block = 6 units → 6!/(2!2!) = 180; vowels O,I,E,E → 4!/2! = 12 → 180×12 = 2160.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
