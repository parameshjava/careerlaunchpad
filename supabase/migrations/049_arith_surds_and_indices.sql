-- ============================================================================
-- 049_arith_surds_and_indices.sql
-- Question-bank seed: Arithmetic chapter "Surds and Indices" -- 39 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Laws of indices, exponent equations, surd rationalisation, cyclic-index identities.
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

-- Surds and Indices (39 questions)
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$Simplify: (2^5 × 2^3) ÷ 2^6$q$,array[$q$2$q$,$q$4$q$,$q$8$q$,$q$16$q$],2,$q$a^m×a^n=a^(m+n); a^m÷a^n=a^(m−n). Numerator=2^(5+3)=2^8. Then 2^8÷2^6=2^(8−6)=2^2=4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$The value of (27)^(2/3) is:$q$,array[$q$6$q$,$q$9$q$,$q$18$q$,$q$27$q$],2,$q$27=3^3, so (3^3)^(2/3)=3^(3×2/3)=3^2=9.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$The value of (0.0016)^(1/4) is:$q$,array[$q$0.02$q$,$q$0.2$q$,$q$0.4$q$,$q$0.04$q$],2,$q$0.0016=16/10000=(2/10)^4. So (0.0016)^(1/4)=2/10=0.2.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$Evaluate: ((5^2)^3) ÷ 5^4$q$,array[$q$25$q$,$q$125$q$,$q$5$q$,$q$625$q$],1,$q$(a^m)^n=a^(mn): (5^2)^3=5^6. Then 5^6÷5^4=5^(6−4)=5^2=25.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$The value of (0.04)^(−3/2) is:$q$,array[$q$25$q$,$q$125$q$,$q$625$q$,$q$0.008$q$],2,$q$0.04=4/100=1/25=5^(−2). So (5^(−2))^(−3/2)=5^3=125.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$Find the value of (256)^0.16 × (256)^0.09$q$,array[$q$2$q$,$q$4$q$,$q$16$q$,$q$256$q$],2,$q$a^m×a^n=a^(m+n): (256)^(0.16+0.09)=(256)^0.25=(256)^(1/4). 256=4^4, so =4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$The value of (243)^(2/5) is:$q$,array[$q$3$q$,$q$6$q$,$q$9$q$,$q$27$q$],3,$q$243=3^5, so (3^5)^(2/5)=3^(5×2/5)=3^2=9.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$The value of (32/243)^(−4/5) is:$q$,array[$q$16/81$q$,$q$81/16$q$,$q$4/9$q$,$q$243/32$q$],2,$q$Negative index flips: (243/32)^(4/5). 243=3^5,32=2^5 ⇒ (3/2)^5, raised to 4/5 = (3/2)^4=81/16.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$The value of √(0.0064) is:$q$,array[$q$0.8$q$,$q$0.08$q$,$q$0.008$q$,$q$0.04$q$],2,$q$0.0064=64/10000=(8/100)^2. So √0.0064=8/100=0.08.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'easy',$q$Simplify: 3^2.7 × 3^0.3$q$,array[$q$9$q$,$q$27$q$,$q$81$q$,$q$3$q$],2,$q$a^m×a^n=a^(m+n): 3^(2.7+0.3)=3^3=27.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 3^x = 81, then the value of x is:$q$,array[$q$2$q$,$q$3$q$,$q$4$q$,$q$5$q$],3,$q$81=3^4, so 3^x=3^4 ⇒ x=4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 5^(x+2) = 625, then x =$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$4$q$],2,$q$625=5^4, so x+2=4 ⇒ x=2.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 5^a = 3125, then the value of 5^(a−3) is:$q$,array[$q$25$q$,$q$125$q$,$q$625$q$,$q$5$q$],1,$q$3125=5^5 ⇒ a=5. Then 5^(a−3)=5^(5−3)=5^2=25.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If (17)^3.5 × (17)^x = (17)^8, then x =$q$,array[$q$3.5$q$,$q$4.0$q$,$q$4.5$q$,$q$5.0$q$],3,$q$Add exponents: 3.5+x=8 ⇒ x=8−3.5=4.5.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 2^(2x−1) = 32, then x =$q$,array[$q$2$q$,$q$3$q$,$q$4$q$,$q$5$q$],2,$q$32=2^5, so 2x−1=5 ⇒ 2x=6 ⇒ x=3.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 4^x = 8^(x−1), then the value of x is:$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$4$q$],3,$q$Common base 2: 2^(2x)=2^(3(x−1)). So 2x=3x−3 ⇒ x=3.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 9^x × 9 = 3^6, then x =$q$,array[$q$1$q$,$q$2$q$,$q$3$q$,$q$4$q$],2,$q$3^(2x)×3^2=3^6 ⇒ 2x+2=6 ⇒ 2x=4 ⇒ x=2.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$Simplify: (x^13 ÷ x^8) × (x^5 ÷ x^7). The result is:$q$,array[$q$x^2$q$,$q$x^3$q$,$q$x^4$q$,$q$x^5$q$],2,$q$Add/subtract exponents: 13−8+5−7=3. So the product = x^3.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If 2^x = 8^(y+1) and 9^y = 3^(x−9), then the value of x is:$q$,array[$q$12$q$,$q$15$q$,$q$18$q$,$q$21$q$],4,$q$From 2^x=2^(3(y+1)): x=3y+3. From 3^(2y)=3^(x−9): 2y=x−9. Substitute: 2y=3y+3−9 ⇒ y=6, so x=3(6)+3=21.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'medium',$q$If (0.5)^x = 8, then the value of x is:$q$,array[$q$3$q$,$q$−3$q$,$q$1/3$q$,$q$−1/3$q$],2,$q$0.5=2^(−1), 8=2^3. So 2^(−x)=2^3 ⇒ −x=3 ⇒ x=−3.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$The value of (√5 + √3) / (√5 − √3) is:$q$,array[$q$4 − √15$q$,$q$4 + √15$q$,$q$8 + 2√15$q$,$q$2 + √15$q$],2,$q$Multiply top & bottom by (√5+√3): numerator=(√5+√3)^2=8+2√15; denominator=5−3=2. So (8+2√15)/2=4+√15.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$If x = 2 + √3, then the value of x + 1/x is:$q$,array[$q$2√3$q$,$q$4$q$,$q$2 + 2√3$q$,$q$4√3$q$],2,$q$1/x = 1/(2+√3) = (2−√3)/((2+√3)(2−√3)) = (2−√3)/1 = 2−√3. So x+1/x = (2+√3)+(2−√3)=4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$On rationalising, the value of 1 / (3 − 2√2) is:$q$,array[$q$3 − 2√2$q$,$q$3 + 2√2$q$,$q$1 + 2√2$q$,$q$6 + 2√2$q$],2,$q$Multiply by conjugate (3+2√2): denominator=9−8=1, numerator=3+2√2. So the value = 3+2√2.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$If x = 1/(2 − √3), then the value of x² − 4x + 1 is:$q$,array[$q$0$q$,$q$1$q$,$q$2√3$q$,$q$4$q$],1,$q$x=1/(2−√3)=2+√3 (rationalise). Then x−2=√3 ⇒ (x−2)²=3 ⇒ x²−4x+4=3 ⇒ x²−4x+1=0.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$The value of (√3 + 1)/(√3 − 1) + (√3 − 1)/(√3 + 1) is:$q$,array[$q$2$q$,$q$4$q$,$q$2√3$q$,$q$3$q$],2,$q$Common denom 3−1=2. Numerator=(√3+1)²+(√3−1)²=(4+2√3)+(4−2√3)=8. So 8/2=4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$If x = √2 + 1, then the value of x² + 1/x² is:$q$,array[$q$4$q$,$q$6$q$,$q$2√2$q$,$q$8$q$],2,$q$1/x=√2−1, so x−1/x=(√2+1)−(√2−1)=2. Then x²+1/x²=(x−1/x)²+2=4+2=6.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$The value of (256)^0.16 × (16)^0.18 is:$q$,array[$q$2$q$,$q$4$q$,$q$8$q$,$q$16$q$],2,$q$256=2^8 ⇒ 2^(8×0.16)=2^1.28; 16=2^4 ⇒ 2^(4×0.18)=2^0.72. Product=2^(1.28+0.72)=2^2=4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$The value of √(5 + 2√6) is:$q$,array[$q$√2 + √3$q$,$q$√5 + 1$q$,$q$√6 + 1$q$,$q$2 + √3$q$],1,$q$Write 5+2√6 = 3+2+2√(3·2) = (√3+√2)². So the square root = √3+√2.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$On rationalising, (3 + √5)/(3 − √5) equals:$q$,array[$q$(7 + 3√5)/2$q$,$q$(7 − 3√5)/2$q$,$q$7 + 3√5$q$,$q$(14 + 6√5)$q$],1,$q$Multiply by (3+√5): numerator=(3+√5)²=14+6√5; denominator=9−5=4. So (14+6√5)/4=(7+3√5)/2.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'hard',$q$If x = 7 + 4√3, then the value of √x + 1/√x is:$q$,array[$q$2√3$q$,$q$4$q$,$q$2 + √3$q$,$q$2√3 + 2$q$],2,$q$7+4√3=(2+√3)², so √x=2+√3 and 1/√x=2−√3. Sum=(2+√3)+(2−√3)=4.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$If a^x = b, b^y = c and c^z = a, then the value of xyz is:$q$,array[$q$0$q$,$q$1$q$,$q$abc$q$,$q$−1$q$],2,$q$a^(xyz): from c^z=a ⇒ (b^y)^z=a ⇒ b^(yz)=a ⇒ (a^x)^(yz)=a ⇒ a^(xyz)=a^1 ⇒ xyz=1.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$If 4^x − 4^(x−1) = 24, then the value of x is:$q$,array[$q$2$q$,$q$2.5$q$,$q$3$q$,$q$3.5$q$],2,$q$4^x − 4^x/4 = 4^x(1 − 1/4)=4^x·(3/4)=24 ⇒ 4^x=32 ⇒ 2^(2x)=2^5 ⇒ 2x=5 ⇒ x=2.5.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$Which of the following is the greatest: ∛3, √2, ⁴√5, ⁶√10?$q$,array[$q$∛3$q$,$q$√2$q$,$q$⁴√5$q$,$q$⁶√10$q$],3,$q$LCM of indices 3,2,4,6 = 12. Raise each to 12th power: 3^4=81, 2^6=64, 5^3=125, 10^2=100. Largest is 125 ⇒ ⁴√5.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$If 2^x = 3^y = 12^z, then which relation is correct?$q$,array[$q$1/z = 1/x + 1/y$q$,$q$1/z = 2/x + 1/y$q$,$q$1/z = 1/x + 2/y$q$,$q$z = x + y$q$],2,$q$Let 2^x=3^y=12^z=k. Then 2=k^(1/x), 3=k^(1/y), 12=k^(1/z). Since 12=2²·3: k^(1/z)=k^(2/x)·k^(1/y) ⇒ 1/z=2/x+1/y.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$If 3^(x−1) + 3^(x+1) = 90, then the value of x is:$q$,array[$q$2$q$,$q$3$q$,$q$4$q$,$q$5$q$],2,$q$3^(x−1)+3^(x+1)=3^x(1/3 + 3)=3^x·(10/3)=90 ⇒ 3^x=27 ⇒ x=3.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$If a^(1/3) + b^(1/3) + c^(1/3) = 0, then (a + b + c)³ equals:$q$,array[$q$3abc$q$,$q$9abc$q$,$q$27abc$q$,$q$abc$q$],3,$q$If p+q+r=0 then p³+q³+r³=3pqr. With p=a^(1/3) etc: a+b+c=3(abc)^(1/3). Cube both sides: (a+b+c)³=27abc.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$The number of real values of x satisfying 2^(2x) − 6·2^x + 8 = 0 is (and the values are):$q$,array[$q$one value: x = 2$q$,$q$two values: x = 1 and x = 2$q$,$q$two values: x = 2 and x = 4$q$,$q$no real value$q$],2,$q$Let t=2^x: t²−6t+8=0 ⇒ (t−2)(t−4)=0 ⇒ t=2 or 4 ⇒ 2^x=2 (x=1) or 2^x=4 (x=2).$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$If 5^(x−3) · 3^(2x−8) = 225, then the value of x is:$q$,array[$q$3$q$,$q$4$q$,$q$5$q$,$q$6$q$],3,$q$225=15²=5²·3². Equate: x−3=2 ⇒ x=5, and 2x−8=2 ⇒ x=5 (consistent). So x=5.$q$);
select public._seed_arith_q($q$Surds and Indices$q$,'very_hard',$q$Simplify: (2^(n+4) − 2·2^n) / (2·2^(n+3))$q$,array[$q$2^n$q$,$q$7/8$q$,$q$1/8$q$,$q$2^(n−3)$q$],2,$q$Numerator=2^n(2^4 − 2)=2^n·14. Denominator=2·2^(n+3)=2^n·2^4=2^n·16. Ratio=14/16=7/8.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
