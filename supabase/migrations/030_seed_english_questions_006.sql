-- 030_seed_english_questions_006.sql  (English chapter: Fill in the Blanks)
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

select public._seed_subject_q('English','Fill in the Blanks','easy','She ___ to school every day.',array['go','goes','going','gone'],2);
select public._seed_subject_q('English','Fill in the Blanks','easy','There ___ many people at the party.',array['was','were','is','has'],2);
select public._seed_subject_q('English','Fill in the Blanks','medium','He is the ___ student in the class.',array['good','better','best','well'],3);
select public._seed_subject_q('English','Fill in the Blanks','easy','I ___ my homework yesterday.',array['do','did','done','doing'],2);
select public._seed_subject_q('English','Fill in the Blanks','medium','She bought ___ umbrella.',array['a','an','the','no article'],2);
select public._seed_subject_q('English','Fill in the Blanks','medium','We will go out ___ it stops raining.',array['since','when','during','despite'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
