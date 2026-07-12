-- 030_seed_english_questions_001.sql  (English chapter: Synonyms)
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

select public._seed_subject_q('English','Synonyms','easy','Choose the word most similar in meaning to "Happy".',array['Sad','Joyful','Angry','Tired'],2);
select public._seed_subject_q('English','Synonyms','easy','Choose the word most similar in meaning to "Big".',array['Small','Large','Thin','Short'],2);
select public._seed_subject_q('English','Synonyms','easy','Choose the word most similar in meaning to "Begin".',array['End','Start','Stop','Finish'],2);
select public._seed_subject_q('English','Synonyms','medium','Choose the word most similar in meaning to "Brave".',array['Cowardly','Courageous','Weak','Fearful'],2);
select public._seed_subject_q('English','Synonyms','easy','Choose the word most similar in meaning to "Rapid".',array['Slow','Fast','Late','Calm'],2);
select public._seed_subject_q('English','Synonyms','medium','Choose the word most similar in meaning to "Wealthy".',array['Poor','Rich','Needy','Broke'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
-- 030_seed_english_questions_002.sql  (English chapter: Antonyms)
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

select public._seed_subject_q('English','Antonyms','easy','Choose the word most opposite in meaning to "Hot".',array['Warm','Cold','Boiling','Heated'],2);
select public._seed_subject_q('English','Antonyms','medium','Choose the word most opposite in meaning to "Ancient".',array['Old','Modern','Antique','Aged'],2);
select public._seed_subject_q('English','Antonyms','medium','Choose the word most opposite in meaning to "Victory".',array['Win','Defeat','Triumph','Success'],2);
select public._seed_subject_q('English','Antonyms','medium','Choose the word most opposite in meaning to "Generous".',array['Kind','Stingy','Giving','Liberal'],2);
select public._seed_subject_q('English','Antonyms','easy','Choose the word most opposite in meaning to "Increase".',array['Rise','Decrease','Grow','Expand'],2);
select public._seed_subject_q('English','Antonyms','medium','Choose the word most opposite in meaning to "Artificial".',array['Fake','Natural','Synthetic','Man-made'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
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
-- 030_seed_english_questions_004.sql  (English chapter: Sentence Improvement)
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

select public._seed_subject_q('English','Sentence Improvement','medium','Fill the blank: "He is junior ___ me."',array['than','to','from','of'],2);
select public._seed_subject_q('English','Sentence Improvement','medium','Fill the blank: "She is good ___ mathematics."',array['in','at','on','for'],2);
select public._seed_subject_q('English','Sentence Improvement','medium','Fill the blank: "I have been living here ___ 2010."',array['since','for','from','by'],1);
select public._seed_subject_q('English','Sentence Improvement','medium','Fill the blank: "He prefers tea ___ coffee."',array['than','to','over','from'],2);
select public._seed_subject_q('English','Sentence Improvement','medium','Fill the blank: "The train ___ before we arrived."',array['has left','had left','have left','is leaving'],2);
select public._seed_subject_q('English','Sentence Improvement','medium','Fill the blank: "Neither of the boys ___ present."',array['are','is','were','have'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
-- 030_seed_english_questions_005.sql  (English chapter: Idioms and Phrases)
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

select public._seed_subject_q('English','Idioms and Phrases','medium','The idiom "to break the ice" means',array['to start a conversation','to break something','to feel cold','to win a prize'],1);
select public._seed_subject_q('English','Idioms and Phrases','easy','The phrase "a piece of cake" means',array['a dessert','something very easy','a difficult task','a small portion'],2);
select public._seed_subject_q('English','Idioms and Phrases','medium','The idiom "to let the cat out of the bag" means',array['to free a cat','to reveal a secret','to make a mistake','to buy a pet'],2);
select public._seed_subject_q('English','Idioms and Phrases','medium','The phrase "once in a blue moon" means',array['very rarely','very often','at night','never'],1);
select public._seed_subject_q('English','Idioms and Phrases','medium','The idiom "to hit the books" means',array['to study hard','to throw books','to read for fun','to write a book'],1);
select public._seed_subject_q('English','Idioms and Phrases','medium','The phrase "under the weather" means',array['outside','feeling ill','raining','very happy'],2);

drop function public._seed_subject_q(text, text, text, text, text[], int);
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
-- 030_seed_english_questions_007.sql  (English chapter: Reading Comprehension)
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

select public._seed_subject_q('English','Reading Comprehension','easy','Passage: Ravi goes to school by bus every morning. According to the passage, how does Ravi travel to school?',array['By car','By bus','On foot','By train'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: The sun rises in the east and sets in the west. Where does the sun set?',array['East','West','North','South'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: Maya has three cats and two dogs. How many pets does Maya have in total?',array['Three','Five','Two','Six'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: The library opens at 9 am and closes at 6 pm. At what time does the library open?',array['6 am','9 am','6 pm','9 pm'],2);
select public._seed_subject_q('English','Reading Comprehension','easy','Passage: Water boils at 100 degrees Celsius. At what temperature does water boil?',array['0°C','50°C','100°C','212°C'],3);
select public._seed_subject_q('English','Reading Comprehension','medium','Passage: Tom saved ₹50 each week for four weeks. How much did Tom save in total?',array['₹50','₹100','₹200','₹150'],3);

drop function public._seed_subject_q(text, text, text, text, text[], int);
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
