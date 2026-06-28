-- 031_seed_reasoning_questions_008.sql  (Reasoning chapter: Syllogism)
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

select public._seed_subject_q('Reasoning','Syllogism','medium','All cats are animals. All animals are living things. Therefore,',array['All living things are cats','All cats are living things','No cats are living things','Some animals are not cats'],2);
select public._seed_subject_q('Reasoning','Syllogism','medium','All roses are flowers. Some flowers fade quickly. The conclusion "All roses fade quickly" is',array['definitely true','not necessarily true','always false','the same statement'],2);
select public._seed_subject_q('Reasoning','Syllogism','medium','If all A are B and all B are C, then',array['all C are A','all A are C','no A are C','some A are not C'],2);
select public._seed_subject_q('Reasoning','Syllogism','easy','All men are mortal. Socrates is a man. Therefore,',array['Socrates is immortal','Socrates is mortal','Socrates is not a man','Men are immortal'],2);
select public._seed_subject_q('Reasoning','Syllogism','medium','Some pens are pencils. All pencils are erasers. Which conclusion follows?',array['All pens are erasers','Some pens are erasers','No pens are erasers','All erasers are pens'],2);
select public._seed_subject_q('Reasoning','Syllogism','medium','No birds are mammals. All sparrows are birds. Therefore,',array['All sparrows are mammals','No sparrows are mammals','Some sparrows are mammals','Sparrows are not birds'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
