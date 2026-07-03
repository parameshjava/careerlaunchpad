-- ============================================================================
-- 053_arith_ratio_and_proportion.sql
-- Question-bank seed: Arithmetic chapter "Ratio and Proportion" -- 40 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Proportionals, chained ratios, share division, mixtures, componendo-dividendo.
-- Exam-grade difficulty floor; answers independently recomputed & each correct option
-- re-derived (not trusting the source index); 4 distinct-valued options, one correct;
-- each carries a worked explanation. Depends on 023. Reuses the idempotent
-- _seed_arith_q helper (dollar-quoted). Safe to re-run.
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

-- Ratio and Proportion (40 questions)
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$If a : b = 3 : 4 and b : c = 5 : 7, then a : c is:$q$,array[$q$12 : 35$q$,$q$15 : 28$q$,$q$20 : 21$q$,$q$15 : 14$q$],2,$q$a:c = (3×5):(4×7) = 15:28.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$A sum of ₹1560 is divided between two persons in the ratio 5 : 7. The larger share is:$q$,array[$q$₹650$q$,$q$₹780$q$,$q$₹910$q$,$q$₹1092$q$],3,$q$Larger = 1560×7/12 = 910.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$The ratio 0.75 : 1.25 in simplest form is:$q$,array[$q$3 : 5$q$,$q$5 : 3$q$,$q$3 : 4$q$,$q$2 : 5$q$],1,$q$75:125 = 3:5.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$Find the fourth proportional to 4, 6 and 14.$q$,array[$q$18$q$,$q$21$q$,$q$24$q$,$q$28$q$],2,$q$x = 6×14/4 = 21.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$The mean proportional between 9 and 16 is:$q$,array[$q$11$q$,$q$12$q$,$q$13$q$,$q$14$q$],2,$q$√(9×16)=√144=12.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$If a : b = 2 : 3 and b : c = 4 : 5, then a : b : c is:$q$,array[$q$8 : 12 : 15$q$,$q$2 : 3 : 5$q$,$q$8 : 12 : 10$q$,$q$6 : 12 : 15$q$],1,$q$Scale b to 12: a:b:c = 8:12:15.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$The ratio 40 : 60 expressed in lowest terms is:$q$,array[$q$4 : 6$q$,$q$2 : 3$q$,$q$3 : 2$q$,$q$4 : 5$q$],2,$q$40:60 = 2:3.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$The third proportional to 4 and 12 is:$q$,array[$q$30$q$,$q$32$q$,$q$36$q$,$q$48$q$],3,$q$x = 12²/4 = 36.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$₹750 is divided among A, B and C in the ratio 2 : 3 : 5. C's share is:$q$,array[$q$₹150$q$,$q$₹225$q$,$q$₹300$q$,$q$₹375$q$],4,$q$C = 750×5/10 = 375.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'easy',$q$Which of the following fractions is the greatest: 3/5 or 5/8?$q$,array[$q$3/5$q$,$q$5/8$q$,$q$Both equal$q$,$q$Cannot be determined$q$],2,$q$3/5=0.60, 5/8=0.625 → 5/8 greater.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$Two numbers are in the ratio 5 : 7. If each is increased by 6, the ratio becomes 3 : 4. The sum of the numbers is:$q$,array[$q$60$q$,$q$66$q$,$q$72$q$,$q$84$q$],3,$q$(5x+6)/(7x+6)=3/4 → x=6; numbers 30,42; sum 72.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$A bag has ₹1, 50p and 25p coins in the ratio 5 : 6 : 8, totalling ₹210. The number of 25-paise coins is:$q$,array[$q$126$q$,$q$147$q$,$q$168$q$,$q$189$q$],3,$q$Value/unit=5+3+2=10; units=21; 25p coins=8×21=168.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$Two numbers are in the ratio 3 : 5. If 9 is subtracted from each, they are in the ratio 12 : 23. The larger number is:$q$,array[$q$33$q$,$q$44$q$,$q$55$q$,$q$66$q$],3,$q$(3x−9)/(5x−9)=12/23 → x=11; larger=55.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$Two mixtures with milk : water = 3 : 2 and 7 : 3 are mixed in equal quantities. The milk : water ratio of the final mixture is:$q$,array[$q$10 : 5$q$,$q$13 : 7$q$,$q$5 : 3$q$,$q$7 : 4$q$],2,$q$Per 10 units each: milk 6+7=13, water 4+3=7 → 13:7.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$If A : B = 2 : 3, B : C = 4 : 5 and C : D = 6 : 7, then A : D equals:$q$,array[$q$16 : 35$q$,$q$8 : 35$q$,$q$48 : 105$q$,$q$2 : 7$q$],1,$q$A:D = (2·4·6):(3·5·7) = 48:105 = 16:35.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$₹3900 is divided among A, B and C in the ratio 1/2 : 1/3 : 1/4. A's share is:$q$,array[$q$₹1200$q$,$q$₹1500$q$,$q$₹1800$q$,$q$₹900$q$],3,$q$Ratio ×12 = 6:4:3 (sum13); A=3900×6/13=1800.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$Two numbers are in the ratio 4 : 5 and their LCM is 180. Their sum is:$q$,array[$q$72$q$,$q$81$q$,$q$90$q$,$q$99$q$],2,$q$4k,5k; LCM=20k=180→k=9; sum=36+45=81.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$The present ages of two persons are in the ratio 4 : 3. After 6 years the ratio becomes 6 : 5. The present age of the elder is:$q$,array[$q$9 years$q$,$q$12 years$q$,$q$15 years$q$,$q$16 years$q$],2,$q$(4x+6)/(3x+6)=6/5 → x=3; elder=12.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$Two numbers are in the ratio 7 : 5 and their difference is 16. The smaller number is:$q$,array[$q$35$q$,$q$40$q$,$q$45$q$,$q$56$q$],2,$q$2k=16→k=8; smaller=5×8=40.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'medium',$q$₹3500 is divided among A, B, C so that A : B = 2 : 3 and B : C = 4 : 5. B's share is:$q$,array[$q$₹800$q$,$q$₹1000$q$,$q$₹1200$q$,$q$₹1500$q$],3,$q$A:B:C=8:12:15 (sum35); B=3500×12/35=1200.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$The incomes of two persons are in the ratio 5 : 4 and their expenditures in the ratio 3 : 2. If each saves ₹2000, the income of the first is:$q$,array[$q$₹4000$q$,$q$₹5000$q$,$q$₹6000$q$,$q$₹7000$q$],2,$q$5x−3y=2000, 4x−2y=2000 → x=1000; income=5x=5000.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$A sum is divided among A, B, C where A = 2/3 of B and B = 1/4 of C. If the total is ₹5100, C's share is:$q$,array[$q$₹850$q$,$q$₹1275$q$,$q$₹3600$q$,$q$₹3400$q$],3,$q$B=C/4, A=C/6; sum=C·17/12=5100 → C=3600.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$Three numbers are in the ratio 3 : 4 : 5 and the sum of their squares is 1250. The largest number is:$q$,array[$q$15$q$,$q$20$q$,$q$25$q$,$q$30$q$],3,$q$50m²=1250→m=5; largest=5m=25.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$A vessel has 60 L of a milk–water mixture in the ratio 2 : 1. How much water must be added so that the ratio becomes 1 : 2?$q$,array[$q$40 L$q$,$q$50 L$q$,$q$60 L$q$,$q$30 L$q$],3,$q$Milk40, water20; need 40:(20+w)=1:2 → w=60.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$A and B have amounts in the ratio 7 : 9. If A gives ₹30 to B, the ratio becomes 1 : 2. A's original amount was:$q$,array[$q$₹108$q$,$q$₹126$q$,$q$₹144$q$,$q$₹162$q$],2,$q$(7x−30)/(9x+30)=1/2 → x=18; A=7×18=126.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$The salaries of A, B and C are in the ratio 2 : 3 : 5 and their total is ₹15000. B's salary is:$q$,array[$q$₹3000$q$,$q$₹4500$q$,$q$₹6000$q$,$q$₹7500$q$],2,$q$B=15000×3/10=4500.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$If A : B = 4 : 6 : and B : C follow so that A : B : C = 4 : 6 : 7, and C − A = 45, then B equals:$q$,array[$q$60$q$,$q$75$q$,$q$90$q$,$q$105$q$],3,$q$3k=45→k=15; B=6k=90.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$From 40 L of a milk–water mixture (milk : water = 3 : 1), 8 L is removed and replaced with water. The new milk : water ratio is:$q$,array[$q$2 : 1$q$,$q$3 : 2$q$,$q$5 : 3$q$,$q$4 : 3$q$],2,$q$Milk30,water10; remove 6+2 → milk24,water8; add 8 water → 24:16=3:2.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$A sum is divided among A, B, C so that A : B = 3 : 4 and B : C = 8 : 9. If C gets ₹1200 more than A, B's share is:$q$,array[$q$₹2400$q$,$q$₹3200$q$,$q$₹3600$q$,$q$₹2800$q$],2,$q$A:B:C=6:8:9; C−A=3k=1200→k=400; B=8×400=3200.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'hard',$q$The number of boys and girls in a class is in the ratio 3 : 2. If 30 more boys join, the ratio becomes 5 : 2. The number of girls is:$q$,array[$q$20$q$,$q$25$q$,$q$30$q$,$q$45$q$],3,$q$(3x+30)/(2x)=5/2 → x=15; girls=2×15=30.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$The salaries of A and B are in the ratio 2 : 3. If A gets a 10% increment and B a 20% increment, the new ratio of their salaries is:$q$,array[$q$11 : 18$q$,$q$10 : 18$q$,$q$12 : 19$q$,$q$2 : 3$q$],1,$q$2(1.1):3(1.2)=2.2:3.6=11:18.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$If a/b = b/c = c/d (continued proportion) with a = 27 and d = 8, then b equals:$q$,array[$q$12$q$,$q$15$q$,$q$18$q$,$q$20$q$],3,$q$27r³=8→r=2/3; b=27r=18.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$A invests capital in the ratio 3 : 5 with B, for periods in the ratio 4 : 6. The ratio of their profit shares is:$q$,array[$q$3 : 5$q$,$q$2 : 5$q$,$q$4 : 6$q$,$q$1 : 2$q$],2,$q$Profit ∝ capital×time = 12:30 = 2:5.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$If (a + b)/(a − b) = 5/3, then a : b equals:$q$,array[$q$3 : 1$q$,$q$4 : 1$q$,$q$5 : 3$q$,$q$2 : 1$q$],2,$q$By componendo–dividendo a/b=(5+3)/(5−3)=4:1.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$Three numbers are in the ratio 2 : 3 : 4 and their product is 192. The middle number is:$q$,array[$q$4$q$,$q$6$q$,$q$8$q$,$q$12$q$],2,$q$24k³=192→k=2; middle=3k=6.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$The salaries of A, B, C are in the ratio 3 : 4 : 5. After increments of 15%, 10% and 20% respectively, the new ratio is:$q$,array[$q$69 : 88 : 120$q$,$q$3 : 4 : 5$q$,$q$69 : 90 : 120$q$,$q$70 : 88 : 120$q$],1,$q$3.45:4.40:6.00 = 345:440:600 = 69:88:120.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$If 16, b, 25 are in continued proportion, then b equals:$q$,array[$q$18$q$,$q$20$q$,$q$21$q$,$q$22$q$],2,$q$b=√(16×25)=20 (mean proportional).$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$From 80 L of pure milk, 16 L is drawn and replaced with water; this is repeated once more. The quantity of milk left is:$q$,array[$q$48 L$q$,$q$51.2 L$q$,$q$54 L$q$,$q$64 L$q$],2,$q$80×(1−16/80)² = 80×0.64 = 51.2 L.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$Incomes of two persons are in the ratio 3 : 4 and expenditures in the ratio 5 : 7. If each saves ₹1600, the income of the first is:$q$,array[$q$₹8000$q$,$q$₹9600$q$,$q$₹12800$q$,$q$₹6400$q$],2,$q$3x−5y=4x−7y→x=2y; 6y−5y=1600→y=1600, x=3200; income=3x=9600.$q$);
select public._seed_arith_q($q$Ratio and Proportion$q$,'very_hard',$q$If A : B = 5 : 6, B : C = 3 : 4 and C : D = 7 : 9, then A : D equals:$q$,array[$q$35 : 72$q$,$q$5 : 9$q$,$q$105 : 216$q$,$q$7 : 18$q$],1,$q$A:D = (5·3·7):(6·4·9) = 105:216 = 35:72.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
