-- ============================================================================
-- 047_arith_problems_on_numbers.sql
-- Question-bank seed: Arithmetic chapter "Problems on Numbers" -- 38 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Linear word problems: one/two-unknown, digit-reversal, fractions, 3-number systems.
-- Exam-grade difficulty floor; answers independently recomputed; 4 distinct-valued
-- options, one correct; each carries a worked explanation. Depends on 023. Reuses the
-- idempotent _seed_arith_q helper (dollar-quoted). Safe to re-run.
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

-- Problems on Numbers (38 questions)
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$When a number is multiplied by 15, the result is 196 more than the number itself. Find the number.$q$,array[$q$12$q$,$q$14$q$,$q$16$q$,$q$18$q$],2,$q$Let the number be x. 15x = x + 196 → 14x = 196 → x = 14.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$The sum of a number and its one-fifth is 72. Find the number.$q$,array[$q$50$q$,$q$54$q$,$q$60$q$,$q$66$q$],3,$q$x + x/5 = 72 → 6x/5 = 72 → x = 60.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$Three-fourths of a number is 60 less than the number itself. Find the number.$q$,array[$q$180$q$,$q$200$q$,$q$240$q$,$q$320$q$],3,$q$x − (3/4)x = 60 → x/4 = 60 → x = 240.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$When a number is decreased by 20%, the result is 100. Find the number.$q$,array[$q$115$q$,$q$120$q$,$q$125$q$,$q$130$q$],3,$q$0.8x = 100 → x = 100/0.8 = 125.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$Two-fifths of a number exceeds one-fifth of the same number by 30. Find the number.$q$,array[$q$120$q$,$q$135$q$,$q$150$q$,$q$180$q$],3,$q$(2/5)x − (1/5)x = 30 → x/5 = 30 → x = 150.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$A number added to 60% of itself gives 96. Find the number.$q$,array[$q$48$q$,$q$56$q$,$q$60$q$,$q$64$q$],3,$q$x + 0.6x = 96 → 1.6x = 96 → x = 60.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$If a number is multiplied by 5 and 20 is subtracted, the result equals three times the number. Find the number.$q$,array[$q$8$q$,$q$10$q$,$q$12$q$,$q$15$q$],2,$q$5x − 20 = 3x → 2x = 20 → x = 10.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$When one-third of a number is subtracted from the number, the result is 24. Find the number.$q$,array[$q$30$q$,$q$32$q$,$q$36$q$,$q$40$q$],3,$q$x − x/3 = 24 → 2x/3 = 24 → x = 36.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$A number increased by 12 equals thrice the number after it is reduced by 20. Find the number.$q$,array[$q$30$q$,$q$33$q$,$q$36$q$,$q$40$q$],3,$q$x + 12 = 3(x − 20) → x + 12 = 3x − 60 → 2x = 72 → x = 36.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'easy',$q$Half of a number exceeds its one-fifth by 18. Find the number.$q$,array[$q$50$q$,$q$55$q$,$q$60$q$,$q$72$q$],3,$q$x/2 − x/5 = 18 → 3x/10 = 18 → x = 60.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The sum of two numbers is 40 and their difference is 8. Find the larger number.$q$,array[$q$20$q$,$q$22$q$,$q$24$q$,$q$28$q$],3,$q$Larger = (40+8)/2 = 24 (smaller = 16).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$One number is 3 more than twice another number. If their sum is 42, find the larger number.$q$,array[$q$13$q$,$q$26$q$,$q$29$q$,$q$31$q$],3,$q$Let smaller = y, larger = 2y+3. y + 2y + 3 = 42 → 3y = 39 → y = 13, larger = 29.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$Two numbers are in the ratio 5:3 and their difference is 12. Find the larger number.$q$,array[$q$24$q$,$q$28$q$,$q$30$q$,$q$36$q$],3,$q$5k − 3k = 12 → 2k = 12 → k = 6. Larger = 5k = 30.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The sum of two numbers is 528 and 6% of one number equals 12% of the other. Find the larger number.$q$,array[$q$176$q$,$q$264$q$,$q$320$q$,$q$352$q$],4,$q$0.06a = 0.12b → a = 2b. a + b = 528 → 3b = 528 → b = 176, a = 352.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The sum of two numbers is 15 and the sum of their reciprocals is 3/10. Find their product.$q$,array[$q$36$q$,$q$44$q$,$q$50$q$,$q$56$q$],3,$q$1/x + 1/y = (x+y)/xy = 15/xy = 3/10 → xy = 50 (the numbers are 5 and 10).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The larger of two numbers exceeds the smaller by 16, and the smaller is one-third of the larger. Find the larger number.$q$,array[$q$18$q$,$q$20$q$,$q$24$q$,$q$28$q$],3,$q$L = S + 16 and S = L/3 → L = L/3 + 16 → (2/3)L = 16 → L = 24 (S = 8).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The sum of two numbers is 84 and thrice the smaller number equals the larger. Find the larger number.$q$,array[$q$21$q$,$q$56$q$,$q$63$q$,$q$70$q$],3,$q$S + 3S = 84 → 4S = 84 → S = 21, larger = 3S = 63.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The difference of two numbers is 1660. If 7.5% of one number equals 12.5% of the other, find the smaller number.$q$,array[$q$2490$q$,$q$3320$q$,$q$4150$q$,$q$4980$q$],1,$q$0.075a = 0.125b → a = (5/3)b. a − b = 1660 → (2/3)b = 1660 → b = 2490 (a = 4150).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'medium',$q$The sum of two numbers is 25 and one number exceeds the other by 5. Find the larger number.$q$,array[$q$10$q$,$q$12$q$,$q$15$q$,$q$18$q$],3,$q$Larger = (25+5)/2 = 15 (smaller = 10).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$The sum of the digits of a two-digit number is 11. The number exceeds the number formed by reversing its digits by 27. Find the number.$q$,array[$q$47$q$,$q$65$q$,$q$74$q$,$q$83$q$],3,$q$Number − reversed = 9(t−u) = 27 → t−u = 3, and t+u = 11 → t = 7, u = 4 → 74. Check: 74 − 47 = 27.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$A two-digit number is 4 times the sum of its digits. When 18 is added to the number, the digits are reversed. Find the number.$q$,array[$q$24$q$,$q$42$q$,$q$36$q$,$q$48$q$],1,$q$n = 4(t+u) → 6t = 3u → u = 2t. Reversed − n = 9(u−t) = 18 → u−t = 2 → t = 2, u = 4 → 24. Check: 24 = 4×6; 24+18 = 42.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$A two-digit number is 3 times the sum of its digits. When 45 is added, the digits get reversed. Find the number.$q$,array[$q$27$q$,$q$36$q$,$q$72$q$,$q$54$q$],1,$q$n = 3(t+u) → 7t = 2u. Reversed = n+45 → 9(u−t) = 45 → u−t = 5. Solving: t = 2, u = 7 → 27. Check: 27 = 3×9; 27+45 = 72.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$In a fraction, if 1 is added to the numerator it becomes 1/2, and if 1 is subtracted from the denominator it becomes 1/3. Find the fraction.$q$,array[$q$1/4$q$,$q$2/5$q$,$q$3/7$q$,$q$2/7$q$],1,$q$(x+1)/y = 1/2 → y = 2x+2; x/(y−1) = 1/3 → y = 3x+1. So 2x+2 = 3x+1 → x = 1, y = 4 → 1/4.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$The sum of the digits of a two-digit number is 12. The number obtained by reversing the digits exceeds the original by 18. Find the number.$q$,array[$q$39$q$,$q$48$q$,$q$57$q$,$q$75$q$],3,$q$Reversed − number = 9(u−t) = 18 → u−t = 2, t+u = 12 → t = 5, u = 7 → 57. Check: 75 − 57 = 18.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$The tens digit of a two-digit number is twice the units digit. The number exceeds the number formed by reversing its digits by 36. Find the number.$q$,array[$q$48$q$,$q$63$q$,$q$84$q$,$q$93$q$],3,$q$t = 2u; number − reversed = 9(t−u) = 36 → t−u = 4 → 2u−u = 4 → u = 4, t = 8 → 84. Check: 84 − 48 = 36.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$In a fraction, if 1 is added to both numerator and denominator it becomes 4/5; if 5 is subtracted from both it becomes 1/2. Find the fraction.$q$,array[$q$5/7$q$,$q$7/9$q$,$q$6/11$q$,$q$4/9$q$],2,$q$(x+1)/(y+1)=4/5 → 5x−4y=−1; (x−5)/(y−5)=1/2 → y=2x−5. Solving: x=7, y=9 → 7/9.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$A two-digit number is such that the product of its digits is 8. When 18 is added to the number, the digits interchange their places. Find the number.$q$,array[$q$18$q$,$q$24$q$,$q$42$q$,$q$81$q$],2,$q$t·u = 8; reversed − n = 9(u−t) = 18 → u−t = 2 → t = 2, u = 4 → 24. Check: 2×4 = 8; 24+18 = 42.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'hard',$q$The numerator of a fraction is 3 less than its denominator. If both numerator and denominator are increased by 2, the fraction becomes 3/4. Find the fraction.$q$,array[$q$5/8$q$,$q$7/10$q$,$q$4/7$q$,$q$9/12$q$],2,$q$x = y−3; (x+2)/(y+2)=3/4 → 4x+8 = 3y+6 → 4(y−3)+8 = 3y+6 → y = 10, x = 7 → 7/10.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The sum of three numbers is 98. The ratio of the first to the second is 2:3 and that of the second to the third is 5:8. Find the second number.$q$,array[$q$20$q$,$q$30$q$,$q$48$q$,$q$58$q$],2,$q$a:b = 2:3, b:c = 5:8 → combine on b (LCM 15): a:b:c = 10:15:24, sum = 49 parts = 98 → 1 part = 2. Second = 15×2 = 30.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The sum of three consecutive even numbers is 234. Find the largest of them.$q$,array[$q$76$q$,$q$78$q$,$q$80$q$,$q$82$q$],3,$q$Middle = 234/3 = 78, so numbers are 76, 78, 80. Largest = 80.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The sum of the squares of two numbers is 113 and their product is 56. Find the sum of the two numbers.$q$,array[$q$12$q$,$q$13$q$,$q$15$q$,$q$17$q$],3,$q$(a+b)² = a²+b²+2ab = 113 + 112 = 225 → a+b = 15 (the numbers are 7 and 8).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$Of three numbers, the second is twice the first and the third is thrice the first. If their sum is 96, find the third number.$q$,array[$q$16$q$,$q$32$q$,$q$40$q$,$q$48$q$],4,$q$x + 2x + 3x = 96 → 6x = 96 → x = 16. Third = 3x = 48.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The difference between a two-digit number and the number obtained by interchanging its digits is 36. What is the difference between the two digits of that number?$q$,array[$q$3$q$,$q$4$q$,$q$6$q$,$q$9$q$],2,$q$Difference = 9(t−u) = 36 → t−u = 4. The difference between the digits is 4.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The sum of the digits of a two-digit number is 8. The number obtained by reversing the digits is 18 more than the original number. Find the original number.$q$,array[$q$26$q$,$q$35$q$,$q$44$q$,$q$53$q$],2,$q$Reversed − original = 9(u−t) = 18 → u−t = 2, t+u = 8 → t = 3, u = 5 → 35. Check: 53 − 35 = 18.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The product of two numbers is 45 and the sum of their squares is 106. Find the sum of the two numbers.$q$,array[$q$11$q$,$q$12$q$,$q$14$q$,$q$16$q$],3,$q$(a+b)² = 106 + 2×45 = 196 → a+b = 14 (the numbers are 5 and 9).$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$Of three numbers a, b and c: a+b = 45, b+c = 55 and a+c = 50. Find the value of b.$q$,array[$q$20$q$,$q$25$q$,$q$28$q$,$q$30$q$],2,$q$Adding all: 2(a+b+c) = 150 → a+b+c = 75. b = 75 − (a+c) = 75 − 50 = 25.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$A two-digit number is such that the product of its digits is 12. When 36 is added to the number, the digits are reversed. Find the number.$q$,array[$q$26$q$,$q$34$q$,$q$43$q$,$q$62$q$],1,$q$t·u = 12; reversed − n = 9(u−t) = 36 → u−t = 4 → t = 2, u = 6 → 26. Check: 2×6 = 12; 26+36 = 62.$q$);
select public._seed_arith_q($q$Problems on Numbers$q$,'very_hard',$q$The sum of three numbers is 132. The second number is half the first and the third is one-third of the first. Find the first number.$q$,array[$q$66$q$,$q$72$q$,$q$78$q$,$q$84$q$],2,$q$x + x/2 + x/3 = 132 → (6x+3x+2x)/6 = 132 → 11x/6 = 132 → x = 72.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
