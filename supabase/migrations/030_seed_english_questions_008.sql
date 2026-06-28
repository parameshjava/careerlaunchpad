-- 030_seed_english_questions_008.sql  (English chapter: One Word Substitution)
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

select public._seed_subject_q('English','One Word Substitution','easy','A person who writes books is called',array['an author','a reader','a publisher','a printer'],1);
select public._seed_subject_q('English','One Word Substitution','easy','A place where books are kept is a',array['museum','library','gallery','studio'],2);
select public._seed_subject_q('English','One Word Substitution','medium','One who cannot read or write is',array['educated','illiterate','literate','scholar'],2);
select public._seed_subject_q('English','One Word Substitution','medium','A doctor who treats children is a',array['cardiologist','pediatrician','dentist','surgeon'],2);
select public._seed_subject_q('English','One Word Substitution','medium','A person who studies the stars and planets is an',array['astronaut','astronomer','astrologer','geologist'],2);
select public._seed_subject_q('English','One Word Substitution','easy','A list of dishes available in a restaurant is a',array['bill','menu','receipt','recipe'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
