-- ============================================================================
-- 023_exam_seed_arithmetic.sql
-- Seed the common ICET "Arithmetic" subject and its 35 Arithmetical Ability
-- chapters (source: arithmatic-syllabus, Section I). Global content — not tied
-- to any college. Idempotent: re-running only fills gaps.
-- ============================================================================

insert into public.subject (name) values ('Arithmetic')
on conflict (lower(name)) do nothing;

insert into public.chapter (subject_id, name)
select s.id, c.name
from public.subject s
cross join (values
  ('Number System'),
  ('H.C.F. and L.C.M. of Numbers'),
  ('Decimal Fractions'),
  ('Simplification'),
  ('Square Roots and Cube Roots'),
  ('Average'),
  ('Problems on Numbers'),
  ('Problems on Ages'),
  ('Surds and Indices'),
  ('Logarithms'),
  ('Percentage'),
  ('Profit and Loss'),
  ('Ratio and Proportion'),
  ('Partnership'),
  ('Chain Rule'),
  ('Pipes and Cisterns'),
  ('Time and Work'),
  ('Time and Distance'),
  ('Boats and Streams'),
  ('Problems on Trains'),
  ('Alligation or Mixture'),
  ('Simple Interest'),
  ('Compound Interest'),
  ('Area'),
  ('Volume and Surface Area'),
  ('Races and Games of Skill'),
  ('Calendar'),
  ('Clocks'),
  ('Stocks and Shares'),
  ('Permutations and Combinations'),
  ('Probability'),
  ('True Discount'),
  ('Banker''s Discount'),
  ('Heights and Distances'),
  ('Odd Man Out and Series')
) as c(name)
where s.name = 'Arithmetic'
on conflict (subject_id, lower(name)) do nothing;
