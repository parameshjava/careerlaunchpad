-- ============================================================================
-- 126_competitive_exam_seed.sql
-- Seeds the competitive-exam catalog (issue #49): each exam's DESCRIPTION and
-- its SYLLABUS (subjects + the chapters it tests), reusing the shared
-- subject/chapter taxonomy. Proposal + fact-check: docs/competitive-exams-seed-proposal.md.
--
-- Single source of truth: a staging table `_seed_links(exam_code, subject, chapter)`
-- drives everything — the canonical subjects, their chapters, the exam↔subject
-- links, and the exam↔chapter links are all derived from it, so the chapter
-- lists and the links can never drift apart. Idempotent (on conflict do nothing);
-- creates the canonical subject set fresh (dedup by name — any pre-existing
-- subject/chapter with a matching name is reused, not duplicated).
--
-- NB: the ENTIRE seed runs inside a single DO $$ ... $$ block. That makes it one
-- statement / one session to the server, so the staging table survives across
-- every insert even under Supabase's transaction-mode connection pooler (which
-- would otherwise route each top-level statement to a different backend and lose
-- a temp table between statements). The table is ON COMMIT DROP.
--
-- Depends on 125_fees.sql (competitive_exam rows for the 8 codes already seeded)
-- and the exam taxonomy tables subject/chapter (migration 021).
-- ============================================================================

do $$
begin

create temporary table _seed_links (exam_code text, subject text, chapter text) on commit drop;

-- ── ICET ────────────────────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('ICET','Quantitative Aptitude','Number System'),
  ('ICET','Quantitative Aptitude','LCM & HCF'),
  ('ICET','Quantitative Aptitude','Surds & Indices'),
  ('ICET','Quantitative Aptitude','Ratio & Proportion'),
  ('ICET','Quantitative Aptitude','Percentages'),
  ('ICET','Quantitative Aptitude','Profit, Loss & Discount'),
  ('ICET','Quantitative Aptitude','Partnership'),
  ('ICET','Quantitative Aptitude','Time & Work'),
  ('ICET','Quantitative Aptitude','Pipes & Cisterns'),
  ('ICET','Quantitative Aptitude','Time, Speed & Distance'),
  ('ICET','Quantitative Aptitude','Simple & Compound Interest'),
  ('ICET','Quantitative Aptitude','Mensuration'),
  ('ICET','Quantitative Aptitude','Algebra'),
  ('ICET','Quantitative Aptitude','Progressions (AP & GP)'),
  ('ICET','Quantitative Aptitude','Matrices & Determinants'),
  ('ICET','Quantitative Aptitude','Limits & Derivatives'),
  ('ICET','Quantitative Aptitude','Geometry'),
  ('ICET','Quantitative Aptitude','Coordinate Geometry'),
  ('ICET','Quantitative Aptitude','Trigonometry'),
  ('ICET','Quantitative Aptitude','Heights & Distances'),
  ('ICET','Quantitative Aptitude','Set Theory'),
  ('ICET','Quantitative Aptitude','Frequency Distributions'),
  ('ICET','Quantitative Aptitude','Mean, Median & Mode'),
  ('ICET','Quantitative Aptitude','Standard Deviation & Variance'),
  ('ICET','Quantitative Aptitude','Correlation'),
  ('ICET','Quantitative Aptitude','Probability'),
  ('ICET','Logical & Analytical Reasoning','Number & Alphabet Series'),
  ('ICET','Logical & Analytical Reasoning','Analogy'),
  ('ICET','Logical & Analytical Reasoning','Classification (Odd One Out)'),
  ('ICET','Logical & Analytical Reasoning','Coding-Decoding'),
  ('ICET','Logical & Analytical Reasoning','Blood Relations'),
  ('ICET','Logical & Analytical Reasoning','Seating Arrangement'),
  ('ICET','Logical & Analytical Reasoning','Clocks & Calendars'),
  ('ICET','Logical & Analytical Reasoning','Data Sufficiency (Reasoning)'),
  ('ICET','Logical & Analytical Reasoning','Venn Diagrams'),
  ('ICET','Data Interpretation & Data Sufficiency','Tables'),
  ('ICET','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('ICET','Data Interpretation & Data Sufficiency','Pie Charts'),
  ('ICET','Data Interpretation & Data Sufficiency','Caselets'),
  ('ICET','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('ICET','Verbal Ability & Reading Comprehension','Grammar & Usage'),
  ('ICET','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('ICET','Verbal Ability & Reading Comprehension','Business & Computer Terminology');

-- ── MAT ───────────────────────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('MAT','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('MAT','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('MAT','Verbal Ability & Reading Comprehension','Idioms & Phrases'),
  ('MAT','Verbal Ability & Reading Comprehension','One-Word Substitution'),
  ('MAT','Verbal Ability & Reading Comprehension','Grammar & Usage'),
  ('MAT','Verbal Ability & Reading Comprehension','Error Spotting'),
  ('MAT','Verbal Ability & Reading Comprehension','Sentence Correction & Improvement'),
  ('MAT','Verbal Ability & Reading Comprehension','Fill in the Blanks'),
  ('MAT','Verbal Ability & Reading Comprehension','Para Jumbles'),
  ('MAT','Verbal Ability & Reading Comprehension','Verbal Analogies'),
  ('MAT','Logical & Analytical Reasoning','Statements & Arguments'),
  ('MAT','Logical & Analytical Reasoning','Statements & Assumptions'),
  ('MAT','Logical & Analytical Reasoning','Statements & Conclusions'),
  ('MAT','Logical & Analytical Reasoning','Syllogism'),
  ('MAT','Logical & Analytical Reasoning','Coding-Decoding'),
  ('MAT','Logical & Analytical Reasoning','Blood Relations'),
  ('MAT','Logical & Analytical Reasoning','Number & Alphabet Series'),
  ('MAT','Logical & Analytical Reasoning','Puzzles'),
  ('MAT','Logical & Analytical Reasoning','Seating Arrangement'),
  ('MAT','Logical & Analytical Reasoning','Analogy'),
  ('MAT','Logical & Analytical Reasoning','Classification (Odd One Out)'),
  ('MAT','Logical & Analytical Reasoning','Cause & Effect'),
  ('MAT','Logical & Analytical Reasoning','Course of Action'),
  ('MAT','Quantitative Aptitude','Number System'),
  ('MAT','Quantitative Aptitude','Percentages'),
  ('MAT','Quantitative Aptitude','Profit, Loss & Discount'),
  ('MAT','Quantitative Aptitude','Ratio & Proportion'),
  ('MAT','Quantitative Aptitude','Averages'),
  ('MAT','Quantitative Aptitude','Partnership'),
  ('MAT','Quantitative Aptitude','Time, Speed & Distance'),
  ('MAT','Quantitative Aptitude','Time & Work'),
  ('MAT','Quantitative Aptitude','Simple & Compound Interest'),
  ('MAT','Quantitative Aptitude','Algebra'),
  ('MAT','Quantitative Aptitude','Geometry'),
  ('MAT','Quantitative Aptitude','Mensuration'),
  ('MAT','Quantitative Aptitude','Permutation & Combination'),
  ('MAT','Quantitative Aptitude','Probability'),
  ('MAT','Quantitative Aptitude','Trigonometry'),
  ('MAT','Data Interpretation & Data Sufficiency','Tables'),
  ('MAT','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('MAT','Data Interpretation & Data Sufficiency','Line Graphs'),
  ('MAT','Data Interpretation & Data Sufficiency','Pie Charts'),
  ('MAT','Data Interpretation & Data Sufficiency','Caselets'),
  ('MAT','Data Interpretation & Data Sufficiency','Data Sufficiency'),
  ('MAT','Data Interpretation & Data Sufficiency','Data Comparison'),
  ('MAT','General Awareness & Current Affairs','Business & Economy'),
  ('MAT','General Awareness & Current Affairs','Economics'),
  ('MAT','General Awareness & Current Affairs','Current Affairs (National)'),
  ('MAT','General Awareness & Current Affairs','Current Affairs (International)'),
  ('MAT','General Awareness & Current Affairs','Government Schemes & Budget'),
  ('MAT','General Awareness & Current Affairs','Static GK (Capitals, Currencies, Important Days)'),
  ('MAT','General Awareness & Current Affairs','Sports, Awards & Books');

-- ── CAT ───────────────────────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('CAT','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('CAT','Verbal Ability & Reading Comprehension','Para Jumbles'),
  ('CAT','Verbal Ability & Reading Comprehension','Para Summary'),
  ('CAT','Verbal Ability & Reading Comprehension','Odd Sentence Out'),
  ('CAT','Verbal Ability & Reading Comprehension','Sentence Completion'),
  ('CAT','Verbal Ability & Reading Comprehension','Critical Reasoning'),
  ('CAT','Verbal Ability & Reading Comprehension','Grammar & Usage'),
  ('CAT','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('CAT','Data Interpretation & Data Sufficiency','Tables'),
  ('CAT','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('CAT','Data Interpretation & Data Sufficiency','Line Graphs'),
  ('CAT','Data Interpretation & Data Sufficiency','Pie Charts'),
  ('CAT','Data Interpretation & Data Sufficiency','Caselets'),
  ('CAT','Data Interpretation & Data Sufficiency','Mixed & Radar Graphs'),
  ('CAT','Data Interpretation & Data Sufficiency','Data Sufficiency'),
  ('CAT','Logical & Analytical Reasoning','Seating Arrangement'),
  ('CAT','Logical & Analytical Reasoning','Puzzles'),
  ('CAT','Logical & Analytical Reasoning','Blood Relations'),
  ('CAT','Logical & Analytical Reasoning','Venn Diagrams'),
  ('CAT','Logical & Analytical Reasoning','Order & Ranking'),
  ('CAT','Logical & Analytical Reasoning','Coding-Decoding'),
  ('CAT','Logical & Analytical Reasoning','Data Sufficiency (Reasoning)'),
  ('CAT','Quantitative Aptitude','Number System'),
  ('CAT','Quantitative Aptitude','Percentages'),
  ('CAT','Quantitative Aptitude','Profit, Loss & Discount'),
  ('CAT','Quantitative Aptitude','Simple & Compound Interest'),
  ('CAT','Quantitative Aptitude','Ratio & Proportion'),
  ('CAT','Quantitative Aptitude','Averages'),
  ('CAT','Quantitative Aptitude','Mixtures & Alligations'),
  ('CAT','Quantitative Aptitude','Time, Speed & Distance'),
  ('CAT','Quantitative Aptitude','Time & Work'),
  ('CAT','Quantitative Aptitude','Algebra'),
  ('CAT','Quantitative Aptitude','Inequalities'),
  ('CAT','Quantitative Aptitude','Functions'),
  ('CAT','Quantitative Aptitude','Logarithms'),
  ('CAT','Quantitative Aptitude','Surds & Indices'),
  ('CAT','Quantitative Aptitude','Geometry'),
  ('CAT','Quantitative Aptitude','Coordinate Geometry'),
  ('CAT','Quantitative Aptitude','Mensuration'),
  ('CAT','Quantitative Aptitude','Trigonometry'),
  ('CAT','Quantitative Aptitude','Permutation & Combination'),
  ('CAT','Quantitative Aptitude','Probability'),
  ('CAT','Quantitative Aptitude','Set Theory');

-- ── CMAT ──────────────────────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('CMAT','Quantitative Aptitude','Number System'),
  ('CMAT','Quantitative Aptitude','Percentages'),
  ('CMAT','Quantitative Aptitude','Profit, Loss & Discount'),
  ('CMAT','Quantitative Aptitude','Ratio & Proportion'),
  ('CMAT','Quantitative Aptitude','Averages'),
  ('CMAT','Quantitative Aptitude','Partnership'),
  ('CMAT','Quantitative Aptitude','Time, Speed & Distance'),
  ('CMAT','Quantitative Aptitude','Time & Work'),
  ('CMAT','Quantitative Aptitude','Pipes & Cisterns'),
  ('CMAT','Quantitative Aptitude','Simple & Compound Interest'),
  ('CMAT','Quantitative Aptitude','Algebra'),
  ('CMAT','Quantitative Aptitude','Geometry'),
  ('CMAT','Quantitative Aptitude','Mensuration'),
  ('CMAT','Quantitative Aptitude','Permutation & Combination'),
  ('CMAT','Quantitative Aptitude','Probability'),
  ('CMAT','Data Interpretation & Data Sufficiency','Tables'),
  ('CMAT','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('CMAT','Data Interpretation & Data Sufficiency','Line Graphs'),
  ('CMAT','Data Interpretation & Data Sufficiency','Pie Charts'),
  ('CMAT','Data Interpretation & Data Sufficiency','Caselets'),
  ('CMAT','Logical & Analytical Reasoning','Number & Alphabet Series'),
  ('CMAT','Logical & Analytical Reasoning','Coding-Decoding'),
  ('CMAT','Logical & Analytical Reasoning','Blood Relations'),
  ('CMAT','Logical & Analytical Reasoning','Direction Sense'),
  ('CMAT','Logical & Analytical Reasoning','Analogy'),
  ('CMAT','Logical & Analytical Reasoning','Classification (Odd One Out)'),
  ('CMAT','Logical & Analytical Reasoning','Statements & Assumptions'),
  ('CMAT','Logical & Analytical Reasoning','Statements & Arguments'),
  ('CMAT','Logical & Analytical Reasoning','Statements & Conclusions'),
  ('CMAT','Logical & Analytical Reasoning','Syllogism'),
  ('CMAT','Logical & Analytical Reasoning','Seating Arrangement'),
  ('CMAT','Logical & Analytical Reasoning','Puzzles'),
  ('CMAT','Logical & Analytical Reasoning','Cause & Effect'),
  ('CMAT','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('CMAT','Verbal Ability & Reading Comprehension','Grammar & Usage'),
  ('CMAT','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('CMAT','Verbal Ability & Reading Comprehension','Idioms & Phrases'),
  ('CMAT','Verbal Ability & Reading Comprehension','One-Word Substitution'),
  ('CMAT','Verbal Ability & Reading Comprehension','Sentence Correction & Improvement'),
  ('CMAT','Verbal Ability & Reading Comprehension','Para Jumbles'),
  ('CMAT','Verbal Ability & Reading Comprehension','Sentence Completion'),
  ('CMAT','General Awareness & Current Affairs','History'),
  ('CMAT','General Awareness & Current Affairs','Geography'),
  ('CMAT','General Awareness & Current Affairs','Indian Polity & Constitution'),
  ('CMAT','General Awareness & Current Affairs','General Science'),
  ('CMAT','General Awareness & Current Affairs','Current Affairs (National)'),
  ('CMAT','General Awareness & Current Affairs','Current Affairs (International)'),
  ('CMAT','General Awareness & Current Affairs','Business & Economy'),
  ('CMAT','General Awareness & Current Affairs','Sports, Awards & Books'),
  ('CMAT','Innovation & Entrepreneurship','Entrepreneurship Concepts'),
  ('CMAT','Innovation & Entrepreneurship','Startups & Business Models'),
  ('CMAT','Innovation & Entrepreneurship','Innovation & Management Concepts'),
  ('CMAT','Innovation & Entrepreneurship','Entrepreneurial Ecosystem (Funding & Incubation)'),
  ('CMAT','Innovation & Entrepreneurship','Government Schemes for Entrepreneurs'),
  ('CMAT','Innovation & Entrepreneurship','Management Theory Basics');

-- ── GATE (General Aptitude + Engineering Mathematics + CS core) ────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('GATE','Quantitative Aptitude','Number System'),
  ('GATE','Quantitative Aptitude','Percentages'),
  ('GATE','Quantitative Aptitude','Ratio & Proportion'),
  ('GATE','Quantitative Aptitude','Permutation & Combination'),
  ('GATE','Quantitative Aptitude','Probability'),
  ('GATE','Quantitative Aptitude','Geometry'),
  ('GATE','Quantitative Aptitude','Logarithms'),
  ('GATE','Quantitative Aptitude','Surds & Indices'),
  ('GATE','Verbal Ability & Reading Comprehension','Grammar & Usage'),
  ('GATE','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('GATE','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('GATE','Verbal Ability & Reading Comprehension','Sentence Completion'),
  ('GATE','Logical & Analytical Reasoning','Statements & Conclusions'),
  ('GATE','Logical & Analytical Reasoning','Syllogism'),
  ('GATE','Logical & Analytical Reasoning','Verbal Analogies'),
  ('GATE','Logical & Analytical Reasoning','Number & Alphabet Series'),
  ('GATE','Logical & Analytical Reasoning','Non-Verbal Reasoning'),
  ('GATE','Logical & Analytical Reasoning','Spatial Visualization'),
  ('GATE','Engineering Mathematics','Discrete Mathematics'),
  ('GATE','Engineering Mathematics','Linear Algebra'),
  ('GATE','Engineering Mathematics','Calculus'),
  ('GATE','Engineering Mathematics','Probability & Statistics'),
  ('GATE','Computer Science & IT (GATE)','Digital Logic'),
  ('GATE','Computer Science & IT (GATE)','Computer Organization & Architecture'),
  ('GATE','Computer Science & IT (GATE)','Programming & Data Structures'),
  ('GATE','Computer Science & IT (GATE)','Algorithms'),
  ('GATE','Computer Science & IT (GATE)','Theory of Computation'),
  ('GATE','Computer Science & IT (GATE)','Compiler Design'),
  ('GATE','Computer Science & IT (GATE)','Operating System'),
  ('GATE','Computer Science & IT (GATE)','Databases'),
  ('GATE','Computer Science & IT (GATE)','Computer Networks');

-- ── BANK (IBPS PO / SBI PO) ────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('BANK','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('BANK','Verbal Ability & Reading Comprehension','Cloze Test'),
  ('BANK','Verbal Ability & Reading Comprehension','Para Jumbles'),
  ('BANK','Verbal Ability & Reading Comprehension','Error Spotting'),
  ('BANK','Verbal Ability & Reading Comprehension','Sentence Correction & Improvement'),
  ('BANK','Verbal Ability & Reading Comprehension','Fill in the Blanks'),
  ('BANK','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('BANK','Quantitative Aptitude','Simplification & Approximation'),
  ('BANK','Quantitative Aptitude','Number Series'),
  ('BANK','Quantitative Aptitude','Quadratic Equations'),
  ('BANK','Quantitative Aptitude','Percentages'),
  ('BANK','Quantitative Aptitude','Ratio & Proportion'),
  ('BANK','Quantitative Aptitude','Averages'),
  ('BANK','Quantitative Aptitude','Profit, Loss & Discount'),
  ('BANK','Quantitative Aptitude','Simple & Compound Interest'),
  ('BANK','Quantitative Aptitude','Time & Work'),
  ('BANK','Quantitative Aptitude','Time, Speed & Distance'),
  ('BANK','Quantitative Aptitude','Boats & Streams'),
  ('BANK','Quantitative Aptitude','Mixtures & Alligations'),
  ('BANK','Quantitative Aptitude','Partnership'),
  ('BANK','Quantitative Aptitude','Permutation & Combination'),
  ('BANK','Quantitative Aptitude','Probability'),
  ('BANK','Quantitative Aptitude','Mensuration'),
  ('BANK','Data Interpretation & Data Sufficiency','Tables'),
  ('BANK','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('BANK','Data Interpretation & Data Sufficiency','Line Graphs'),
  ('BANK','Data Interpretation & Data Sufficiency','Pie Charts'),
  ('BANK','Data Interpretation & Data Sufficiency','Caselets'),
  ('BANK','Data Interpretation & Data Sufficiency','Missing-Data DI'),
  ('BANK','Data Interpretation & Data Sufficiency','Data Sufficiency'),
  ('BANK','Logical & Analytical Reasoning','Puzzles'),
  ('BANK','Logical & Analytical Reasoning','Seating Arrangement'),
  ('BANK','Logical & Analytical Reasoning','Syllogism'),
  ('BANK','Logical & Analytical Reasoning','Coding-Decoding'),
  ('BANK','Logical & Analytical Reasoning','Blood Relations'),
  ('BANK','Logical & Analytical Reasoning','Direction Sense'),
  ('BANK','Logical & Analytical Reasoning','Coded Inequalities'),
  ('BANK','Logical & Analytical Reasoning','Order & Ranking'),
  ('BANK','Logical & Analytical Reasoning','Number & Alphabet Series'),
  ('BANK','Logical & Analytical Reasoning','Data Sufficiency (Reasoning)'),
  ('BANK','Logical & Analytical Reasoning','Input-Output'),
  ('BANK','General Awareness & Current Affairs','Banking & Financial Awareness'),
  ('BANK','General Awareness & Current Affairs','Current Affairs (National)'),
  ('BANK','General Awareness & Current Affairs','Current Affairs (International)'),
  ('BANK','General Awareness & Current Affairs','Static GK (Capitals, Currencies, Important Days)'),
  ('BANK','General Awareness & Current Affairs','Economics'),
  ('BANK','General Awareness & Current Affairs','Government Schemes & Budget'),
  ('BANK','Computer Aptitude','Computer Fundamentals'),
  ('BANK','Computer Aptitude','Hardware & Software'),
  ('BANK','Computer Aptitude','Operating Systems'),
  ('BANK','Computer Aptitude','MS Office'),
  ('BANK','Computer Aptitude','Networking & Internet'),
  ('BANK','Computer Aptitude','Database Basics'),
  ('BANK','Computer Aptitude','Computer Security'),
  ('BANK','Computer Aptitude','Abbreviations & Terminology');

-- ── SSC (CGL) ──────────────────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('SSC','Logical & Analytical Reasoning','Analogy'),
  ('SSC','Logical & Analytical Reasoning','Classification (Odd One Out)'),
  ('SSC','Logical & Analytical Reasoning','Number & Alphabet Series'),
  ('SSC','Logical & Analytical Reasoning','Coding-Decoding'),
  ('SSC','Logical & Analytical Reasoning','Syllogism'),
  ('SSC','Logical & Analytical Reasoning','Blood Relations'),
  ('SSC','Logical & Analytical Reasoning','Direction Sense'),
  ('SSC','Logical & Analytical Reasoning','Venn Diagrams'),
  ('SSC','Logical & Analytical Reasoning','Non-Verbal Reasoning'),
  ('SSC','Logical & Analytical Reasoning','Decision Making'),
  ('SSC','Logical & Analytical Reasoning','Statements & Conclusions'),
  ('SSC','General Awareness & Current Affairs','History'),
  ('SSC','General Awareness & Current Affairs','Geography'),
  ('SSC','General Awareness & Current Affairs','Indian Polity & Constitution'),
  ('SSC','General Awareness & Current Affairs','Economics'),
  ('SSC','General Awareness & Current Affairs','General Science'),
  ('SSC','General Awareness & Current Affairs','Current Affairs (National)'),
  ('SSC','General Awareness & Current Affairs','Static GK (Capitals, Currencies, Important Days)'),
  ('SSC','General Awareness & Current Affairs','Sports, Awards & Books'),
  ('SSC','Quantitative Aptitude','Number System'),
  ('SSC','Quantitative Aptitude','Simplification & Approximation'),
  ('SSC','Quantitative Aptitude','Percentages'),
  ('SSC','Quantitative Aptitude','Ratio & Proportion'),
  ('SSC','Quantitative Aptitude','Averages'),
  ('SSC','Quantitative Aptitude','Profit, Loss & Discount'),
  ('SSC','Quantitative Aptitude','Partnership'),
  ('SSC','Quantitative Aptitude','Simple & Compound Interest'),
  ('SSC','Quantitative Aptitude','Time & Work'),
  ('SSC','Quantitative Aptitude','Time, Speed & Distance'),
  ('SSC','Quantitative Aptitude','Mixtures & Alligations'),
  ('SSC','Quantitative Aptitude','Algebra'),
  ('SSC','Quantitative Aptitude','Geometry'),
  ('SSC','Quantitative Aptitude','Mensuration'),
  ('SSC','Quantitative Aptitude','Trigonometry'),
  ('SSC','Quantitative Aptitude','Heights & Distances'),
  ('SSC','Data Interpretation & Data Sufficiency','Tables'),
  ('SSC','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('SSC','Data Interpretation & Data Sufficiency','Line Graphs'),
  ('SSC','Data Interpretation & Data Sufficiency','Pie Charts'),
  ('SSC','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('SSC','Verbal Ability & Reading Comprehension','Cloze Test'),
  ('SSC','Verbal Ability & Reading Comprehension','Error Spotting'),
  ('SSC','Verbal Ability & Reading Comprehension','Fill in the Blanks'),
  ('SSC','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('SSC','Verbal Ability & Reading Comprehension','Spellings'),
  ('SSC','Verbal Ability & Reading Comprehension','Idioms & Phrases'),
  ('SSC','Verbal Ability & Reading Comprehension','One-Word Substitution'),
  ('SSC','Verbal Ability & Reading Comprehension','Para Jumbles'),
  ('SSC','Verbal Ability & Reading Comprehension','Active-Passive Voice'),
  ('SSC','Verbal Ability & Reading Comprehension','Direct-Indirect Speech'),
  ('SSC','Computer Aptitude','Computer Fundamentals'),
  ('SSC','Computer Aptitude','MS Office'),
  ('SSC','Computer Aptitude','Networking & Internet'),
  ('SSC','Computer Aptitude','Computer Security');

-- ── GRE (General Test) ─────────────────────────────────────────────────────────
insert into _seed_links (exam_code, subject, chapter) values
  ('GRE','Analytical Writing','Analyze an Issue'),
  ('GRE','Verbal Ability & Reading Comprehension','Reading Comprehension'),
  ('GRE','Verbal Ability & Reading Comprehension','Text Completion'),
  ('GRE','Verbal Ability & Reading Comprehension','Sentence Equivalence'),
  ('GRE','Verbal Ability & Reading Comprehension','Vocabulary (Synonyms & Antonyms)'),
  ('GRE','Verbal Ability & Reading Comprehension','Critical Reasoning'),
  ('GRE','Quantitative Aptitude','Number System'),
  ('GRE','Quantitative Aptitude','Percentages'),
  ('GRE','Quantitative Aptitude','Ratio & Proportion'),
  ('GRE','Quantitative Aptitude','Averages'),
  ('GRE','Quantitative Aptitude','Surds & Indices'),
  ('GRE','Quantitative Aptitude','Algebra'),
  ('GRE','Quantitative Aptitude','Inequalities'),
  ('GRE','Quantitative Aptitude','Functions'),
  ('GRE','Quantitative Aptitude','Coordinate Geometry'),
  ('GRE','Quantitative Aptitude','Geometry'),
  ('GRE','Quantitative Aptitude','Mensuration'),
  ('GRE','Quantitative Aptitude','Permutation & Combination'),
  ('GRE','Quantitative Aptitude','Probability'),
  ('GRE','Quantitative Aptitude','Mean, Median & Mode'),
  ('GRE','Quantitative Aptitude','Standard Deviation & Variance'),
  ('GRE','Data Interpretation & Data Sufficiency','Tables'),
  ('GRE','Data Interpretation & Data Sufficiency','Bar Graphs'),
  ('GRE','Data Interpretation & Data Sufficiency','Line Graphs'),
  ('GRE','Data Interpretation & Data Sufficiency','Pie Charts');

-- ── 1) canonical subjects (derived from the links) ─────────────────────────────
insert into public.subject (name)
select distinct subject from _seed_links
on conflict do nothing;

-- ── 2) chapters under each subject (derived from the links) ────────────────────
insert into public.chapter (subject_id, name)
select distinct s.id, l.chapter
from _seed_links l
join public.subject s on lower(s.name) = lower(l.subject)
on conflict do nothing;

-- ── 3) exam → subject links (sort_order from the canonical subject order) ───────
insert into public.competitive_exam_subject (competitive_exam_id, subject_id, sort_order)
select distinct e.id, s.id, coalesce(ord.n, 99)
from _seed_links l
join public.competitive_exam e on e.code = l.exam_code
join public.subject s on lower(s.name) = lower(l.subject)
left join (values
  ('Quantitative Aptitude', 1),
  ('Data Interpretation & Data Sufficiency', 2),
  ('Logical & Analytical Reasoning', 3),
  ('Verbal Ability & Reading Comprehension', 4),
  ('General Awareness & Current Affairs', 5),
  ('Computer Aptitude', 6),
  ('Innovation & Entrepreneurship', 7),
  ('Analytical Writing', 8),
  ('Engineering Mathematics', 9),
  ('Computer Science & IT (GATE)', 10)
) ord(subject, n) on lower(ord.subject) = lower(l.subject)
on conflict do nothing;

-- ── 4) exam → subject → chapter links ──────────────────────────────────────────
insert into public.competitive_exam_subject_chapter (competitive_exam_id, subject_id, chapter_id)
select distinct e.id, s.id, c.id
from _seed_links l
join public.competitive_exam e on e.code = l.exam_code
join public.subject s on lower(s.name) = lower(l.subject)
join public.chapter c on c.subject_id = s.id and lower(c.name) = lower(l.chapter)
on conflict do nothing;

-- ── 5) descriptions ────────────────────────────────────────────────────────────
update public.competitive_exam ce set description = d.descr
from (values
  ('ICET', 'AP/TS Integrated Common Entrance Test — a state-level test (APSCHE/TGCHE) for admission to MBA and MCA programmes across Andhra Pradesh and Telangana. 200 questions in 150 minutes across Analytical Ability, Mathematical Ability and Communication Ability; no negative marking. Taken by graduates seeking PG management or computer-application seats in the two states.'),
  ('MAT', 'Management Aptitude Test — a national MBA entrance conducted by the All India Management Association (AIMA), offered several times a year in paper, computer and remote-proctored modes. 150 questions in 120 minutes across five sections (0.25 negative marking); under MAT 2.0 (2024) the fifth section is Economic & Business Environment, scored separately by most schools. Accepted by hundreds of B-schools for MBA/PGDM admission.'),
  ('CAT', 'Common Admission Test — India''s premier MBA entrance, conducted annually by the IIMs and the gateway to the IIMs and top B-schools. A ~2-hour computer-based test with three sectionally-timed sections (VARC, DILR, QA) and negative marking on MCQs. Taken by graduates for flagship MBA/PGP programmes.'),
  ('CMAT', 'Common Management Admission Test — a national computer-based MBA entrance by the National Testing Agency (NTA) for AICTE-approved management programmes. 100 questions / 400 marks in 180 minutes across five sections of 20 (-1 negative marking), including a mandatory Innovation & Entrepreneurship section. Accepted by numerous B-schools.'),
  ('GATE', 'Graduate Aptitude Test in Engineering — a national exam by IISc Bengaluru and the IITs testing undergraduate engineering/science depth, used for M.Tech/PhD admission and PSU recruitment. Every paper carries General Aptitude (15 marks) plus the discipline''s Engineering Mathematics and core subjects (Computer Science & IT shown here; other disciplines are added similarly).'),
  ('BANK', 'Bank Probationary Officer recruitment (IBPS PO / SBI PO) — national officer-recruitment exams selecting graduates as Probationary Officers via Prelims, Mains and Interview. The IBPS and SBI syllabi are near-identical (SBI adds a Group Exercise & Interview stage). Covers reasoning, quantitative aptitude, English, data interpretation, general/banking awareness and computer aptitude.'),
  ('SSC', 'Staff Selection Commission — Combined Graduate Level (SSC CGL) — recruits graduates into Group B and C central-government posts (e.g. Income Tax Inspector, Assistant Section Officer, Auditor) via Tier 1 and Tier 2. Tier 1 has four sections: General Intelligence & Reasoning, General Awareness, Quantitative Aptitude and English Comprehension.'),
  ('GRE', 'Graduate Record Examinations (General Test) — a standardized graduate-admissions test administered worldwide by ETS, used for Master''s/PhD and many business programmes. The current shorter test runs about 1 hour 58 minutes across Analytical Writing (Analyze an Issue), Verbal Reasoning and Quantitative Reasoning. Taken by graduates applying mainly to the US, Canada and Europe.')
) d(code, descr)
where ce.code = d.code;

end $$;
