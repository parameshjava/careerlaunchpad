-- 030_seed_english_questions_003.sql  (English chapter: Spotting Errors)
-- Verified English MCQs. Single-answer, idempotent. Depends on 029 (English subject).
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

select public._seed_subject_q('English','Spotting Errors','easy','Choose the grammatically correct sentence (about liking tea).',array['He don''t like tea.','He doesn''t like tea.','He not like tea.','He didn''t likes tea.'],2);
select public._seed_subject_q('English','Spotting Errors','easy','Choose the grammatically correct sentence (about owning a car).',array['She have a car.','She has a car.','She having a car.','She haves a car.'],2);
select public._seed_subject_q('English','Spotting Errors','easy','Choose the grammatically correct sentence (about being happy).',array['They was happy.','They were happy.','They is happy.','They be happy.'],2);
select public._seed_subject_q('English','Spotting Errors','easy','Choose the grammatically correct sentence (about going to school).',array['I goes to school.','I go to school.','I going to school.','I gone to school.'],2);
select public._seed_subject_q('English','Spotting Errors','medium','Choose the grammatically correct sentence (using comparison).',array['He is more taller than me.','He is taller than me.','He is most tall than me.','He is tallest than me.'],2);
select public._seed_subject_q('English','Spotting Errors','medium','Choose the grammatically correct sentence (about children playing).',array['The childs are playing.','The children are playing.','The childrens are playing.','The child are playing.'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
