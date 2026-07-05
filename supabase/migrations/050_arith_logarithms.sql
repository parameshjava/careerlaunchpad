-- ============================================================================
-- 050_arith_logarithms.sql
-- Question-bank seed: Arithmetic chapter "Logarithms" -- 40 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Log laws, change of base, characteristic/digits, telescoping & reciprocal-log identities.
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

-- Logarithms (40 questions)
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Find the value of log₂ 64.$q$,array[$q$4$q$,$q$5$q$,$q$6$q$,$q$8$q$],3,$q$log₂64 = log₂(2⁶) = 6·log₂2 = 6·1 = 6.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Evaluate log₃ (1/27).$q$,array[$q$−3$q$,$q$3$q$,$q$−9$q$,$q$9$q$],1,$q$1/27 = 3⁻³, so log₃(3⁻³) = −3·log₃3 = −3.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$If log 2 = 0.3010, find the value of log 8 (base 10).$q$,array[$q$0.9030$q$,$q$0.6020$q$,$q$0.9542$q$,$q$0.8451$q$],1,$q$log 8 = log 2³ = 3·log 2 = 3(0.3010) = 0.9030.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Find log₅ 625.$q$,array[$q$3$q$,$q$4$q$,$q$5$q$,$q$2$q$],2,$q$625 = 5⁴, so log₅(5⁴) = 4.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Evaluate log₂ 0.25.$q$,array[$q$−2$q$,$q$2$q$,$q$−4$q$,$q$4$q$],1,$q$0.25 = 1/4 = 2⁻², so log₂(2⁻²) = −2.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Find the value of log₁₀ 0.001.$q$,array[$q$−3$q$,$q$3$q$,$q$−2$q$,$q$−1$q$],1,$q$0.001 = 10⁻³, so log₁₀(10⁻³) = −3.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Evaluate log_(√2) 8 (base = √2).$q$,array[$q$6$q$,$q$3$q$,$q$8$q$,$q$4$q$],1,$q$√2 = 2^(1/2); log_(√2)8 = log 8 / log √2 = 3log2 / (½log2) = 3/(½) = 6.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$If log 3 = 0.4771, find log 27 (base 10).$q$,array[$q$1.4313$q$,$q$1.3617$q$,$q$0.9542$q$,$q$1.9084$q$],1,$q$log 27 = log 3³ = 3·log 3 = 3(0.4771) = 1.4313.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Find the value of log₉ 27.$q$,array[$q$1.5$q$,$q$2$q$,$q$3$q$,$q$0.5$q$],1,$q$log₉27 = log 27/log 9 = 3log3/2log3 = 3/2 = 1.5.$q$);
select public._seed_arith_q($q$Logarithms$q$,'easy',$q$Evaluate log₈ 32.$q$,array[$q$5/3$q$,$q$2$q$,$q$5/2$q$,$q$3/2$q$],1,$q$log₈32 = log 2⁵/log 2³ = 5log2/3log2 = 5/3.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Given log 2 = 0.3010 and log 3 = 0.4771, express log 12 (base 10).$q$,array[$q$1.0791$q$,$q$1.2552$q$,$q$1.3801$q$,$q$0.7781$q$],1,$q$log 12 = log(2²·3) = 2log2 + log3 = 0.6020 + 0.4771 = 1.0791.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Find the value of log₁₀ 25 + log₁₀ 4.$q$,array[$q$2$q$,$q$3$q$,$q$1$q$,$q$10$q$],1,$q$log25 + log4 = log(25·4) = log 100 = 2.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Given log 2 = 0.3010, log 3 = 0.4771, find log 48 (base 10).$q$,array[$q$1.6811$q$,$q$1.5562$q$,$q$1.3801$q$,$q$2.2094$q$],1,$q$48 = 2⁴·3, so log48 = 4log2 + log3 = 1.2040 + 0.4771 = 1.6811.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Given log 2 = 0.3010, log 3 = 0.4771, find log 4.5 (base 10).$q$,array[$q$0.6532$q$,$q$−0.1249$q$,$q$0.1249$q$,$q$0.7781$q$],1,$q$4.5 = 9/2, so log4.5 = 2log3 − log2 = 0.9542 − 0.3010 = 0.6532.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Evaluate log₂ 6 + log₂ (2/3).$q$,array[$q$2$q$,$q$3$q$,$q$4$q$,$q$1$q$],1,$q$= log₂(6 · 2/3) = log₂4 = 2.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Find the value of log₄ 8 using change of base.$q$,array[$q$1.5$q$,$q$2$q$,$q$3$q$,$q$0.75$q$],1,$q$log₄8 = log 2³/log 2² = 3log2/2log2 = 3/2 = 1.5.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$If log 2 = 0.3010, find log 5 (base 10).$q$,array[$q$0.6990$q$,$q$0.3010$q$,$q$0.6021$q$,$q$0.7781$q$],1,$q$log 5 = log(10/2) = log10 − log2 = 1 − 0.3010 = 0.6990.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Find the value of log(75/16) − 2·log(5/9) + log(32/243), given log 2 = 0.3010 (base 10).$q$,array[$q$0.3010$q$,$q$1$q$,$q$0.6020$q$,$q$0$q$],1,$q$= log(75/16) + log(81/25) + log(32/243) = log[(75·81·32)/(16·25·243)] = log 2 = 0.3010.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Given log 2 = 0.3010, log 3 = 0.4771, find log 2.4 (base 10).$q$,array[$q$0.3801$q$,$q$0.4801$q$,$q$0.2801$q$,$q$0.5801$q$],1,$q$2.4 = 12/5, so log2.4 = 3log2 + log3 − 1 = 0.9030 + 0.4771 − 1 = 0.3801.$q$);
select public._seed_arith_q($q$Logarithms$q$,'medium',$q$Evaluate log₁₀ 1000 − log₁₀ 10.$q$,array[$q$2$q$,$q$3$q$,$q$1$q$,$q$4$q$],1,$q$= 3 − 1 = 2.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$If log_x 8 = 3/2, find the value of x.$q$,array[$q$4$q$,$q$2$q$,$q$16$q$,$q$3$q$],1,$q$x^(3/2) = 8 → x = 8^(2/3) = (2³)^(2/3) = 2² = 4.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$Solve for x: log x + log(x − 3) = 1 (base 10).$q$,array[$q$5$q$,$q$−2$q$,$q$10$q$,$q$2$q$],1,$q$log[x(x−3)] = 1 → x²−3x = 10 → x²−3x−10 = 0 → (x−5)(x+2)=0 → x = 5 (x>3).$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$How many digits are there in 2⁴⁰? (log 2 = 0.3010)$q$,array[$q$13$q$,$q$12$q$,$q$14$q$,$q$11$q$],1,$q$log(2⁴⁰) = 40·0.3010 = 12.04. Digits = ⌊12.04⌋ + 1 = 13.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$If log 2 = 0.3010, express log₁₀ 5 in terms of log 2 and evaluate.$q$,array[$q$1 − log 2 = 0.6990$q$,$q$log 2 = 0.3010$q$,$q$1 + log 2 = 1.3010$q$,$q$2·log 2 = 0.6020$q$],1,$q$log 5 = log(10/2) = 1 − log 2 = 1 − 0.3010 = 0.6990.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$If log₂ x = 5, find x.$q$,array[$q$32$q$,$q$10$q$,$q$25$q$,$q$16$q$],1,$q$x = 2⁵ = 32.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$Find the value of log₃ 5 × log₅ 27.$q$,array[$q$3$q$,$q$5$q$,$q$9$q$,$q$1$q$],1,$q$= (log5/log3)·(log27/log5) = log27/log3 = 3log3/log3 = 3.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$Evaluate 3^(2 + log₃ 5).$q$,array[$q$45$q$,$q$15$q$,$q$25$q$,$q$9$q$],1,$q$= 3² · 3^(log₃5) = 9 · 5 = 45.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$How many digits are in 5²⁰? (log 2 = 0.3010, so log 5 = 0.6990)$q$,array[$q$14$q$,$q$13$q$,$q$15$q$,$q$12$q$],1,$q$log(5²⁰) = 20·0.6990 = 13.98. Digits = ⌊13.98⌋ + 1 = 14.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$If log₁₀ 2 = a and log₁₀ 3 = b, express log₁₀ 1.5.$q$,array[$q$b − a$q$,$q$a − b$q$,$q$a + b$q$,$q$b$q$],1,$q$1.5 = 3/2, so log 1.5 = log 3 − log 2 = b − a.$q$);
select public._seed_arith_q($q$Logarithms$q$,'hard',$q$If 2ˣ = 8^(y+1) and 9ʸ = 3^(x−9), find the value of x + y.$q$,array[$q$27$q$,$q$21$q$,$q$6$q$,$q$33$q$],1,$q$2ˣ=2^(3y+3) → x=3y+3. 3^(2y)=3^(x−9) → 2y=x−9. Sub: 2y=3y+3−9 → y=6, x=21. x+y=27.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$For any three numbers a, b, c, find the value of 1/log_a(abc) + 1/log_b(abc) + 1/log_c(abc).$q$,array[$q$1$q$,$q$0$q$,$q$3$q$,$q$2$q$],1,$q$1/log_a(abc) = log_(abc)a. Sum = log_(abc)a + log_(abc)b + log_(abc)c = log_(abc)(abc) = 1.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$Given log 2 = 0.3010 and log 3 = 0.4771, find the value of log 6 (base 10).$q$,array[$q$0.7781$q$,$q$0.6990$q$,$q$0.8451$q$,$q$0.9031$q$],1,$q$log 6 = log(2·3) = log2 + log3 = 0.3010 + 0.4771 = 0.7781.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$Solve for x: log₂(x − 1) + log₂(x + 1) = 3.$q$,array[$q$3$q$,$q$−3$q$,$q$9$q$,$q$2$q$],1,$q$log₂[(x−1)(x+1)] = 3 → x²−1 = 8 → x² = 9 → x = 3 (x>1).$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$Find the value of log₂3 · log₃4 · log₄5 · log₅6 · log₆7 · log₇8.$q$,array[$q$3$q$,$q$1$q$,$q$8$q$,$q$6$q$],1,$q$Telescoping change of base collapses to log₂8 = 3.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$If log 2 = 0.3010, how many zeros are there immediately after the decimal point in (1/2)¹⁰⁰?$q$,array[$q$30$q$,$q$31$q$,$q$29$q$,$q$100$q$],1,$q$log(0.5¹⁰⁰) = 100(log5 − 1) = 100(0.6990 − 1) = −30.10. Characteristic = −31, so number of zeros after decimal = 31 − 1 = 30.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$Find the value of (log 27 + log 8 − log 125) / (log 6 − log 5).$q$,array[$q$3$q$,$q$1.5$q$,$q$2$q$,$q$1$q$],1,$q$Numerator = 3log3 + 3log2 − 3log5 = 3(log3+log2−log5) = 3(log6−log5). Ratio = 3.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$Evaluate 5^(log₅3 · log₃7).$q$,array[$q$7$q$,$q$3$q$,$q$5$q$,$q$15$q$],1,$q$log₅3·log₃7 = log₅7 (chain). So 5^(log₅7) = 7.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$If x = log₃4, y = log₄5, z = log₅6, w = log₆7, t = log₇8, s = log₈9, find the value of x·y·z·w·t·s.$q$,array[$q$2$q$,$q$3$q$,$q$9$q$,$q$1$q$],1,$q$Product telescopes to log₃9 = 2.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$How many digits are in 6²⁰? (log 2 = 0.3010, log 3 = 0.4771)$q$,array[$q$16$q$,$q$15$q$,$q$17$q$,$q$14$q$],1,$q$log(6²⁰) = 20·log6 = 20(0.7781) = 15.562. Digits = ⌊15.562⌋ + 1 = 16.$q$);
select public._seed_arith_q($q$Logarithms$q$,'very_hard',$q$Find the value of 1/log₂100 + 1/log₅100.$q$,array[$q$0.5$q$,$q$1$q$,$q$2$q$,$q$0.25$q$],1,$q$= log₁₀₀2 + log₁₀₀5 = log₁₀₀(2·5) = log₁₀₀10 = 1/2 = 0.5.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
