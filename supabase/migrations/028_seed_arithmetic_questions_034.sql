-- 028_seed_arithmetic_questions_034.sql  (chapter: Heights and Distances)
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

select public._seed_arith_q('Heights and Distances','easy','The value of tan 45° is',array['0','1','√3','1/√3'],2);
select public._seed_arith_q('Heights and Distances','easy','The value of sin 30° is',array['1/2','√3/2','1','0'],1);
select public._seed_arith_q('Heights and Distances','medium','As an observer moves closer to a tower, the angle of elevation of its top',array['increases','decreases','stays the same','becomes zero'],1);
select public._seed_arith_q('Heights and Distances','easy','The value of cos 60° is',array['1/2','√3/2','1','0'],1);
select public._seed_arith_q('Heights and Distances','medium','If a tower casts a shadow equal to its own height, the angle of elevation of the sun is',array['30°','45°','60°','90°'],2);
select public._seed_arith_q('Heights and Distances','medium','The value of tan 30° is',array['√3','1/√3','1','1/2'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
