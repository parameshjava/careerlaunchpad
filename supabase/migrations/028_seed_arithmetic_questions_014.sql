-- 028_seed_arithmetic_questions_014.sql  (chapter: Partnership)
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

select public._seed_arith_q('Partnership','medium','A and B invest ₹3000 and ₹2000 for the same time. A profit of ₹500 is shared. A''s share is',array['₹200','₹300','₹250','₹350'],2);
select public._seed_arith_q('Partnership','easy','Two partners invest equal amounts for the same time. They share the profit in the ratio',array['1 : 1','2 : 1','1 : 2','3 : 2'],1);
select public._seed_arith_q('Partnership','medium','A invests ₹4000 for 6 months and B invests ₹2000 for 12 months. The ratio of their profits is',array['1 : 1','2 : 1','1 : 2','3 : 1'],1);
select public._seed_arith_q('Partnership','medium','A, B and C invest in the ratio 2 : 3 : 5. From a total profit of ₹10000, C''s share is',array['₹2000','₹3000','₹5000','₹4000'],3);
select public._seed_arith_q('Partnership','medium','In a business A''s capital is twice B''s, for the same time. A profit of ₹900 is shared. A gets',array['₹300','₹600','₹450','₹900'],2);
select public._seed_arith_q('Partnership','easy','A and B share profit in the ratio 5 : 3. If the total profit is ₹800, B''s share is',array['₹500','₹300','₹400','₹250'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
