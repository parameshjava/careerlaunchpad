-- 028_seed_arithmetic_questions_025.sql  (chapter: Volume and Surface Area)
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

select public._seed_arith_q('Volume and Surface Area','easy','The volume of a cube of side 3 cm is',array['9 cu cm','27 cu cm','18 cu cm','81 cu cm'],2);
select public._seed_arith_q('Volume and Surface Area','easy','The volume of a cuboid 2 cm × 3 cm × 4 cm is',array['9 cu cm','24 cu cm','18 cu cm','12 cu cm'],2);
select public._seed_arith_q('Volume and Surface Area','medium','The total surface area of a cube of side 2 cm is',array['8 sq cm','24 sq cm','16 sq cm','12 sq cm'],2);
select public._seed_arith_q('Volume and Surface Area','medium','The volume of a cylinder of radius 7 cm and height 10 cm (pi = 22/7) is',array['1540 cu cm','220 cu cm','440 cu cm','154 cu cm'],1);
select public._seed_arith_q('Volume and Surface Area','easy','The volume of a cube of side 5 cm is',array['25 cu cm','125 cu cm','75 cu cm','100 cu cm'],2);
select public._seed_arith_q('Volume and Surface Area','medium','The surface area of a sphere of radius 7 cm (pi = 22/7) is',array['154 sq cm','616 sq cm','308 sq cm','88 sq cm'],2);

drop function public._seed_arith_q(text, text, text, text[], int);
