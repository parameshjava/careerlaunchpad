-- ============================================================================
-- 045_arith_square_cube_roots.sql
-- Question-bank seed: Arithmetic chapter "Square Roots and Cube Roots" -- 40 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Perfect/decimal roots, compound & nested radicals, surd rationalisation.
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

-- Square Roots and Cube Roots (40 questions)
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$√4096 = ?$q$,array[$q$46$q$,$q$54$q$,$q$64$q$,$q$74$q$],3,$q$4096 = 64 × 64, since 64² = 4096. So √4096 = 64.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$The cube root of 2744 is:$q$,array[$q$12$q$,$q$14$q$,$q$16$q$,$q$18$q$],2,$q$2744 = 2³ × 7³ = 14³ (14×14×14 = 2744). So ∛2744 = 14.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$√0.0081 = ?$q$,array[$q$0.009$q$,$q$0.03$q$,$q$0.09$q$,$q$0.9$q$],3,$q$0.0081 = 81/10000. √81 = 9, √10000 = 100, so √0.0081 = 9/100 = 0.09.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$∛0.000729 = ?$q$,array[$q$0.0009$q$,$q$0.009$q$,$q$0.09$q$,$q$0.9$q$],3,$q$0.000729 = 729/10^6. ∛729 = 9, ∛10^6 = 100, so ∛0.000729 = 9/100 = 0.09.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$√5329 = ?$q$,array[$q$63$q$,$q$67$q$,$q$73$q$,$q$77$q$],3,$q$73² = 5329 (70²=4900, plus 2·70·3+9 = 429, total 5329). So √5329 = 73.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$∛13824 = ?$q$,array[$q$22$q$,$q$24$q$,$q$26$q$,$q$28$q$],2,$q$13824 = 2^9 × 27 = 24³ (24×24×24 = 13824). So ∛13824 = 24.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$√7396 = ?$q$,array[$q$84$q$,$q$86$q$,$q$88$q$,$q$92$q$],2,$q$86² = 7396 (80²=6400, 2·80·6=960, 6²=36; 6400+960+36 = 7396). So √7396 = 86.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$√1.44 = ?$q$,array[$q$0.12$q$,$q$1.02$q$,$q$1.2$q$,$q$1.4$q$],3,$q$1.44 = 144/100. √144 = 12, √100 = 10, so √1.44 = 12/10 = 1.2.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$∛0.216 = ?$q$,array[$q$0.06$q$,$q$0.6$q$,$q$0.36$q$,$q$6$q$],2,$q$0.216 = 216/1000. ∛216 = 6, ∛1000 = 10, so ∛0.216 = 6/10 = 0.6.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'easy',$q$√9604 = ?$q$,array[$q$92$q$,$q$96$q$,$q$98$q$,$q$102$q$],3,$q$98² = 9604 (100²=10000, minus 2·100·2−4 = 396, 10000−396 = 9604). So √9604 = 98.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$If √1521 = 39, then the value of √15.21 + √0.1521 + √0.001521 is:$q$,array[$q$4.329$q$,$q$4.29$q$,$q$3.939$q$,$q$4.43$q$],1,$q$√1521=39 ⇒ √15.21=3.9, √0.1521=0.39, √0.001521=0.039. Sum = 3.9+0.39+0.039 = 4.329.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√(0.081 × 0.324 × 4.624 ÷ (1.5625 × 0.0289 × 72.9 × 64)) = ?$q$,array[$q$0.024$q$,$q$0.24$q$,$q$0.0024$q$,$q$2.4$q$],1,$q$Numerator = 0.081×0.324×4.624 = 0.121; denominator = 1.5625×0.0289×72.9×64 = 210.9. Ratio = 0.000576; √0.000576 = 0.024.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√(6.25 ÷ 0.0025) = ?$q$,array[$q$25$q$,$q$50$q$,$q$250$q$,$q$5$q$],2,$q$6.25 ÷ 0.0025 = 2500. √2500 = 50.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√(3 + 1/16) = ?$q$,array[$q$1.25$q$,$q$1.5$q$,$q$1.75$q$,$q$2.25$q$],3,$q$3 + 1/16 = 49/16. √(49/16) = 7/4 = 1.75.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√1.5625 = ?$q$,array[$q$1.05$q$,$q$1.25$q$,$q$1.45$q$,$q$1.55$q$],2,$q$By long division / factoring: 1.25² = 1.5625. So √1.5625 = 1.25.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√(1 − 9/25) = ?$q$,array[$q$0.6$q$,$q$0.7$q$,$q$0.8$q$,$q$0.9$q$],3,$q$1 − 9/25 = 16/25. √(16/25) = 4/5 = 0.8.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$∛0.001728 = ?$q$,array[$q$0.012$q$,$q$0.12$q$,$q$1.2$q$,$q$0.0012$q$],2,$q$0.001728 = 1728/10^6. ∛1728 = 12, ∛10^6 = 100, so ∛0.001728 = 12/100 = 0.12.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√2809 = ?$q$,array[$q$51$q$,$q$53$q$,$q$57$q$,$q$59$q$],2,$q$53² = 2809 (50²=2500, 2·50·3=300, 3²=9; 2500+300+9 = 2809). So √2809 = 53.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'medium',$q$√2.25 + √0.25 = ?$q$,array[$q$1.5$q$,$q$2.0$q$,$q$2.5$q$,$q$1.75$q$],2,$q$√2.25 = 1.5 and √0.25 = 0.5. Sum = 1.5 + 0.5 = 2.0.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√(176 + √2401) = ?$q$,array[$q$12$q$,$q$13$q$,$q$15$q$,$q$17$q$],3,$q$√2401 = 49 (49²=2401). Then 176 + 49 = 225, and √225 = 15.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√4096 + √40.96 + √0.4096 + √0.004096 = ?$q$,array[$q$70.4$q$,$q$71.104$q$,$q$64.71$q$,$q$72.16$q$],2,$q$√4096 = 64, √40.96 = 6.4, √0.4096 = 0.64, √0.004096 = 0.064. Sum = 64 + 6.4 + 0.64 + 0.064 = 71.104.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$If 3√5 + √125 = 17.88, then the value of √80 + 6√5 is:$q$,array[$q$13.41$q$,$q$20.46$q$,$q$22.35$q$,$q$21.66$q$],3,$q$√125 = 5√5, so 3√5+5√5 = 8√5 = 17.88 ⇒ √5 = 2.235. √80 = 4√5, so √80+6√5 = 4√5+6√5 = 10√5 = 22.35.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√(3 − 2√2) = ?$q$,array[$q$√2 − 1$q$,$q$√2 + 1$q$,$q$2 − √2$q$,$q$√3 − 1$q$],1,$q$3 − 2√2 = (√2)² − 2·√2·1 + 1² = (√2 − 1)². Since √2 > 1, √(3−2√2) = √2 − 1.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√(41 − √(21 + √(19 − √9))) = ?$q$,array[$q$5$q$,$q$6$q$,$q$7$q$,$q$8$q$],2,$q$√9=3; 19−3=16, √16=4; 21+4=25, √25=5; 41−5=36, √36=6.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√(248 + √(51 + √169)) = ?$q$,array[$q$14$q$,$q$16$q$,$q$18$q$,$q$12$q$],2,$q$√169=13; 51+13=64, √64=8; 248+8=256, √256=16.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$∛0.000343 = ?$q$,array[$q$0.007$q$,$q$0.07$q$,$q$0.7$q$,$q$0.0007$q$],2,$q$0.000343 = 343/10^6. ∛343 = 7, ∛10^6 = 100, so ∛0.000343 = 7/100 = 0.07.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√((0.75)³/(1 − 0.75) + [0.75 + (0.75)² + 1]) = ?$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$0.75$q$],2,$q$(0.75)³/(0.25) = 0.421875/0.25 = 1.6875; bracket = 0.75+0.5625+1 = 2.3125; sum = 1.6875+2.3125 = 4; √4 = 2. (Standard identity a³/(1−a)+a+a²+1 simplifies to 4 at a=0.75.)$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√(6 + √(1 + √64)) = ?$q$,array[$q$2$q$,$q$3$q$,$q$4$q$,$q$5$q$],2,$q$√64 = 8; 1+8 = 9, √9 = 3; 6+3 = 9, √9 = 3.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'hard',$q$√24336 = ?$q$,array[$q$146$q$,$q$152$q$,$q$156$q$,$q$164$q$],3,$q$156² = 24336 (150²=22500, 2·150·6=1800, 6²=36; 22500+1800+36 = 24336). So √24336 = 156.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(6 + √(6 + √(6 + …))) (infinitely repeated) = ?$q$,array[$q$2$q$,$q$3$q$,$q$4$q$,$q$6$q$],2,$q$Let x = √(6+x). Then x² = 6+x ⇒ x²−x−6 = 0 ⇒ (x−3)(x+2)=0. Taking the positive root, x = 3.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(12 + √(12 + √(12 + …))) (infinitely repeated) = ?$q$,array[$q$3$q$,$q$4$q$,$q$5$q$,$q$6$q$],2,$q$Let x = √(12+x). Then x²−x−12 = 0 ⇒ (x−4)(x+3)=0. Positive root x = 4.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(20 + √(20 + √(20 + …))) (infinitely repeated) = ?$q$,array[$q$4$q$,$q$5$q$,$q$6$q$,$q$10$q$],2,$q$Let x = √(20+x). Then x²−x−20 = 0 ⇒ (x−5)(x+4)=0. Positive root x = 5.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(6 − √(6 − √(6 − …))) (infinitely repeated) = ?$q$,array[$q$2$q$,$q$3$q$,$q$−3$q$,$q$√6$q$],1,$q$Let x = √(6−x), x>0. Then x² = 6−x ⇒ x²+x−6 = 0 ⇒ (x+3)(x−2)=0. Positive root x = 2.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(12 − √(12 − √(12 − …))) (infinitely repeated) = ?$q$,array[$q$3$q$,$q$4$q$,$q$−4$q$,$q$√12$q$],1,$q$Let x = √(12−x), x>0. Then x²+x−12 = 0 ⇒ (x+4)(x−3)=0. Positive root x = 3.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(30 + √(30 + √(30 + …))) (infinitely repeated) = ?$q$,array[$q$5$q$,$q$6$q$,$q$7$q$,$q$15$q$],2,$q$Let x = √(30+x). Then x²−x−30 = 0 ⇒ (x−6)(x+5)=0. Positive root x = 6.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$Rationalise: 1 / (√3 − √2) = ?$q$,array[$q$√3 − √2$q$,$q$√3 + √2$q$,$q$√6$q$,$q$(√3+√2)/5$q$],2,$q$Multiply numerator and denominator by (√3+√2): 1·(√3+√2) / ((√3)²−(√2)²) = (√3+√2)/(3−2) = √3+√2.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$Value of (√5 + √3) / (√5 − √3) = ?$q$,array[$q$4 + √15$q$,$q$4 − √15$q$,$q$4 + 2√15$q$,$q$2 + √15$q$],1,$q$Multiply top and bottom by (√5+√3): (√5+√3)² / (5−3) = (5+3+2√15)/2 = (8+2√15)/2 = 4 + √15.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(7 + 4√3) = ?$q$,array[$q$1 + √3$q$,$q$2 + √3$q$,$q$2 + 2√3$q$,$q$√3 + √7$q$],2,$q$7 + 4√3 = 4 + 4√3 + 3 = (2)² + 2·2·√3 + (√3)² = (2 + √3)². So √(7+4√3) = 2 + √3.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$√(56 + √(56 + √(56 + …))) (infinitely repeated) = ?$q$,array[$q$7$q$,$q$8$q$,$q$9$q$,$q$14$q$],2,$q$Let x = √(56+x). Then x²−x−56 = 0 ⇒ (x−8)(x+7)=0. Positive root x = 8.$q$);
select public._seed_arith_q($q$Square Roots and Cube Roots$q$,'very_hard',$q$Estimate ∛175616 = ?$q$,array[$q$54$q$,$q$56$q$,$q$58$q$,$q$64$q$],2,$q$Unit digit 6 ⇒ cube root ends in 6. 175 lies between 5³=125 and 6³=216, so tens digit is 5. Thus ∛175616 = 56 (check: 56³ = 175616).$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
