-- ============================================================================
-- 029_seed_english_reasoning_subjects.sql
-- Seed the global "English" (Communication Ability) and "Reasoning" (Analytical
-- Ability) subjects and their chapters — companions to Arithmetic (023), so the
-- ICET three-section structure (Appendix A) is complete. Global content, not
-- tied to any college. Idempotent.
-- ============================================================================

insert into public.subject (name) values ('English'), ('Reasoning')
on conflict (lower(name)) do nothing;

-- ---- English chapters -------------------------------------------------------
insert into public.chapter (subject_id, name)
select s.id, c.name
from public.subject s
cross join (values
  ('Synonyms'),
  ('Antonyms'),
  ('Spotting Errors'),
  ('Sentence Improvement'),
  ('Idioms and Phrases'),
  ('Fill in the Blanks'),
  ('Reading Comprehension'),
  ('One Word Substitution')
) as c(name)
where s.name = 'English'
on conflict (subject_id, lower(name)) do nothing;

-- ---- Reasoning chapters -----------------------------------------------------
insert into public.chapter (subject_id, name)
select s.id, c.name
from public.subject s
cross join (values
  ('Coding and Decoding'),
  ('Number Series'),
  ('Letter Series'),
  ('Blood Relations'),
  ('Direction Sense'),
  ('Analogy'),
  ('Classification'),
  ('Syllogism')
) as c(name)
where s.name = 'Reasoning'
on conflict (subject_id, lower(name)) do nothing;
