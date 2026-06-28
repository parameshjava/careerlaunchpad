-- 028_seed_arithmetic_questions_021.sql  (chapter: Alligation or Mixture)
-- Verified Arithmetic MCQs. Single-answer, 4-5 options, idempotent. Depends on 023.
-- ============================================================================
create or replace function public._seed_arith_q(
  p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int
) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name) = 'arithmetic' limit 1;
  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;
  select id into v_chap from public.chapter
    where subject_id = v_subj and lower(name) = lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;
  if exists (select 1 from public.question where chapter_id = v_chap and stem = p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem) returning id into v_qid;
  for i in 1 .. array_length(p_opts, 1) loop
    insert into public.question_option (question_id, label, is_correct, position)
    values (v_qid, p_opts[i], i = p_correct, i - 1);
  end loop;
end;
$$;

select public._seed_arith_q('Alligation or Mixture','medium','In what ratio must rice at ₹10/kg be mixed with rice at ₹15/kg to get a mixture worth ₹12/kg?',array['3 : 2','2 : 3','1 : 1','5 : 2'],1);
select public._seed_arith_q('Alligation or Mixture','easy','A 20-litre mixture contains milk and water in the ratio 3 : 1. The quantity of milk is',array['10 litres','15 litres','5 litres','12 litres'],2);
select public._seed_arith_q('Alligation or Mixture','easy','Two qualities priced ₹8 and ₹12 are mixed in equal quantities. The average price is',array['₹9','₹10','₹11','₹20'],2);
select public._seed_arith_q('Alligation or Mixture','easy','To 40 litres of milk, 10 litres of water is added. The ratio of milk to water is',array['4 : 1','1 : 4','3 : 1','5 : 1'],1);
select public._seed_arith_q('Alligation or Mixture','medium','In what ratio must two varieties at ₹12 and ₹18 be mixed to get a mixture worth ₹15?',array['1 : 1','2 : 1','1 : 2','3 : 2'],1);
select public._seed_arith_q('Alligation or Mixture','easy','A 30-litre mixture contains 20% water. The quantity of water is',array['6 litres','5 litres','10 litres','24 litres'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
