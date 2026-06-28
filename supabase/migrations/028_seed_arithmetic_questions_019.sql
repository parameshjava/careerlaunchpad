-- 028_seed_arithmetic_questions_019.sql  (chapter: Boats and Streams)
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

select public._seed_arith_q('Boats and Streams','easy','A boat''s speed in still water is 10 km/h and the stream is 2 km/h. Its downstream speed is',array['8 km/h','12 km/h','10 km/h','5 km/h'],2);
select public._seed_arith_q('Boats and Streams','easy','A boat''s speed in still water is 10 km/h and the stream is 2 km/h. Its upstream speed is',array['8 km/h','12 km/h','10 km/h','6 km/h'],1);
select public._seed_arith_q('Boats and Streams','medium','If the downstream speed is 16 km/h and the upstream speed is 8 km/h, the speed in still water is',array['4 km/h','12 km/h','8 km/h','24 km/h'],2);
select public._seed_arith_q('Boats and Streams','medium','If the downstream speed is 16 km/h and the upstream speed is 8 km/h, the speed of the stream is',array['4 km/h','12 km/h','2 km/h','8 km/h'],1);
select public._seed_arith_q('Boats and Streams','easy','A boat covers 20 km downstream in 2 hours. Its downstream speed is',array['5 km/h','10 km/h','40 km/h','2 km/h'],2);
select public._seed_arith_q('Boats and Streams','easy','Speed in still water is 8 km/h and the stream is 3 km/h. The upstream speed is',array['11 km/h','5 km/h','8 km/h','3 km/h'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
