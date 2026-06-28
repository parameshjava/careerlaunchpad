-- 028_seed_arithmetic_questions_028.sql  (chapter: Clocks)
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

select public._seed_arith_q('Clocks','medium','The angle traced by the hour hand in 12 hours is',array['180°','360°','720°','60°'],2);
select public._seed_arith_q('Clocks','medium','The minute hand of a clock moves through, per minute,',array['1°','6°','30°','12°'],2);
select public._seed_arith_q('Clocks','easy','At 3 o''clock, the angle between the hour and minute hands is',array['60°','90°','120°','180°'],2);
select public._seed_arith_q('Clocks','medium','The hour hand of a clock moves through, per minute,',array['0.5°','1°','6°','30°'],1);
select public._seed_arith_q('Clocks','easy','At 6 o''clock, the angle between the hands is',array['90°','120°','180°','360°'],3);
select public._seed_arith_q('Clocks','easy','In 60 minutes, the minute hand completes',array['half a revolution','one full revolution','two revolutions','a quarter revolution'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
