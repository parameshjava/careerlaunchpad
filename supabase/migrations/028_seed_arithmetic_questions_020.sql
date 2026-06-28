-- 028_seed_arithmetic_questions_020.sql  (chapter: Problems on Trains)
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

select public._seed_arith_q('Problems on Trains','medium','A train 100 m long running at 36 km/h crosses a pole in',array['5 s','10 s','20 s','36 s'],2);
select public._seed_arith_q('Problems on Trains','medium','A train 150 m long at 10 m/s crosses a platform 150 m long in',array['15 s','30 s','45 s','20 s'],2);
select public._seed_arith_q('Problems on Trains','medium','A train 120 m long passes a man standing on the platform in 6 s. Its speed is',array['10 m/s','20 m/s','24 m/s','12 m/s'],2);
select public._seed_arith_q('Problems on Trains','medium','A train running at 60 km/h crosses a pole in 6 s. Its length is',array['100 m','120 m','60 m','360 m'],1);
select public._seed_arith_q('Problems on Trains','medium','A train 200 m long crosses a bridge 300 m long in 25 s. Its speed is',array['15 m/s','20 m/s','25 m/s','40 m/s'],2);
select public._seed_arith_q('Problems on Trains','easy','A speed of 90 km/h in metres per second is',array['20','25','30','15'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
