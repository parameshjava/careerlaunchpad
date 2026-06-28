-- 028_seed_arithmetic_questions_011.sql  (chapter: Percentage)
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

select public._seed_arith_q('Percentage','easy','25% of 200 is',array['25','50','75','100'],2);
select public._seed_arith_q('Percentage','easy','What percent of 50 is 10?',array['10%','20%','25%','5%'],2);
select public._seed_arith_q('Percentage','medium','A number increased by 20% becomes 120. The original number is',array['96','100','144','80'],2);
select public._seed_arith_q('Percentage','easy','0.5 expressed as a percentage is',array['5%','50%','0.5%','500%'],2);
select public._seed_arith_q('Percentage','easy','40% of 250 is',array['100','40','125','60'],1);
select public._seed_arith_q('Percentage','medium','If 30% of a number is 60, the number is',array['180','200','120','90'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
