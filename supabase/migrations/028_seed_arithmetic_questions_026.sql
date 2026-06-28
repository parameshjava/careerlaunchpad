-- 028_seed_arithmetic_questions_026.sql  (chapter: Races and Games of Skill)
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

select public._seed_arith_q('Races and Games of Skill','medium','In a 100 m race, A beats B by 20 m. When A finishes, B has run',array['60 m','80 m','100 m','120 m'],2);
select public._seed_arith_q('Races and Games of Skill','medium','"A can give B 10 points in a game of 100" means when A scores 100, B scores',array['90','100','110','80'],1);
select public._seed_arith_q('Races and Games of Skill','medium','In a 200 m race, A beats B by 10 m. When A finishes, B has run',array['180 m','190 m','200 m','210 m'],2);
select public._seed_arith_q('Races and Games of Skill','easy','A runs 100 m in 10 seconds. His speed is',array['5 m/s','10 m/s','20 m/s','100 m/s'],2);
select public._seed_arith_q('Races and Games of Skill','medium','In a 1 km race, A beats B by 100 m. When A runs 1000 m, B runs',array['800 m','900 m','1000 m','1100 m'],2);
select public._seed_arith_q('Races and Games of Skill','easy','A "dead heat" in a race means',array['A wins','B wins','the race ends in a tie','a rematch'],3);

drop function public._seed_arith_q(text, text, text, text[], int);
