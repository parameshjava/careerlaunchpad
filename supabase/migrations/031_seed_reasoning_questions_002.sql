-- 031_seed_reasoning_questions_002.sql  (Reasoning chapter: Number Series)
-- Verified Reasoning MCQs. Single-answer, idempotent. Depends on 029 (Reasoning subject).
-- ============================================================================
create or replace function public._seed_subject_q(
  p_subject text, p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int
) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name) = lower(p_subject) limit 1;
  if v_subj is null then raise exception 'Subject % not found', p_subject; end if;
  select id into v_chap from public.chapter
    where subject_id = v_subj and lower(name) = lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found in %', p_chapter, p_subject; end if;
  if exists (select 1 from public.question where chapter_id = v_chap and stem = p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem) returning id into v_qid;
  for i in 1 .. array_length(p_opts, 1) loop
    insert into public.question_option (question_id, label, is_correct, position)
    values (v_qid, p_opts[i], i = p_correct, i - 1);
  end loop;
end;
$$;

select public._seed_subject_q('Reasoning','Number Series','easy','Find the next number: 2, 4, 8, 16, ?',array['24','32','20','64'],2);
select public._seed_subject_q('Reasoning','Number Series','easy','Find the next number: 1, 4, 9, 16, ?',array['20','25','24','36'],2);
select public._seed_subject_q('Reasoning','Number Series','easy','Find the next number: 3, 6, 9, 12, ?',array['14','15','18','13'],2);
select public._seed_subject_q('Reasoning','Number Series','medium','Find the next number: 1, 1, 2, 3, 5, 8, ?',array['11','12','13','21'],3);
select public._seed_subject_q('Reasoning','Number Series','easy','Find the next number: 100, 90, 80, 70, ?',array['65','60','75','50'],2);
select public._seed_subject_q('Reasoning','Number Series','medium','Find the next number: 2, 6, 12, 20, ?',array['28','30','24','42'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
