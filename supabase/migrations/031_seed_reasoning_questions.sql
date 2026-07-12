-- 031_seed_reasoning_questions_001.sql  (Reasoning chapter: Coding and Decoding)
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

select public._seed_subject_q('Reasoning','Coding and Decoding','easy','If CAT is coded as DBU (each letter moved one step forward), then DOG is coded as',array['EPH','CPF','EPG','DPH'],1);
select public._seed_subject_q('Reasoning','Coding and Decoding','medium','If MONDAY is written as NPOEBZ (each letter +1), then FRIDAY is written as',array['GSJEBZ','GSJDBZ','GSIEBZ','GSJEAZ'],1);
select public._seed_subject_q('Reasoning','Coding and Decoding','easy','If "+" means "×", then 6 + 2 equals',array['8','12','4','3'],2);
select public._seed_subject_q('Reasoning','Coding and Decoding','medium','In a code where Z = 1, Y = 2, ... , A = 26, the letter B is coded as',array['2','25','24','1'],2);
select public._seed_subject_q('Reasoning','Coding and Decoding','easy','If PEN is coded as QFO (each letter +1), then BOOK is coded as',array['CPPL','CPPK','CPOL','BPPL'],1);
select public._seed_subject_q('Reasoning','Coding and Decoding','medium','If FACE is coded as 6135 (A=1, B=2, ...), then HEAD is coded as',array['8514','8541','8154','8515'],1);

drop function public._seed_subject_q(text, text, text, text, text[], int);
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
-- 031_seed_reasoning_questions_003.sql  (Reasoning chapter: Letter Series)
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

select public._seed_subject_q('Reasoning','Letter Series','easy','Find the next letter: A, C, E, G, ?',array['H','I','J','K'],2);
select public._seed_subject_q('Reasoning','Letter Series','easy','Find the next letter: B, D, F, H, ?',array['I','J','K','L'],2);
select public._seed_subject_q('Reasoning','Letter Series','medium','Find the next letter: Z, X, V, T, ?',array['S','R','Q','U'],2);
select public._seed_subject_q('Reasoning','Letter Series','medium','Find the next letter: A, B, D, G, ?',array['J','K','L','I'],2);
select public._seed_subject_q('Reasoning','Letter Series','easy','Find the next group: AB, CD, EF, ?',array['GH','FG','HI','GI'],1);
select public._seed_subject_q('Reasoning','Letter Series','medium','Find the next letter: A, Z, B, Y, C, ?',array['D','X','W','E'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
-- 031_seed_reasoning_questions_004.sql  (Reasoning chapter: Blood Relations)
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

select public._seed_subject_q('Reasoning','Blood Relations','medium','Pointing to a man, a woman said, "He is the son of my mother." The man is the woman''s',array['father','brother','son','uncle'],2);
select public._seed_subject_q('Reasoning','Blood Relations','easy','A is the father of B, and B is the daughter of A. So A is B''s',array['mother','father','brother','uncle'],2);
select public._seed_subject_q('Reasoning','Blood Relations','easy','My father''s brother is my',array['cousin','uncle','nephew','grandfather'],2);
select public._seed_subject_q('Reasoning','Blood Relations','easy','My mother''s sister is my',array['niece','aunt','cousin','sister'],2);
select public._seed_subject_q('Reasoning','Blood Relations','medium','The daughter of my brother is my',array['niece','nephew','cousin','sister'],1);
select public._seed_subject_q('Reasoning','Blood Relations','easy','My son''s son is my',array['nephew','grandson','son','cousin'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
-- 031_seed_reasoning_questions_005.sql  (Reasoning chapter: Direction Sense)
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

select public._seed_subject_q('Reasoning','Direction Sense','medium','A man walks 3 km north, then 4 km east. How far is he from the starting point?',array['7 km','5 km','1 km','12 km'],2);
select public._seed_subject_q('Reasoning','Direction Sense','easy','If you face north and turn right, you now face',array['west','east','south','north'],2);
select public._seed_subject_q('Reasoning','Direction Sense','easy','If you face south and turn left, you now face',array['west','east','north','south'],2);
select public._seed_subject_q('Reasoning','Direction Sense','easy','The sun rises in the',array['west','east','north','south'],2);
select public._seed_subject_q('Reasoning','Direction Sense','medium','A person walks 5 km south and then 5 km north. The distance from the start is',array['10 km','0 km','5 km','25 km'],2);
select public._seed_subject_q('Reasoning','Direction Sense','medium','Facing east, after turning 180 degrees you face',array['north','west','south','east'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
-- 031_seed_reasoning_questions_006.sql  (Reasoning chapter: Analogy)
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

select public._seed_subject_q('Reasoning','Analogy','easy','Hand is to glove as foot is to',array['hat','sock','head','ring'],2);
select public._seed_subject_q('Reasoning','Analogy','easy','Dog is to puppy as cat is to',array['kitten','calf','cub','foal'],1);
select public._seed_subject_q('Reasoning','Analogy','easy','Hot is to cold as up is to',array['high','down','top','over'],2);
select public._seed_subject_q('Reasoning','Analogy','medium','Pen is to write as knife is to',array['cut','eat','draw','read'],1);
select public._seed_subject_q('Reasoning','Analogy','easy','Teacher is to school as doctor is to',array['hospital','court','office','shop'],1);
select public._seed_subject_q('Reasoning','Analogy','easy','Bird is to fly as fish is to',array['walk','swim','run','jump'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
-- 031_seed_reasoning_questions_007.sql  (Reasoning chapter: Classification)
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

select public._seed_subject_q('Reasoning','Classification','easy','Find the odd one out: Rose, Lotus, Lily, Mango',array['Rose','Lotus','Lily','Mango'],4);
select public._seed_subject_q('Reasoning','Classification','easy','Find the odd one out: Apple, Banana, Carrot, Mango',array['Apple','Banana','Carrot','Mango'],3);
select public._seed_subject_q('Reasoning','Classification','easy','Find the odd one out: Dog, Cat, Cow, Sparrow',array['Dog','Cat','Cow','Sparrow'],4);
select public._seed_subject_q('Reasoning','Classification','medium','Find the odd one out: 2, 3, 5, 9',array['2','3','5','9'],4);
select public._seed_subject_q('Reasoning','Classification','medium','Find the odd one out: Square, Circle, Triangle, Cube',array['Square','Circle','Triangle','Cube'],4);
select public._seed_subject_q('Reasoning','Classification','medium','Find the odd one out: Copper, Iron, Gold, Plastic',array['Copper','Iron','Gold','Plastic'],4);

drop function public._seed_subject_q(text, text, text, text, text[], int);
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
