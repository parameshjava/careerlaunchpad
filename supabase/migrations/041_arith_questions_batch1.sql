-- ============================================================================
-- 041_arith_questions_batch1.sql
-- Question-bank seed: Arithmetic chapters 1-3 (Number System; H.C.F. and
-- L.C.M. of Numbers; Decimal Fractions). 99 single-answer MCQs, researched
-- from previous bank/competitive papers (SBI/IBPS/RBI PO & Clerk, SSC, TS/AP
-- ICET, TCS/Infosys/Wipro placement) via IndiaBix, Examveda, Testbook,
-- GeeksforGeeks, 2IIM, Sawaal, Cracku. Every numeric answer was recomputed and
-- verified; difficulty is genuinely graded (easy = single-step recall →
-- very_hard = multi-concept / trap), NOT the same stem with swapped numbers.
--
-- Depends on 023 (Arithmetic subject + 35 chapters). Reuses the idempotent
-- _seed_arith_q(chapter, difficulty, stem, options[], correct) helper from 028:
-- resolves subject/chapter by name, skips if the stem already exists, then
-- inserts the question + its four options (0-based position). Safe to re-run.
-- ============================================================================

create or replace function public._seed_arith_q(p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name)='arithmetic' limit 1;
  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;
  select id into v_chap from public.chapter where subject_id=v_subj and lower(name)=lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;
  if exists (select 1 from public.question where chapter_id=v_chap and stem=p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem) returning id into v_qid;
  for i in 1..array_length(p_opts,1) loop
    insert into public.question_option (question_id, label, is_correct, position) values (v_qid, p_opts[i], i=p_correct, i-1);
  end loop;
end; $$;

-- Number System (30 questions)
select public._seed_arith_q($q$Number System$q$,'easy',$q$What is the place value of 7 in the number 5768?$q$,array[$q$7$q$,$q$70$q$,$q$700$q$,$q$7000$q$],3);
select public._seed_arith_q($q$Number System$q$,'easy',$q$Which of the following numbers is divisible by 9?$q$,array[$q$5432$q$,$q$6455$q$,$q$7128$q$,$q$8110$q$],3);
select public._seed_arith_q($q$Number System$q$,'easy',$q$What is the unit (last) digit of 3^24?$q$,array[$q$1$q$,$q$3$q$,$q$7$q$,$q$9$q$],1);
select public._seed_arith_q($q$Number System$q$,'easy',$q$How many trailing zeros are there at the end of 25!?$q$,array[$q$4$q$,$q$5$q$,$q$6$q$,$q$7$q$],3);
select public._seed_arith_q($q$Number System$q$,'easy',$q$What is the sum of the first 20 odd natural numbers (1+3+5+...+39)?$q$,array[$q$380$q$,$q$400$q$,$q$420$q$,$q$441$q$],2);
select public._seed_arith_q($q$Number System$q$,'easy',$q$How many prime numbers are there below 50?$q$,array[$q$13$q$,$q$14$q$,$q$15$q$,$q$16$q$],3);
select public._seed_arith_q($q$Number System$q$,'easy',$q$The number 91 is which of the following?$q$,array[$q$A prime number$q$,$q$A composite number$q$,$q$Neither prime nor composite$q$,$q$A perfect square$q$],2);
select public._seed_arith_q($q$Number System$q$,'easy',$q$What is the unit digit of the product 43 x 57 x 68?$q$,array[$q$2$q$,$q$4$q$,$q$6$q$,$q$8$q$],4);
select public._seed_arith_q($q$Number System$q$,'medium',$q$What is the unit digit of 2^51?$q$,array[$q$2$q$,$q$4$q$,$q$6$q$,$q$8$q$],4);
select public._seed_arith_q($q$Number System$q$,'medium',$q$What is the remainder when 987654 is divided by 9?$q$,array[$q$0$q$,$q$3$q$,$q$6$q$,$q$8$q$],2);
select public._seed_arith_q($q$Number System$q$,'medium',$q$How many factors (divisors) does 360 have?$q$,array[$q$18$q$,$q$20$q$,$q$22$q$,$q$24$q$],4);
select public._seed_arith_q($q$Number System$q$,'medium',$q$What is the largest 4-digit number exactly divisible by 88?$q$,array[$q$9944$q$,$q$9955$q$,$q$9988$q$,$q$9999$q$],1);
select public._seed_arith_q($q$Number System$q$,'medium',$q$What is the remainder when 1234567 is divided by 8?$q$,array[$q$3$q$,$q$5$q$,$q$7$q$,$q$1$q$],3);
select public._seed_arith_q($q$Number System$q$,'medium',$q$How many trailing zeros are there at the end of 60!?$q$,array[$q$12$q$,$q$13$q$,$q$14$q$,$q$15$q$],3);
select public._seed_arith_q($q$Number System$q$,'medium',$q$What is the difference between the place value and the face value of 6 in 63845?$q$,array[$q$5994$q$,$q$6006$q$,$q$594$q$,$q$59994$q$],4);
select public._seed_arith_q($q$Number System$q$,'medium',$q$The smallest number that must be added to 1056 to make it exactly divisible by 23 is:$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$21$q$],2);
select public._seed_arith_q($q$Number System$q$,'hard',$q$What is the remainder when 1! + 2! + 3! + ... + 100! is divided by 5?$q$,array[$q$0$q$,$q$1$q$,$q$3$q$,$q$4$q$],3);
select public._seed_arith_q($q$Number System$q$,'hard',$q$A number when divided by 899 leaves remainder 63. What is the remainder when the same number is divided by 29?$q$,array[$q$4$q$,$q$5$q$,$q$6$q$,$q$7$q$],2);
select public._seed_arith_q($q$Number System$q$,'hard',$q$The product of four consecutive natural numbers is 3024. What is the largest of these numbers?$q$,array[$q$7$q$,$q$8$q$,$q$9$q$,$q$10$q$],3);
select public._seed_arith_q($q$Number System$q$,'hard',$q$What is the unit digit of 7^105 x 3^72?$q$,array[$q$1$q$,$q$3$q$,$q$7$q$,$q$9$q$],3);
select public._seed_arith_q($q$Number System$q$,'hard',$q$A 6-digit number of the form abcabc (e.g., 452452) is always exactly divisible by which of the following?$q$,array[$q$101$q$,$q$1001$q$,$q$111$q$,$q$10001$q$],2);
select public._seed_arith_q($q$Number System$q$,'hard',$q$How many even factors does 360 have?$q$,array[$q$12$q$,$q$16$q$,$q$18$q$,$q$20$q$],3);
select public._seed_arith_q($q$Number System$q$,'hard',$q$What is the highest power of 15 that exactly divides 100!?$q$,array[$q$24$q$,$q$48$q$,$q$20$q$,$q$16$q$],1);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$What is the remainder when 2^100 is divided by 7?$q$,array[$q$1$q$,$q$2$q$,$q$4$q$,$q$6$q$],2);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$What is the remainder when 15^23 + 23^23 is divided by 19?$q$,array[$q$0$q$,$q$4$q$,$q$9$q$,$q$15$q$],1);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$The largest number which divides 1657 and 2037 leaving remainders 6 and 5 respectively is:$q$,array[$q$123$q$,$q$127$q$,$q$235$q$,$q$305$q$],2);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$What is the remainder when 5^99 is divided by 7?$q$,array[$q$3$q$,$q$4$q$,$q$5$q$,$q$6$q$],4);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$What is the highest power of 2 that divides 100! (largest n with 2^n | 100!)?$q$,array[$q$94$q$,$q$95$q$,$q$96$q$,$q$97$q$],4);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$What is the unit digit of 1^1 + 2^2 + 3^3 + 4^4?$q$,array[$q$2$q$,$q$4$q$,$q$6$q$,$q$8$q$],4);
select public._seed_arith_q($q$Number System$q$,'very_hard',$q$What is the remainder when 3^47 is divided by 7?$q$,array[$q$2$q$,$q$3$q$,$q$5$q$,$q$6$q$],3);

-- H.C.F. and L.C.M. of Numbers (34 questions)
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$Find the H.C.F. of 36 and 84.$q$,array[$q$6$q$,$q$12$q$,$q$18$q$,$q$24$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$Find the L.C.M. of 12, 18 and 24.$q$,array[$q$48$q$,$q$60$q$,$q$72$q$,$q$96$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$What is the H.C.F. of two co-prime numbers?$q$,array[$q$0$q$,$q$1$q$,$q$Their product$q$,$q$The smaller number$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$Find the L.C.M. of 15, 20 and 36.$q$,array[$q$120$q$,$q$150$q$,$q$180$q$,$q$240$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$Find the H.C.F. of 24, 36 and 60.$q$,array[$q$6$q$,$q$12$q$,$q$18$q$,$q$24$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$The L.C.M. of two numbers is always:$q$,array[$q$Less than their H.C.F.$q$,$q$A multiple of their H.C.F.$q$,$q$Equal to their product always$q$,$q$A factor of their H.C.F.$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$Find the L.C.M. of 8, 12 and 16.$q$,array[$q$24$q$,$q$32$q$,$q$48$q$,$q$96$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'easy',$q$Find the H.C.F. of 18 and 48.$q$,array[$q$3$q$,$q$6$q$,$q$9$q$,$q$12$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$The H.C.F. and L.C.M. of two numbers are 14 and 140 respectively. If one of the numbers is 28, the other number is:$q$,array[$q$70$q$,$q$60$q$,$q$80$q$,$q$90$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$The L.C.M. and H.C.F. of two numbers are 168 and 6 respectively. If one number is 24, the other is:$q$,array[$q$36$q$,$q$38$q$,$q$40$q$,$q$42$q$],4);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$Find the L.C.M. of the fractions 2/4, 5/6 and 10/8.$q$,array[$q$5/2$q$,$q$10/3$q$,$q$5/6$q$,$q$5/12$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$Find the H.C.F. of the fractions 9/10 and 12/25.$q$,array[$q$3/50$q$,$q$3/5$q$,$q$9/50$q$,$q$36/5$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$Two numbers are in the ratio 5 : 11 and their H.C.F. is 7. The numbers are:$q$,array[$q$35 and 77$q$,$q$55 and 77$q$,$q$35 and 55$q$,$q$25 and 55$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$The H.C.F. of two numbers is 23 and the other two factors of their L.C.M. are 13 and 14. The larger of the two numbers is:$q$,array[$q$276$q$,$q$299$q$,$q$322$q$,$q$345$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$The L.C.M. of two numbers is 360 and their H.C.F. is 24. If one number is 120, the other is:$q$,array[$q$48$q$,$q$72$q$,$q$96$q$,$q$144$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$Find the greatest number of 3 digits which is exactly divisible by 6, 15 and 20.$q$,array[$q$840$q$,$q$900$q$,$q$960$q$,$q$990$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'medium',$q$Find the L.C.M. of the fractions 1/3, 5/6, 5/9 and 10/27.$q$,array[$q$10/3$q$,$q$5/27$q$,$q$10/27$q$,$q$5/3$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$Six bells commence tolling together and toll at intervals of 2, 4, 6, 8, 10 and 12 seconds respectively. In 30 minutes, how many times do they toll together?$q$,array[$q$4$q$,$q$10$q$,$q$15$q$,$q$16$q$],4);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$Three pieces of timber 143 m, 78 m and 117 m long have to be divided into planks of the same length. What is the greatest possible length of each plank?$q$,array[$q$7 m$q$,$q$11 m$q$,$q$13 m$q$,$q$17 m$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$The greatest possible length which can be used to measure exactly the lengths 7 m, 3 m 85 cm and 12 m 95 cm is:$q$,array[$q$15 cm$q$,$q$25 cm$q$,$q$35 cm$q$,$q$42 cm$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$Find the greatest number that will divide 43, 91 and 183 leaving the same remainder in each case.$q$,array[$q$4$q$,$q$7$q$,$q$9$q$,$q$13$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$Find the greatest number which on dividing 70 and 50 leaves remainders 1 and 4 respectively.$q$,array[$q$17$q$,$q$23$q$,$q$29$q$,$q$46$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$Traffic lights at three crossings change after 24, 36 and 54 seconds respectively. If they all change simultaneously at 10:15:00 a.m., at what time will they next change together?$q$,array[$q$10:18:36 a.m.$q$,$q$10:18:00 a.m.$q$,$q$10:16:12 a.m.$q$,$q$10:19:12 a.m.$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$What is the least number of square tiles required to exactly pave the floor of a room 12 m 24 cm long and 15 m 36 cm broad?$q$,array[$q$3264$q$,$q$2916$q$,$q$3120$q$,$q$3600$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'hard',$q$Find the smallest number which when divided by 6, 7, 8, 9 and 12 leaves a remainder of 1 in each case.$q$,array[$q$253$q$,$q$505$q$,$q$504$q$,$q$2521$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$Let N be the greatest number that will divide 1305, 4665 and 6905, leaving the same remainder in each case. The sum of the digits in N is:$q$,array[$q$4$q$,$q$5$q$,$q$6$q$,$q$8$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$The least multiple of 7 which leaves a remainder of 4 when divided by 6, 9, 15 and 18 is:$q$,array[$q$74$q$,$q$94$q$,$q$184$q$,$q$364$q$],4);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$Find the sum of all numbers between 550 and 700 which, when divided by 12, 16 and 24, leave remainder 5 in each case.$q$,array[$q$1980$q$,$q$1887$q$,$q$1860$q$,$q$1867$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$The least number which when increased by 5 is divisible by each of 24, 32, 36 and 54 is:$q$,array[$q$427$q$,$q$859$q$,$q$869$q$,$q$4320$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$The least number which must be subtracted from 5834 so that the result is exactly divisible by 20, 28, 32 and 35 is:$q$,array[$q$224$q$,$q$234$q$,$q$244$q$,$q$214$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$Three numbers which are co-prime to one another are such that the product of the first two is 551 and that of the last two is 1073. The sum of the three numbers is:$q$,array[$q$75$q$,$q$81$q$,$q$85$q$,$q$89$q$],3);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$The greatest number that will divide 2011 and 2623, leaving remainders 9 and 5 respectively, is:$q$,array[$q$146$q$,$q$154$q$,$q$162$q$,$q$174$q$],2);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$Four runners start together from the same point and complete one lap in 200, 300, 360 and 450 seconds respectively. After how many minutes will they all meet again at the starting point?$q$,array[$q$30 minutes$q$,$q$36 minutes$q$,$q$25 minutes$q$,$q$45 minutes$q$],1);
select public._seed_arith_q($q$H.C.F. and L.C.M. of Numbers$q$,'very_hard',$q$The number of tiles of the largest possible size to pave a rectangular courtyard 15 m 17 cm long and 9 m 2 cm broad is:$q$,array[$q$714$q$,$q$784$q$,$q$814$q$,$q$854$q$],3);

-- Decimal Fractions (35 questions)
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Add the decimals: 3.5 + 0.75 = ?$q$,array[$q$4.25$q$,$q$4.05$q$,$q$3.125$q$,$q$4.10$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Subtract: 5.6 − 2.85 = ?$q$,array[$q$2.75$q$,$q$3.25$q$,$q$2.85$q$,$q$2.15$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Multiply: 0.4 × 0.05 = ?$q$,array[$q$0.2$q$,$q$0.02$q$,$q$0.002$q$,$q$0.20$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Divide: 0.36 ÷ 0.6 = ?$q$,array[$q$0.06$q$,$q$6$q$,$q$0.6$q$,$q$0.66$q$],3);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Evaluate: 1.2 × 0.3 × 0.4 = ?$q$,array[$q$0.144$q$,$q$1.44$q$,$q$0.0144$q$,$q$0.44$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Divide: 6.5 ÷ 0.5 = ?$q$,array[$q$1.3$q$,$q$13$q$,$q$0.13$q$,$q$3.25$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Multiply by a power of ten: 0.007 × 100 = ?$q$,array[$q$0.07$q$,$q$0.7$q$,$q$7$q$,$q$70$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$In the number 47.038, what is the place value of the digit 3?$q$,array[$q$3$q$,$q$0.3$q$,$q$0.03$q$,$q$0.003$q$],3);
select public._seed_arith_q($q$Decimal Fractions$q$,'easy',$q$Evaluate: 0.25 × 0.4 = ?$q$,array[$q$0.1$q$,$q$0.01$q$,$q$1.0$q$,$q$0.001$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$Express the fraction 3/8 as a decimal.$q$,array[$q$0.375$q$,$q$0.38$q$,$q$0.35$q$,$q$0.325$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$Express 0.625 as a fraction in lowest terms.$q$,array[$q$5/8$q$,$q$625/100$q$,$q$3/5$q$,$q$13/20$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$Which of these decimals is the largest: 0.07, 0.098, 0.1, 0.089 ?$q$,array[$q$0.098$q$,$q$0.1$q$,$q$0.089$q$,$q$0.07$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$1.5 hours is what decimal part of a full day?$q$,array[$q$0.0625$q$,$q$0.15$q$,$q$0.625$q$,$q$0.0417$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$A pen costs Rs 6.25. What is the cost of 8 such pens?$q$,array[$q$Rs 48.00$q$,$q$Rs 50.00$q$,$q$Rs 52.50$q$,$q$Rs 49.75$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$A bag weighs 0.75 kg. Add another 250 g to it. What is the total weight in kilograms?$q$,array[$q$1.25 kg$q$,$q$1.0 kg$q$,$q$0.775 kg$q$,$q$1.025 kg$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$Express 7/20 as a decimal.$q$,array[$q$0.35$q$,$q$0.34$q$,$q$0.72$q$,$q$0.375$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$Evaluate: 2.4 ÷ 0.08 = ?$q$,array[$q$3$q$,$q$30$q$,$q$0.3$q$,$q$300$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'medium',$q$Arrange 0.3, 0.03, 0.303, 0.033 in ascending order and pick the smallest.$q$,array[$q$0.03$q$,$q$0.033$q$,$q$0.3$q$,$q$0.303$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Convert the recurring decimal 0.7̄ (0.7777…) to a fraction in lowest terms.$q$,array[$q$7/9$q$,$q$7/10$q$,$q$70/99$q$,$q$7/11$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Convert the mixed recurring decimal 0.23̄ (0.2333…) to a fraction in lowest terms.$q$,array[$q$23/99$q$,$q$7/30$q$,$q$23/90$q$,$q$21/99$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Evaluate: (2.39² − 1.61²) ÷ (2.39 − 1.61).$q$,array[$q$2$q$,$q$4$q$,$q$6$q$,$q$8$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Find the value of (0.1³ + 0.02³) ÷ (0.2³ + 0.04³).$q$,array[$q$0.0125$q$,$q$0.125$q$,$q$0.25$q$,$q$0.5$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Simplify: (0.05³ − 0.04³) ÷ (0.05² + 0.05×0.04 + 0.04²).$q$,array[$q$0.01$q$,$q$0.09$q$,$q$0.1$q$,$q$0.009$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Evaluate: 4.036 ÷ 0.04.$q$,array[$q$10.09$q$,$q$100.9$q$,$q$1.009$q$,$q$1009$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Convert the recurring decimal 0.57̄ (0.575757…) to a fraction in lowest terms.$q$,array[$q$57/100$q$,$q$19/33$q$,$q$57/90$q$,$q$19/30$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'hard',$q$Convert 0.631̄ (0.6313131…, where only '31' repeats) to a fraction in lowest terms.$q$,array[$q$631/999$q$,$q$125/198$q$,$q$631/990$q$,$q$63/99$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Convert 0.14̄ (0.14444…, where only '4' repeats) to a fraction in lowest terms.$q$,array[$q$13/90$q$,$q$14/99$q$,$q$13/99$q$,$q$7/45$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$What is the exact value of the recurring decimal 0.9̄ (0.9999…)?$q$,array[$q$0.99$q$,$q$1$q$,$q$0.999$q$,$q$9/10$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Simplify: (0.87³ + 0.13³) ÷ (0.87² − 0.87×0.13 + 0.13²).$q$,array[$q$0.74$q$,$q$1$q$,$q$0.87$q$,$q$1.13$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Convert 0.234̄ (0.2343434…, where only '34' repeats) to a fraction in lowest terms.$q$,array[$q$234/999$q$,$q$116/495$q$,$q$232/990$q$,$q$117/500$q$],2);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Convert the recurring decimal 3.63̄ (3.636363…) to a fraction in lowest terms.$q$,array[$q$40/11$q$,$q$36/11$q$,$q$400/110$q$,$q$363/99$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Evaluate the mixed fraction–decimal expression: 2/5 + 0.25 − 1/8.$q$,array[$q$0.525$q$,$q$0.65$q$,$q$0.575$q$,$q$0.5$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Express 0.0625 as a fraction in its lowest terms.$q$,array[$q$1/16$q$,$q$625/10000$q$,$q$5/80$q$,$q$1/8$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Convert 1.27̄ (1.27777…, where only '7' repeats) to a fraction in lowest terms.$q$,array[$q$23/18$q$,$q$127/99$q$,$q$115/90$q$,$q$23/17$q$],1);
select public._seed_arith_q($q$Decimal Fractions$q$,'very_hard',$q$Simplify: (0.05² − 0.04²) ÷ (0.05 − 0.04).$q$,array[$q$0.01$q$,$q$0.09$q$,$q$0.9$q$,$q$0.045$q$],2);

drop function public._seed_arith_q(text,text,text,text[],int);
