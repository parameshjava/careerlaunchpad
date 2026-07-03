-- ============================================================================
-- 075_arith: seed the 'Odd Man Out and Series' Arithmetic chapter of the exam question bank.
-- 41 distinct competitive-exam questions across easy/medium/hard/very_hard,
-- each with 4 options and a worked explanation. Idempotent (skips existing stems).
-- ============================================================================
create or replace function public._seed_arith_q(p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int, p_explanation text) returns void language plpgsql as $fn$
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
end; $fn$;

select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$What comes next in the series: 6, 11, 21, 41, ?$q$, ARRAY[$q$71$q$,$q$81$q$,$q$82$q$,$q$61$q$], 2, $q$Each term = previous×2−1, so 41×2−1 = 81.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$Find the odd one out: 4, 9, 16, 23, 25, 36$q$, ARRAY[$q$9$q$,$q$16$q$,$q$23$q$,$q$25$q$], 3, $q$All are perfect squares (2²..6²) except 23.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$What comes next in the series: 5, 8, 14, 23, ?$q$, ARRAY[$q$32$q$,$q$35$q$,$q$33$q$,$q$38$q$], 2, $q$Differences +3,+6,+9,+12, so 23+12 = 35.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$Find the odd one out: 11, 22, 33, 44, 54, 66$q$, ARRAY[$q$22$q$,$q$33$q$,$q$54$q$,$q$66$q$], 3, $q$All are multiples of 11 except 54.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$What comes next in the series: 3, 4, 7, 11, 18, ?$q$, ARRAY[$q$25$q$,$q$29$q$,$q$28$q$,$q$30$q$], 2, $q$Each term = sum of the previous two, so 11+18 = 29.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$Find the odd one out: 43, 53, 63, 73, 83$q$, ARRAY[$q$43$q$,$q$53$q$,$q$63$q$,$q$73$q$], 3, $q$All are prime except 63 (=9×7).$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$What comes next in the series: 2, 6, 12, 20, 30, ?$q$, ARRAY[$q$40$q$,$q$42$q$,$q$44$q$,$q$36$q$], 2, $q$Term = n²+n (n=1..5); next is 6²+6 = 42.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$Find the odd one out: 8, 27, 64, 125, 180, 216$q$, ARRAY[$q$27$q$,$q$64$q$,$q$180$q$,$q$216$q$], 3, $q$All are perfect cubes (2³..6³) except 180.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$What comes next in the series: 7, 10, 16, 28, ?$q$, ARRAY[$q$46$q$,$q$50$q$,$q$52$q$,$q$54$q$], 3, $q$Differences 3,6,12,24 (each doubling), so 28+24 = 52.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$easy$q$, $q$What comes next in the series: 2, 4, 7, 11, ?$q$, ARRAY[$q$14$q$,$q$15$q$,$q$16$q$,$q$18$q$], 3, $q$Differences +2,+3,+4,+5, so 11+5 = 16.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$Find the wrong term: 3, 8, 18, 38, 78, 156$q$, ARRAY[$q$8$q$,$q$18$q$,$q$78$q$,$q$156$q$], 4, $q$Rule is ×2+2 (3,8,18,38,78,158); the last term should be 158, not 156.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$Find the wrong term: 1, 5, 13, 25, 41, 62$q$, ARRAY[$q$5$q$,$q$13$q$,$q$41$q$,$q$62$q$], 4, $q$Differences +4,+8,+12,+16,+20 (…41,61); the last term should be 61, not 62.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 5, 6, 9, 14, 21, ?$q$, ARRAY[$q$28$q$,$q$30$q$,$q$32$q$,$q$34$q$], 2, $q$Differences 1,3,5,7,9 (odd numbers), so 21+9 = 30.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 2, 3, 5, 8, 12, 17, ?$q$, ARRAY[$q$21$q$,$q$22$q$,$q$23$q$,$q$24$q$], 3, $q$Differences +1,+2,+3,+4,+5,+6, so 17+6 = 23.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 10, 16, 13, 19, 16, 22, ?$q$, ARRAY[$q$18$q$,$q$19$q$,$q$20$q$,$q$25$q$], 2, $q$Alternating +6 then −3; last op is −3, so 22−3 = 19.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 3, 7, 15, 31, 63, ?$q$, ARRAY[$q$95$q$,$q$121$q$,$q$127$q$,$q$130$q$], 3, $q$Each term = previous×2+1, so 63×2+1 = 127.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 2, 5, 14, 41, 122, ?$q$, ARRAY[$q$245$q$,$q$365$q$,$q$363$q$,$q$366$q$], 2, $q$Each term = previous×3−1, so 122×3−1 = 365.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 16, 24, 36, 54, ?$q$, ARRAY[$q$72$q$,$q$78$q$,$q$81$q$,$q$96$q$], 3, $q$Each term ×1.5, so 54×1.5 = 81.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$What comes next in the series: 2, 5, 10, 17, 26, ?$q$, ARRAY[$q$35$q$,$q$36$q$,$q$37$q$,$q$38$q$], 3, $q$Term = n²+1 (n=1..6); 6²+1 = 37.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$medium$q$, $q$Find the wrong term: 3, 5, 9, 15, 24, 33$q$, ARRAY[$q$5$q$,$q$9$q$,$q$24$q$,$q$33$q$], 3, $q$Differences should be +2,+4,+6,+8,+10 (3,5,9,15,23,33); the 5th term should be 23, not 24.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$What comes next in the series: 5, 11, 23, 47, 95, ?$q$, ARRAY[$q$185$q$,$q$190$q$,$q$191$q$,$q$193$q$], 3, $q$Each term = previous×2+1, so 95×2+1 = 191.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$What comes next in the series: 3, 8, 15, 24, 35, 48, ?$q$, ARRAY[$q$60$q$,$q$61$q$,$q$63$q$,$q$65$q$], 3, $q$Term = n²−1 for n=2..7; next is 8²−1 = 63.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$Find the missing term: 2, 3, 5, ?, 11, 13$q$, ARRAY[$q$6$q$,$q$7$q$,$q$8$q$,$q$9$q$], 2, $q$Consecutive primes; the missing 4th prime is 7.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$What comes next in the series: 2, 1, 4, 3, 8, 5, 16, 7, ?$q$, ARRAY[$q$9$q$,$q$24$q$,$q$32$q$,$q$18$q$], 3, $q$Two interleaved series: odd positions ×2 (2,4,8,16→32); even positions +2 (1,3,5,7).$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$What comes next in the series: 2, 6, 12, 20, 30, 42, ?$q$, ARRAY[$q$54$q$,$q$56$q$,$q$58$q$,$q$60$q$], 2, $q$Term = n²+n (n=1..6); next is 7²+7 = 56.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$Find the missing term: 4, 9, 16, ?, 36, 49$q$, ARRAY[$q$20$q$,$q$24$q$,$q$25$q$,$q$30$q$], 3, $q$Consecutive squares 2²..7²; the missing term is 5² = 25.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$What comes next in the series: 1, 2, 6, 15, 31, 56, ?$q$, ARRAY[$q$84$q$,$q$88$q$,$q$90$q$,$q$92$q$], 4, $q$Successive differences are perfect squares 1,4,9,16,25,(36); so 56+36 = 92.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$What comes next in the series: 1, 1, 4, 8, 9, 27, 16, 64, ?$q$, ARRAY[$q$25$q$,$q$32$q$,$q$36$q$,$q$49$q$], 1, $q$Two interleaved series: squares 1,4,9,16,(25) and cubes 1,8,27,64; next is 5² = 25.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$hard$q$, $q$Find the wrong term: 6, 11, 21, 36, 57, 81$q$, ARRAY[$q$11$q$,$q$21$q$,$q$36$q$,$q$57$q$], 4, $q$Differences should be +5,+10,+15,+20,+25 (…36,56,81); the 5th term should be 56, not 57.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 6, 24, 60, 120, 210, ?$q$, ARRAY[$q$300$q$,$q$330$q$,$q$336$q$,$q$342$q$], 3, $q$Term = n³−n (n=2..6); next is 7³−7 = 336.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 1, 2, 6, 24, 120, ?$q$, ARRAY[$q$600$q$,$q$720$q$,$q$840$q$,$q$480$q$], 2, $q$Factorial series n! (1!..5!); next is 6! = 720.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 480, 240, 120, 60, 30, ?$q$, ARRAY[$q$10$q$,$q$12$q$,$q$15$q$,$q$20$q$], 3, $q$Each term halved, so 30×0.5 = 15.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 32, 48, 72, 108, 162, ?$q$, ARRAY[$q$216$q$,$q$228$q$,$q$240$q$,$q$243$q$], 4, $q$Each term ×1.5, so 162×1.5 = 243.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 1, 2, 4, 7, 12, 20, ?$q$, ARRAY[$q$31$q$,$q$32$q$,$q$33$q$,$q$34$q$], 3, $q$Each term = sum of previous two +1, so 12+20+1 = 33.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 3, 5, 10, 12, 24, 26, ?$q$, ARRAY[$q$48$q$,$q$50$q$,$q$52$q$,$q$54$q$], 3, $q$Alternating +2 then ×2; last op is ×2, so 26×2 = 52.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$Find the odd one out: 5, 10, 17, 25, 37$q$, ARRAY[$q$10$q$,$q$17$q$,$q$25$q$,$q$37$q$], 3, $q$All are of form n²+1 (n=2,3,4,6 → 5,10,17,37) except 25 (=5², an exact square).$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 2, 3, 11, 38, 102, ?$q$, ARRAY[$q$215$q$,$q$220$q$,$q$227$q$,$q$230$q$], 3, $q$Successive differences are cubes 1,8,27,64,(125); so 102+125 = 227.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$Find the wrong term: 2, 6, 18, 54, 150, 486$q$, ARRAY[$q$6$q$,$q$18$q$,$q$54$q$,$q$150$q$], 4, $q$Rule is ×3 (…54,162,486); the 5th term should be 162, not 150.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 2, 4, 9, 28, 125, ?$q$, ARRAY[$q$620$q$,$q$720$q$,$q$726$q$,$q$730$q$], 3, $q$Term = n!+n (n=1..5); next is 6!+6 = 726.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$What comes next in the series: 2, 3, 5, 9, 17, 33, ?$q$, ARRAY[$q$63$q$,$q$64$q$,$q$65$q$,$q$66$q$], 3, $q$Each term = previous×2−1, so 33×2−1 = 65.$q$);
select public._seed_arith_q($q$Odd Man Out and Series$q$, $q$very_hard$q$, $q$Find the missing term: 1, 4, 4, 9, 9, 16, ?, 25$q$, ARRAY[$q$16$q$,$q$20$q$,$q$21$q$,$q$24$q$], 1, $q$Squares appear in repeated pairs: 1,4,4,9,9,16,(16),25; the missing term is 16.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
