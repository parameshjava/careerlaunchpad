-- ============================================================================
-- 044_arith_simplification.sql
-- Question-bank seed: Arithmetic chapter "Simplification" -- 38 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- BODMAS/VBODMAS, 'of', approximation, find-the-missing-value.
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

-- Simplification (38 questions)
select public._seed_arith_q($q$Simplification$q$,'easy',$q$Simplify: 12 + 6 ÷ 2 × 3 − 4 = ?$q$,array[$q$15$q$,$q$17$q$,$q$19$q$,$q$21$q$],2,$q$BODMAS: division/multiplication first, left to right. 6÷2=3; 3×3=9. Then 12+9−4 = 17.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$5004 ÷ 139 − 6 = ?$q$,array[$q$24$q$,$q$30$q$,$q$32$q$,$q$36$q$],2,$q$5004 ÷ 139 = 36. Then 36 − 6 = 30.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$3/4 of 480 + 120 = ?$q$,array[$q$360$q$,$q$420$q$,$q$480$q$,$q$540$q$],3,$q$'of' means multiply: 3/4 × 480 = 360. Then 360 + 120 = 480.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$84 ÷ 6 + 15 × 4 − 9 = ?$q$,array[$q$55$q$,$q$60$q$,$q$65$q$,$q$70$q$],3,$q$BODMAS: 84÷6=14; 15×4=60. Then 14 + 60 − 9 = 65.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$15% of 640 + 12% of 350 = ?$q$,array[$q$128$q$,$q$132$q$,$q$138$q$,$q$144$q$],3,$q$15% of 640 = 96; 12% of 350 = 42. Sum = 96 + 42 = 138.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$45 × 8 ÷ 12 + 18 − 7 = ?$q$,array[$q$36$q$,$q$41$q$,$q$45$q$,$q$48$q$],2,$q$Left to right: 45×8=360; 360÷12=30. Then 30 + 18 − 7 = 41.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$(36 + 24) ÷ 5 × 7 = ?$q$,array[$q$72$q$,$q$84$q$,$q$90$q$,$q$96$q$],2,$q$Bracket first: 36+24=60. Then 60÷5=12; 12×7 = 84.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$720 ÷ 15 + 240 ÷ 8 = ?$q$,array[$q$72$q$,$q$78$q$,$q$84$q$,$q$90$q$],2,$q$720÷15=48; 240÷8=30. Sum = 48 + 30 = 78.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$2/5 of 350 + 3/7 of 210 = ?$q$,array[$q$210$q$,$q$220$q$,$q$230$q$,$q$240$q$],3,$q$2/5 × 350 = 140; 3/7 × 210 = 90. Sum = 140 + 90 = 230.$q$);
select public._seed_arith_q($q$Simplification$q$,'easy',$q$63.5 + 14.25 − 8.75 = ?$q$,array[$q$67.0$q$,$q$68.0$q$,$q$69.0$q$,$q$70.0$q$],3,$q$Decimal addition/subtraction left to right: 63.5 + 14.25 = 77.75; 77.75 − 8.75 = 69.0.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$Find the missing value: 25% of 480 + ? = 200$q$,array[$q$60$q$,$q$72$q$,$q$80$q$,$q$88$q$],3,$q$25% of 480 = 120. So ? = 200 − 120 = 80.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$[ (18 + 12) × 4 − 20 ] ÷ 5 = ?$q$,array[$q$16$q$,$q$18$q$,$q$20$q$,$q$24$q$],3,$q$Inner bracket: 18+12=30; 30×4=120; 120−20=100. Then 100÷5 = 20.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$3/4 of 480 + 2/5 of 350 = ?$q$,array[$q$480$q$,$q$500$q$,$q$520$q$,$q$540$q$],2,$q$3/4 × 480 = 360; 2/5 × 350 = 140. Sum = 360 + 140 = 500.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$40% of 650 − 25% of 480 + 60 = ?$q$,array[$q$180$q$,$q$190$q$,$q$200$q$,$q$210$q$],3,$q$40% of 650 = 260; 25% of 480 = 120. Then 260 − 120 + 60 = 200.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$6¾ + 2½ − 3¼ = ?$q$,array[$q$5$q$,$q$6$q$,$q$7$q$,$q$8$q$],2,$q$Convert: 27/4 + 5/2 − 13/4. LCD 4: 27/4 + 10/4 − 13/4 = 24/4 = 6.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$15 × [ (48 ÷ 6) + 2 ] − 40 = ?$q$,array[$q$100$q$,$q$110$q$,$q$120$q$,$q$130$q$],2,$q$Inner: 48÷6=8; 8+2=10. Then 15×10=150; 150−40 = 110.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$5/8 of 960 ÷ 3 + 40 = ?$q$,array[$q$220$q$,$q$240$q$,$q$260$q$,$q$280$q$],2,$q$5/8 × 960 = 600. Then 600 ÷ 3 = 200; 200 + 40 = 240.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$3/5 of 40% of 1500 = ?$q$,array[$q$300$q$,$q$330$q$,$q$360$q$,$q$390$q$],3,$q$40% of 1500 = 600. Then 3/5 × 600 = 360.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$18 + 24 ÷ (6 − 2) × 5 = ?$q$,array[$q$42$q$,$q$45$q$,$q$48$q$,$q$54$q$],3,$q$Bracket: 6−2=4. Then 24÷4=6; 6×5=30. Finally 18 + 30 = 48.$q$);
select public._seed_arith_q($q$Simplification$q$,'medium',$q$(2/3 + 3/4) of 720 = ?$q$,array[$q$960$q$,$q$1020$q$,$q$1080$q$,$q$1140$q$],2,$q$2/3 + 3/4 = 8/12 + 9/12 = 17/12. Then 17/12 × 720 = 17 × 60 = 1020.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$What approximate value should come in place of (?): 24.97% of 800.1 + 14.98 × 5.02 = ?$q$,array[$q$255$q$,$q$275$q$,$q$295$q$,$q$315$q$],2,$q$Round: 25% of 800 = 200; 15 × 5 = 75. Sum ≈ 200 + 75 = 275.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$√1024 ÷ 4 + 15² = ?$q$,array[$q$225$q$,$q$229$q$,$q$233$q$,$q$237$q$],3,$q$√1024 = 32; 32 ÷ 4 = 8. 15² = 225. Then 8 + 225 = 233.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$What approximate value should come in place of (?): √624.9 + √288.8 = ?$q$,array[$q$38$q$,$q$42$q$,$q$46$q$,$q$50$q$],2,$q$√624.9 ≈ √625 = 25; √288.8 ≈ √289 = 17. Sum ≈ 25 + 17 = 42.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$Find the missing value: 45% of 1240 − ? = 18²$q$,array[$q$214$q$,$q$224$q$,$q$234$q$,$q$244$q$],3,$q$45% of 1240 = 558; 18² = 324. So ? = 558 − 324 = 234.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$What approximate value should come in place of (?): 4499 ÷ 15.02 × 2.98 = ?$q$,array[$q$800$q$,$q$900$q$,$q$1000$q$,$q$1100$q$],2,$q$Round: 4500 ÷ 15 = 300; 300 × 3 = 900.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$12² + 13² − 11² = ?$q$,array[$q$182$q$,$q$192$q$,$q$202$q$,$q$212$q$],2,$q$144 + 169 − 121. 144+169 = 313; 313 − 121 = 192.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$What approximate value should come in place of (?): 39.9% of 449.8 + ∛1727 = ?$q$,array[$q$182$q$,$q$192$q$,$q$202$q$,$q$212$q$],2,$q$40% of 450 = 180; ∛1728 = 12. Sum ≈ 180 + 12 = 192.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$(√729 × √196) ÷ 6 = ?$q$,array[$q$56$q$,$q$63$q$,$q$70$q$,$q$77$q$],2,$q$√729 = 27; √196 = 14. 27 × 14 = 378. Then 378 ÷ 6 = 63.$q$);
select public._seed_arith_q($q$Simplification$q$,'hard',$q$What approximate value should come in place of (?): 17.02 × 24.98 − 899.7 ÷ 29.9 = ?$q$,array[$q$375$q$,$q$395$q$,$q$415$q$,$q$435$q$],2,$q$Round: 17 × 25 = 425; 900 ÷ 30 = 30. Then 425 − 30 = 395.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$3½ of (2/7 of 84) + 5² = ?$q$,array[$q$99$q$,$q$109$q$,$q$119$q$,$q$129$q$],2,$q$Inner: 2/7 × 84 = 24. Then 3½ = 7/2; 7/2 × 24 = 84. 5² = 25. Total = 84 + 25 = 109.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$√1296 + ∛2744 − 14² ÷ 7 = ?$q$,array[$q$18$q$,$q$22$q$,$q$26$q$,$q$30$q$],2,$q$√1296 = 36; ∛2744 = 14; 14² ÷ 7 = 196 ÷ 7 = 28. Then 36 + 14 − 28 = 22.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$[ (5/6 − 1/3) ÷ ½ ] × 720 = ?$q$,array[$q$600$q$,$q$660$q$,$q$720$q$,$q$780$q$],3,$q$5/6 − 1/3 = 5/6 − 2/6 = 3/6 = 1/2. Then (1/2) ÷ (1/2) = 1. Finally 1 × 720 = 720.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$What approximate value should come in place of (?): (15.02)² + √1599 − 63.9% of 300 = ?$q$,array[$q$63$q$,$q$73$q$,$q$83$q$,$q$93$q$],2,$q$15² = 225; √1600 = 40; 64% of 300 = 192. Then 225 + 40 − 192 = 73.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$2/3 of 5/8 of 40% of 1800 = ?$q$,array[$q$270$q$,$q$300$q$,$q$330$q$,$q$360$q$],2,$q$40% of 1800 = 720. 5/8 × 720 = 450. 2/3 × 450 = 300.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$84 ÷ 4 × 3 + 6² − √225 + 7 = ?$q$,array[$q$81$q$,$q$86$q$,$q$91$q$,$q$96$q$],3,$q$84÷4=21; 21×3=63. 6²=36; √225=15. Then 63 + 36 − 15 + 7 = 91.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$(7/9 + 5/12) of 108 − 2³ = ?$q$,array[$q$111$q$,$q$121$q$,$q$131$q$,$q$141$q$],2,$q$7/9 + 5/12: LCD 36 → 28/36 + 15/36 = 43/36. 43/36 × 108 = 43 × 3 = 129. 2³ = 8. Then 129 − 8 = 121.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$What approximate value should come in place of (?): 63.96% of 1250 + ∛4096 − 24.98% of 800 = ?$q$,array[$q$596$q$,$q$616$q$,$q$636$q$,$q$656$q$],2,$q$64% of 1250 = 800; ∛4096 = 16; 25% of 800 = 200. Then 800 + 16 − 200 = 616.$q$);
select public._seed_arith_q($q$Simplification$q$,'very_hard',$q$√6.25 × 12 + (3/4 of 48) ÷ 2 = ?$q$,array[$q$42$q$,$q$48$q$,$q$54$q$,$q$60$q$],2,$q$√6.25 = 2.5; 2.5 × 12 = 30. 3/4 × 48 = 36; 36 ÷ 2 = 18. Then 30 + 18 = 48.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
