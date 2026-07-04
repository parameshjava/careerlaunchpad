-- ============================================================================
-- 076_arith_drop_legacy_028_seed.sql
-- Remove the legacy 028 Arithmetic question set (233 questions).
--
-- Those were sourced from the syllabus PDF and are textbook-primitive across
-- both tiers ("average of the first 5 natural numbers", "age after 5 years",
-- "2^3 × 2^2", "25% of 200", "which one is a prime number", "394 × 113"), have
-- no very_hard tier, and store NO worked explanation, so none of them render a
-- solution on the student result / evaluator review screens.
--
-- Every chapter is now fully covered by the curated, explained,
-- difficulty-calibrated bank in migrations 041 + 044-075 (~40 Qs/chapter across
-- easy/medium/hard/very_hard, each with an explanation), so the 028 layer only
-- lowers the average quality of what students see.
--
-- The 028 set is identifiable precisely: it is exactly the Arithmetic questions
-- whose explanation IS NULL (every 041-075 question carries an explanation).
-- question_option rows are removed via ON DELETE CASCADE (021, line 95).
-- Assumes no generated papers / attempts reference these seed questions (true
-- pre-launch: the exam tables are empty). Idempotent: a re-run deletes nothing.
-- ============================================================================
delete from public.question q
using public.subject s
where q.subject_id = s.id
  and lower(s.name) = 'arithmetic'
  and q.explanation is null;

-- Drop the legacy 5-arg seeding helper the 028 migrations left defined; the
-- 041-075 batch uses the distinct 6-arg overload (created/dropped per file).
drop function if exists public._seed_arith_q(text, text, text, text[], int);
