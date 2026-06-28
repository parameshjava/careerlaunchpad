-- 028_seed_arithmetic_questions_027.sql  (chapter: Calendar)
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

select public._seed_arith_q('Calendar','easy','An ordinary (non-leap) year has',array['364 days','365 days','366 days','360 days'],2);
select public._seed_arith_q('Calendar','easy','A leap year has',array['365 days','366 days','367 days','360 days'],2);
select public._seed_arith_q('Calendar','medium','The number of odd days in an ordinary year is',array['0','1','2','3'],2);
select public._seed_arith_q('Calendar','medium','The number of odd days in a leap year is',array['0','1','2','3'],3);
select public._seed_arith_q('Calendar','medium','The year 2000 was',array['a leap year','not a leap year','a century year hence skipped','none of these'],1);
select public._seed_arith_q('Calendar','easy','The month of February in a leap year has',array['28 days','29 days','30 days','31 days'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
