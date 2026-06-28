-- 028_seed_arithmetic_questions_016.sql  (chapter: Pipes and Cisterns)
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

select public._seed_arith_q('Pipes and Cisterns','easy','A pipe fills a tank in 6 hours. In 1 hour it fills',array['1/3 of the tank','1/6 of the tank','6 tanks','1/2 of the tank'],2);
select public._seed_arith_q('Pipes and Cisterns','medium','Two pipes can fill a tank in 12 hours and 6 hours. Together they fill it in',array['3 hours','4 hours','6 hours','9 hours'],2);
select public._seed_arith_q('Pipes and Cisterns','medium','A pipe fills a tank in 4 hours while a leak empties it in 8 hours. With both open, the tank fills in',array['8 hours','4 hours','6 hours','12 hours'],1);
select public._seed_arith_q('Pipes and Cisterns','medium','Two pipes fill a tank in 10 hours and 15 hours. Together they fill it in',array['5 hours','6 hours','12 hours','25 hours'],2);
select public._seed_arith_q('Pipes and Cisterns','easy','A tap fills a tank in 5 hours. Two such taps together fill it in',array['2.5 hours','5 hours','10 hours','1 hour'],1);
select public._seed_arith_q('Pipes and Cisterns','easy','A pipe empties a full tank in 8 hours. In 2 hours it empties',array['1/4 of the tank','1/8 of the tank','1/2 of the tank','4 tanks'],1);

drop function public._seed_arith_q(text, text, text, text[], int);
