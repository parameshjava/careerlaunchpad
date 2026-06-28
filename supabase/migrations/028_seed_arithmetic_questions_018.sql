-- 028_seed_arithmetic_questions_018.sql  (chapter: Time and Distance)
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

select public._seed_arith_q('Time and Distance','easy','A car travels 150 km in 3 hours. Its speed is',array['45 km/h','50 km/h','60 km/h','30 km/h'],2);
select public._seed_arith_q('Time and Distance','easy','At a speed of 60 km/h, the distance covered in 2 hours is',array['100 km','120 km','150 km','60 km'],2);
select public._seed_arith_q('Time and Distance','medium','A train running at 72 km/h has a speed in metres per second of',array['10','20','25','36'],2);
select public._seed_arith_q('Time and Distance','easy','The time to cover 100 km at 25 km/h is',array['3 hours','4 hours','5 hours','2 hours'],2);
select public._seed_arith_q('Time and Distance','medium','A speed of 10 m/s expressed in km/h is',array['18','36','27','50'],2);
select public._seed_arith_q('Time and Distance','medium','A man walks 6 km in 90 minutes. His speed in km/h is',array['3','4','5','6'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
