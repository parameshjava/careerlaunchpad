-- 028_seed_arithmetic_questions_017.sql  (chapter: Time and Work)
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

select public._seed_arith_q('Time and Work','easy','A can do a piece of work in 10 days. In one day he does',array['1/5 of the work','1/10 of the work','10 works','1/2 of the work'],2);
select public._seed_arith_q('Time and Work','medium','A does a work in 12 days and B in 6 days. Working together they finish it in',array['3 days','4 days','6 days','9 days'],2);
select public._seed_arith_q('Time and Work','medium','A and B together finish a work in 8 days. A alone takes 12 days. B alone takes',array['16 days','24 days','20 days','4 days'],2);
select public._seed_arith_q('Time and Work','easy','If 8 men do a work in 6 days, then 4 men do it in',array['3 days','12 days','24 days','6 days'],2);
select public._seed_arith_q('Time and Work','medium','A is twice as efficient as B. A finishes a work in 6 days. B alone takes',array['3 days','12 days','9 days','6 days'],2);
select public._seed_arith_q('Time and Work','medium','A does 1/4 of a work in 5 days. The whole work takes',array['10 days','20 days','15 days','25 days'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
