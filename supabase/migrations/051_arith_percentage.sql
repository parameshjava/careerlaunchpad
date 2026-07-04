-- ============================================================================
-- 051_arith_percentage.sql
-- Question-bank seed: Arithmetic chapter "Percentage" -- 52 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- x% of y, increase/decrease, successive change, pass-mark, election, consumption.
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

-- Percentage (52 questions)
select public._seed_arith_q($q$Percentage$q$,'easy',$q$What is 35% of 240?$q$,array[$q$76$q$,$q$84$q$,$q$88$q$,$q$96$q$],2,$q$240 × 35/100 = 84$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$If 15% of a number is 45, find the number.$q$,array[$q$270$q$,$q$300$q$,$q$315$q$,$q$330$q$],2,$q$45 × 100/15 = 300$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$What percent of 80 is 20?$q$,array[$q$20%$q$,$q$25%$q$,$q$30%$q$,$q$40%$q$],2,$q$20/80 × 100 = 25%$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$Express 3/8 as a percentage.$q$,array[$q$32.5%$q$,$q$35%$q$,$q$37.5%$q$,$q$40%$q$],3,$q$3/8 × 100 = 37.5%$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$What is 12.5% of 640?$q$,array[$q$70$q$,$q$75$q$,$q$80$q$,$q$85$q$],3,$q$640 × 12.5/100 = 80$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$45 is what percent of 300?$q$,array[$q$12%$q$,$q$15%$q$,$q$18%$q$,$q$20%$q$],2,$q$45/300 × 100 = 15%$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$If 40% of a number is 96, find the number.$q$,array[$q$220$q$,$q$240$q$,$q$260$q$,$q$280$q$],2,$q$96 × 100/40 = 240$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$A number is first increased by 20% and then the result is decreased by 20%. What is the net percentage change?$q$,array[$q$4% increase$q$,$q$4% decrease$q$,$q$No change$q$,$q$2% decrease$q$],2,$q$Net factor = 1.20 × 0.80 = 0.96, i.e. 96% of the original — a 4% decrease.$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$What is 150% of 60?$q$,array[$q$75$q$,$q$80$q$,$q$90$q$,$q$100$q$],3,$q$60 × 150/100 = 90$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$Express 40% as a fraction in lowest terms.$q$,array[$q$1/4$q$,$q$2/5$q$,$q$3/5$q$,$q$4/5$q$],2,$q$40/100 = 2/5$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$How much is 8% of 2500?$q$,array[$q$150$q$,$q$180$q$,$q$200$q$,$q$220$q$],3,$q$2500 × 8/100 = 200$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$72 is what percent of 90?$q$,array[$q$75%$q$,$q$78%$q$,$q$80%$q$,$q$82%$q$],3,$q$72/90 × 100 = 80%$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$If 25% of x is 75, then 60% of x is?$q$,array[$q$150$q$,$q$160$q$,$q$170$q$,$q$180$q$],4,$q$x = 300; 60% of 300 = 180$q$);
select public._seed_arith_q($q$Percentage$q$,'easy',$q$What is 62.5% of 320?$q$,array[$q$180$q$,$q$190$q$,$q$200$q$,$q$210$q$],3,$q$320 × 62.5/100 = 200$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A number is increased by 20% then decreased by 20%. What is the net change?$q$,array[$q$No change$q$,$q$4% decrease$q$,$q$4% increase$q$,$q$2% decrease$q$],2,$q$1.2 × 0.8 = 0.96 → 4% decrease$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A is 25% more than B. B is what percent less than A?$q$,array[$q$20%$q$,$q$22%$q$,$q$25%$q$,$q$30%$q$],1,$q$A = 1.25B; (0.25B/1.25B) × 100 = 20%$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A salary after a 20% increase is 36000. Find the original salary.$q$,array[$q$28000$q$,$q$30000$q$,$q$32000$q$,$q$34000$q$],2,$q$36000/1.2 = 30000$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A price rises 10% then rises another 20%. What is the total percent increase?$q$,array[$q$30%$q$,$q$31%$q$,$q$32%$q$,$q$33%$q$],3,$q$1.1 × 1.2 = 1.32 → 32%$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$If the price of sugar rises 25%, by what percent must consumption fall to keep expenditure the same?$q$,array[$q$18%$q$,$q$20%$q$,$q$22%$q$,$q$25%$q$],2,$q$25/125 × 100 = 20%$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$In a two-candidate election the winner got 60% of votes and won by 1600 votes. Total votes polled?$q$,array[$q$7000$q$,$q$7500$q$,$q$8000$q$,$q$8500$q$],3,$q$60% − 40% = 20% = 1600 → total = 8000$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A number decreased by 30% gives 490. Find the number.$q$,array[$q$650$q$,$q$680$q$,$q$700$q$,$q$720$q$],3,$q$490/0.7 = 700$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$Population is 10000; it grows 10% in the first year and 20% in the second. Population after 2 years?$q$,array[$q$12800$q$,$q$13000$q$,$q$13200$q$,$q$13500$q$],3,$q$10000 × 1.1 × 1.2 = 13200$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$If A's income is 20% less than B's, then B's income is what percent more than A's?$q$,array[$q$20%$q$,$q$22%$q$,$q$25%$q$,$q$28%$q$],3,$q$A = 0.8B; (0.2B/0.8B) × 100 = 25%$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$40% of students passed an exam. If 240 students failed, how many students appeared in total?$q$,array[$q$380$q$,$q$400$q$,$q$420$q$,$q$440$q$],2,$q$Failed = 60% = 240 → total = 400$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A value is first increased by 50% then decreased by 40%. Net percent change?$q$,array[$q$8% decrease$q$,$q$10% increase$q$,$q$10% decrease$q$,$q$12% increase$q$],3,$q$1.5 × 0.6 = 0.9 → 10% decrease$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$Two successive discounts of 20% and 10% are given on a marked price of 1000. Final price?$q$,array[$q$700$q$,$q$710$q$,$q$720$q$,$q$730$q$],3,$q$1000 × 0.8 × 0.9 = 720$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$If 30% of A = 45% of B, then A : B is?$q$,array[$q$2:3$q$,$q$3:2$q$,$q$4:3$q$,$q$3:4$q$],2,$q$0.30A = 0.45B → A/B = 45/30 = 3/2$q$);
select public._seed_arith_q($q$Percentage$q$,'medium',$q$A man spends 75% of his income and saves 2500. Find his income.$q$,array[$q$9000$q$,$q$10000$q$,$q$11000$q$,$q$12000$q$],2,$q$Savings = 25% = 2500 → income = 10000$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$A man's salary is first increased by 10% and then by 20%. What is the overall percentage increase in his salary?$q$,array[$q$30%$q$,$q$32%$q$,$q$33%$q$,$q$36%$q$],2,$q$1.10 × 1.20 = 1.32, so net increase = 32%.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$A shopkeeper allows two successive discounts of 20% and 25% on an article. The single equivalent discount is:$q$,array[$q$45%$q$,$q$42%$q$,$q$40%$q$,$q$38%$q$],3,$q$Net price factor = 0.80 × 0.75 = 0.60, so discount = 40%.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$The population of a town is 8000. It increases by 10% in the first year and decreases by 10% in the second year. The population at the end of two years is:$q$,array[$q$8000$q$,$q$7920$q$,$q$7900$q$,$q$8080$q$],2,$q$8000 × 1.10 × 0.90 = 7920.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$The value of a machine depreciates at 10% per annum. If its present value is Rs. 100000, its value after 2 years will be:$q$,array[$q$Rs. 80000$q$,$q$Rs. 81000$q$,$q$Rs. 82000$q$,$q$Rs. 79000$q$],2,$q$100000 × 0.9 × 0.9 = 81000.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$A student scores 30% of the maximum marks and fails by 20 marks. Another student who scores 40% gets 30 marks more than the passing mark. Find the maximum marks.$q$,array[$q$400$q$,$q$450$q$,$q$500$q$,$q$550$q$],3,$q$0.30M + 20 = 0.40M − 30 ⇒ 0.10M = 50 ⇒ M = 500.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$In an election between two candidates, the winner secured 60% of the valid votes and won by 8400 votes. The total number of valid votes was:$q$,array[$q$40000$q$,$q$42000$q$,$q$44000$q$,$q$46000$q$],2,$q$Margin = 60% − 40% = 20% = 8400 ⇒ total = 8400 ÷ 0.20 = 42000.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$A person's salary is increased by 20% and then decreased by 20%. The net change in his salary is:$q$,array[$q$No change$q$,$q$4% increase$q$,$q$4% decrease$q$,$q$2% decrease$q$],3,$q$1.20 × 0.80 = 0.96 ⇒ 4% decrease.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$A number is increased by 15% and the result is again increased by 15%. The overall percentage increase is:$q$,array[$q$30%$q$,$q$30.25%$q$,$q$32.25%$q$,$q$33.25%$q$],3,$q$1.15 × 1.15 = 1.3225 ⇒ 32.25%.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$The passing mark in an exam is 33%. A candidate who gets 25% of the maximum marks fails by 40 marks. The maximum marks are:$q$,array[$q$400$q$,$q$450$q$,$q$500$q$,$q$600$q$],3,$q$(0.33 − 0.25)M = 40 ⇒ 0.08M = 40 ⇒ M = 500.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$In an election between two candidates, one candidate got 45% of the total votes and lost by 2000 votes. The number of votes secured by the winner was:$q$,array[$q$9000$q$,$q$10000$q$,$q$11000$q$,$q$12000$q$],3,$q$Margin = 55% − 45% = 10% = 2000 ⇒ total = 20000; winner = 0.55 × 20000 = 11000.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$A car depreciates by 20% in the first year and by 10% in each of the next two years. If its initial value is Rs. 200000, its value at the end of 3 years is:$q$,array[$q$Rs. 129600$q$,$q$Rs. 130000$q$,$q$Rs. 128000$q$,$q$Rs. 132000$q$],1,$q$200000 × 0.8 × 0.9 × 0.9 = 129600.$q$);
select public._seed_arith_q($q$Percentage$q$,'hard',$q$If the length and breadth of a rectangle are each increased by 20%, the area of the rectangle increases by:$q$,array[$q$40%$q$,$q$42%$q$,$q$44%$q$,$q$48%$q$],3,$q$1.20 × 1.20 = 1.44 ⇒ 44% increase.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$A man spends 75% of his income and saves the rest. If his income increases by 20% and his expenditure increases by 10%, his savings increase by:$q$,array[$q$40%$q$,$q$45%$q$,$q$50%$q$,$q$55%$q$],3,$q$Inc 100, exp 75, sav 25 → inc 120, exp 82.5, sav 37.5; (37.5−25)/25 = 50%.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$The price of sugar is increased by 25%. By what percentage must a family reduce its consumption so that expenditure on sugar remains unchanged?$q$,array[$q$20%$q$,$q$25%$q$,$q$22%$q$,$q$18%$q$],1,$q$Reduction % = 25/(100+25) × 100 = 20%.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$The price of rice falls by 20%. By what percentage can a household increase its consumption so that expenditure on rice remains the same?$q$,array[$q$20%$q$,$q$22%$q$,$q$24%$q$,$q$25%$q$],4,$q$Increase % = 20/(100−20) × 100 = 25%.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$If the numerator of a fraction is increased by 20% and the denominator is decreased by 20%, the fraction changes by:$q$,array[$q$No change$q$,$q$40% increase$q$,$q$50% increase$q$,$q$44% increase$q$],3,$q$New/old = 1.20/0.80 = 1.50 ⇒ 50% increase.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$A 40-litre solution contains 10% alcohol. How much water must be added to make it an 8% alcohol solution?$q$,array[$q$8 litres$q$,$q$10 litres$q$,$q$12 litres$q$,$q$15 litres$q$],2,$q$Alcohol = 4 L; new total = 4/0.08 = 50 L; water added = 50 − 40 = 10 L.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$A man saves 25% of his income. If his income increases by 25% and his expenditure increases by 10%, his savings increase by:$q$,array[$q$60%$q$,$q$65%$q$,$q$70%$q$,$q$75%$q$],3,$q$Inc 100, exp 75, sav 25 → inc 125, exp 82.5, sav 42.5; (42.5−25)/25 = 70%.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$60 litres of a mixture contain milk and water in which water is 15%. How much pure milk must be added so that water becomes 10% of the new mixture?$q$,array[$q$20 litres$q$,$q$25 litres$q$,$q$30 litres$q$,$q$35 litres$q$],3,$q$Water = 9 L (unchanged); new total = 9/0.10 = 90 L; milk added = 90 − 60 = 30 L.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$If the numerator of a fraction is increased by 40% and the denominator is decreased by 30%, the fraction increases by:$q$,array[$q$70%$q$,$q$90%$q$,$q$100%$q$,$q$110%$q$],2,$q$New/old = 1.40/0.70 = 2.00 ⇒ 100% increase.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$A vessel contains 50 litres of a solution that is 20% acid. How much of the solution must be drawn off and replaced with water so that the acid content becomes 10%?$q$,array[$q$20 litres$q$,$q$25 litres$q$,$q$30 litres$q$,$q$10 litres$q$],2,$q$Remove x: acid = 0.2(50−x); dilute to 50 L at 10% ⇒ (10 − 0.2x)/50 = 0.10 ⇒ x = 25.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$A's income is 25% more than B's income. B's income is less than A's income by:$q$,array[$q$16%$q$,$q$18%$q$,$q$20%$q$,$q$25%$q$],3,$q$B less than A = 25/125 × 100 = 20%.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$The price of a commodity rises by 20% while a family reduces its consumption by 10%. The percentage change in the family's expenditure on it is:$q$,array[$q$10% increase$q$,$q$8% increase$q$,$q$12% increase$q$,$q$6% increase$q$],2,$q$1.20 × 0.90 = 1.08 ⇒ 8% increase.$q$);
select public._seed_arith_q($q$Percentage$q$,'very_hard',$q$A person spends 50% of his income on food, 20% of the remainder on rent, and saves the rest. His savings are what percentage of his income?$q$,array[$q$30%$q$,$q$35%$q$,$q$40%$q$,$q$45%$q$],3,$q$Food 50, remainder 50, rent = 20% of 50 = 10, savings = 40 ⇒ 40%.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
