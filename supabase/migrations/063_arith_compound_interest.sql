-- ============================================================================
-- 063_arith_compound_interest.sql
-- Question-bank seed: Arithmetic chapter "Compound Interest" -- 40 single-answer MCQs
-- from ACTUAL previous-year papers (bank PO/Clerk, SSC, ICET, IT placement) via
-- IndiaBix, PrepInsta, Testbook, Adda247, Oliveboard, CareerPower, Examveda, 2IIM,
-- GeeksforGeeks, Sawaal. Exam-grade floor; answers independently recomputed & each
-- correct option verified; 4 distinct-valued options, one correct; each carries a
-- worked explanation. Depends on 023. Reuses idempotent _seed_arith_q. Safe to re-run.
-- CI/amount, half-yearly/quarterly, CI-SI difference, installments, doubling, depreciation.
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

-- Compound Interest (40 questions)
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$A sum of ₹8,000 is invested at 5% per annum compound interest. Find the compound interest after 2 years.$q$,array[$q$₹800$q$,$q$₹820$q$,$q$₹840$q$,$q$₹810$q$],2,$q$CI = 8000(1.05)^2 − 8000 = 8820 − 8000 = ₹820.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$₹10,000 is deposited at 10% per annum compound interest. What is the amount after 2 years?$q$,array[$q$₹11,000$q$,$q$₹12,000$q$,$q$₹12,100$q$,$q$₹12,210$q$],3,$q$A = 10000(1.10)^2 = 10000×1.21 = ₹12,100.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$Find the compound interest on ₹12,000 for 2 years at 10% per annum.$q$,array[$q$₹2,400$q$,$q$₹2,520$q$,$q$₹2,640$q$,$q$₹2,500$q$],2,$q$CI = 12000(1.10)^2 − 12000 = 14520 − 12000 = ₹2,520.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$A principal of ₹15,000 earns compound interest at 8% per annum. Find the amount at the end of 2 years.$q$,array[$q$₹17,400$q$,$q$₹17,496$q$,$q$₹17,640$q$,$q$₹16,200$q$],2,$q$A = 15000(1.08)^2 = 15000×1.1664 = ₹17,496.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$Find the compound interest on ₹6,250 at 4% per annum for 2 years.$q$,array[$q$₹500$q$,$q$₹510$q$,$q$₹520$q$,$q$₹490$q$],2,$q$CI = 6250(1.04)^2 − 6250 = 6760 − 6250 = ₹510.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$₹25,000 is invested at 12% per annum compound interest. Find the amount after 2 years.$q$,array[$q$₹31,000$q$,$q$₹31,360$q$,$q$₹32,000$q$,$q$₹30,240$q$],2,$q$A = 25000(1.12)^2 = 25000×1.2544 = ₹31,360.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$Find the compound interest on ₹16,000 for 3 years at 5% per annum.$q$,array[$q$₹2,400$q$,$q$₹2,522$q$,$q$₹2,600$q$,$q$₹2,522.50$q$],2,$q$A = 16000(1.05)^3 = 18522; CI = 18522 − 16000 = ₹2,522.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$A sum of ₹5,000 is lent at 20% per annum compound interest. Find the compound interest after 2 years.$q$,array[$q$₹2,000$q$,$q$₹2,100$q$,$q$₹2,200$q$,$q$₹2,400$q$],3,$q$CI = 5000(1.20)^2 − 5000 = 7200 − 5000 = ₹2,200.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$Find the amount on ₹20,000 at 15% per annum compound interest for 2 years.$q$,array[$q$₹26,000$q$,$q$₹26,450$q$,$q$₹26,500$q$,$q$₹23,000$q$],2,$q$A = 20000(1.15)^2 = 20000×1.3225 = ₹26,450.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'easy',$q$₹9,000 is invested at 10% per annum compound interest for 3 years. Find the amount.$q$,array[$q$₹11,700$q$,$q$₹11,979$q$,$q$₹11,900$q$,$q$₹12,100$q$],2,$q$A = 9000(1.10)^3 = 9000×1.331 = ₹11,979.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$₹10,000 is invested at 10% per annum compounded half-yearly. Find the amount after 2 years.$q$,array[$q$₹12,100$q$,$q$₹12,155.06$q$,$q$₹12,000$q$,$q$₹12,210$q$],2,$q$Half-yearly: 5% per period, 4 periods. A = 10000(1.05)^4 = ₹12,155.06.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$Find the compound interest on ₹8,000 for 1½ years at 20% per annum compounded half-yearly.$q$,array[$q$₹2,400$q$,$q$₹2,648$q$,$q$₹2,600$q$,$q$₹2,520$q$],2,$q$10% per half-year, 3 periods. A = 8000(1.10)^3 = 10648; CI = ₹2,648.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$₹16,000 is invested at 20% per annum compounded quarterly. Find the amount after 1 year.$q$,array[$q$₹19,200$q$,$q$₹19,448.10$q$,$q$₹19,600$q$,$q$₹18,432$q$],2,$q$5% per quarter, 4 periods. A = 16000(1.05)^4 = ₹19,448.10.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$A sum amounts to ₹13,230 in 2 years at 5% per annum compound interest. Find the principal.$q$,array[$q$₹11,500$q$,$q$₹12,000$q$,$q$₹12,600$q$,$q$₹12,250$q$],2,$q$P = 13230 / (1.05)^2 = 13230 / 1.1025 = ₹12,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$A certain sum amounts to ₹17,640 in 2 years at 5% per annum compounded annually. Find the sum.$q$,array[$q$₹15,500$q$,$q$₹16,000$q$,$q$₹16,800$q$,$q$₹15,750$q$],2,$q$P = 17640 / (1.05)^2 = 17640 / 1.1025 = ₹16,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$₹15,625 is invested at 8% per annum compounded half-yearly for 1½ years. Find the amount.$q$,array[$q$₹17,000$q$,$q$₹17,576$q$,$q$₹17,496$q$,$q$₹16,900$q$],2,$q$4% per half-year, 3 periods. A = 15625(1.04)^3 = ₹17,576.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$A sum amounts to ₹9,261 in 2 years at 5% per annum compound interest. Find the principal.$q$,array[$q$₹8,000$q$,$q$₹8,400$q$,$q$₹8,800$q$,$q$₹8,100$q$],2,$q$P = 9261 / (1.05)^2 = 9261 / 1.1025 = ₹8,400.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$Find the compound interest on ₹5,000 for 1 year at 10% per annum compounded half-yearly.$q$,array[$q$₹500$q$,$q$₹512.50$q$,$q$₹525$q$,$q$₹550$q$],2,$q$5% per half-year, 2 periods. A = 5000(1.05)^2 = 5512.50; CI = ₹512.50.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$A sum of ₹10,000 is lent at compound interest of 10% in the first year and 12% in the second year. Find the amount after 2 years.$q$,array[$q$₹12,200$q$,$q$₹12,320$q$,$q$₹12,100$q$,$q$₹12,400$q$],2,$q$A = 10000×1.10×1.12 = ₹12,320.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'medium',$q$₹10,000 is invested at 8% per annum compounded quarterly for 9 months. Find the amount.$q$,array[$q$₹10,600$q$,$q$₹10,612.08$q$,$q$₹10,800$q$,$q$₹10,404$q$],2,$q$2% per quarter, 3 periods. A = 10000(1.02)^3 = ₹10,612.08.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$The difference between compound interest and simple interest on a sum for 2 years at 5% per annum is ₹15. Find the sum.$q$,array[$q$₹5,000$q$,$q$₹6,000$q$,$q$₹7,500$q$,$q$₹6,250$q$],2,$q$Diff = P(R/100)^2 = P(0.05)^2 = 0.0025P = 15 ⇒ P = ₹6,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$The difference between the compound and simple interest on a certain sum for 2 years at 4% per annum is ₹96. Find the sum.$q$,array[$q$₹50,000$q$,$q$₹60,000$q$,$q$₹64,000$q$,$q$₹75,000$q$],2,$q$0.0016P = 96 ⇒ P = 96/0.0016 = ₹60,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$The difference between compound interest and simple interest on ₹10,000 for 2 years is ₹25. Find the rate of interest per annum.$q$,array[$q$4%$q$,$q$5%$q$,$q$6%$q$,$q$2.5%$q$],2,$q$10000(R/100)^2 = 25 ⇒ (R/100)^2 = 0.0025 ⇒ R = 5%.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$Find the difference between compound interest and simple interest on ₹8,000 for 3 years at 5% per annum.$q$,array[$q$₹50$q$,$q$₹61$q$,$q$₹63$q$,$q$₹60$q$],2,$q$3-yr diff = P(R/100)^2(3+R/100) = 8000(0.0025)(3.05) = ₹61.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$The difference between compound interest and simple interest on a sum for 3 years at 5% per annum is ₹122. Find the sum.$q$,array[$q$₹15,000$q$,$q$₹16,000$q$,$q$₹18,000$q$,$q$₹16,400$q$],2,$q$Diff = P(0.0025)(3.05) = 0.007625P = 122 ⇒ P = ₹16,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$If the difference between CI and SI on a sum for 2 years at 6% per annum is ₹63, find the sum.$q$,array[$q$₹15,000$q$,$q$₹17,500$q$,$q$₹20,000$q$,$q$₹18,000$q$],2,$q$0.0036P = 63 ⇒ P = 63/0.0036 = ₹17,500.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$Find the difference between compound interest and simple interest on ₹5,000 for 2 years at 10% per annum.$q$,array[$q$₹40$q$,$q$₹50$q$,$q$₹55$q$,$q$₹60$q$],2,$q$Diff = P(R/100)^2 = 5000(0.10)^2 = 5000×0.01 = ₹50.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$Find the compound interest on ₹10,000 for 2½ years at 10% per annum, interest compounded annually.$q$,array[$q$₹2,600$q$,$q$₹2,705$q$,$q$₹2,750$q$,$q$₹2,810$q$],2,$q$A = 10000(1.1)^2(1+0.05) = 12100×1.05 = 12705; CI = ₹2,705.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$The difference between compound and simple interest on a sum for 2 years at 10% per annum is ₹48.40. Find the sum.$q$,array[$q$₹4,000$q$,$q$₹4,840$q$,$q$₹5,000$q$,$q$₹4,400$q$],2,$q$0.01P = 48.40 ⇒ P = ₹4,840.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'hard',$q$Find the compound interest on ₹8,000 for 1½ years at 10% per annum, compounded annually.$q$,array[$q$₹1,200$q$,$q$₹1,240$q$,$q$₹1,280$q$,$q$₹1,320$q$],2,$q$A = 8000(1.1)(1.05) = 8800×1.05 = 9240; CI = ₹1,240.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A sum of money at compound interest amounts to ₹800 in 3 years and ₹840 in 4 years. Find the rate of interest per annum.$q$,array[$q$4%$q$,$q$5%$q$,$q$6%$q$,$q$4.5%$q$],2,$q$Interest for 4th year = 840−800 = 40 on ₹800 ⇒ R = 40/800×100 = 5%.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A sum of money doubles itself in 5 years at compound interest. In how many years will it become four times?$q$,array[$q$8 years$q$,$q$10 years$q$,$q$15 years$q$,$q$20 years$q$],2,$q$4× = (2)^2, so needs 2×5 = 10 years.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A sum doubles itself in 4 years at compound interest. In how many years will it become 8 times?$q$,array[$q$8 years$q$,$q$12 years$q$,$q$16 years$q$,$q$24 years$q$],2,$q$8× = 2^3, so needs 3×4 = 12 years.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A sum of ₹1,640 is borrowed at 5% per annum compound interest and repaid in 2 equal annual installments. Find each installment.$q$,array[$q$₹820$q$,$q$₹861$q$,$q$₹882$q$,$q$₹900$q$],3,$q$P = X/1.05 + X/1.05² ⇒ 1640 = X(0.9524+0.9070) ⇒ X = ₹882.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$The population of a town is 8,000. If it increases at 10% per annum, what will it be after 2 years?$q$,array[$q$9,600$q$,$q$9,680$q$,$q$9,760$q$,$q$9,800$q$],2,$q$Pop = 8000(1.10)^2 = 8000×1.21 = 9,680.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$The population of a town is 10,000 and decreases at 10% per annum. Find the population after 2 years.$q$,array[$q$8,000$q$,$q$8,100$q$,$q$8,200$q$,$q$9,000$q$],2,$q$Pop = 10000(0.90)^2 = 10000×0.81 = 8,100.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$The value of a machine depreciates at 20% per annum. If its present value is ₹62,500, what will it be worth after 2 years?$q$,array[$q$₹37,500$q$,$q$₹40,000$q$,$q$₹45,000$q$,$q$₹50,000$q$],2,$q$Value = 62500(0.80)^2 = 62500×0.64 = ₹40,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A sum of money at compound interest amounts to ₹12,100 in 2 years and ₹13,310 in 3 years. Find the sum.$q$,array[$q$₹9,000$q$,$q$₹10,000$q$,$q$₹11,000$q$,$q$₹9,500$q$],2,$q$R = (13310−12100)/12100×100 = 10%; P = 12100/(1.1)² = ₹10,000.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A loan is repaid in 2 equal annual installments of ₹441 each at 5% per annum compound interest. Find the sum borrowed.$q$,array[$q$₹800$q$,$q$₹820$q$,$q$₹840$q$,$q$₹850$q$],2,$q$P = 441/1.05 + 441/1.05² = 420 + 400 = ₹820.$q$);
select public._seed_arith_q($q$Compound Interest$q$,'very_hard',$q$A sum of money becomes four times itself in 12 years at compound interest. In how many years will it double itself?$q$,array[$q$4 years$q$,$q$6 years$q$,$q$8 years$q$,$q$3 years$q$],2,$q$4× in 12 yr means 2× in half the time (4=2²): 12/2 = 6 years.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
