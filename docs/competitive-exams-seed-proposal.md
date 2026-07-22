# Competitive Exams — seed proposal (for review)

**Status:** proposal, awaiting review. On approval this becomes a seed migration
(`126_competitive_exam_seed.sql`) that sets each exam's **description** and
**syllabus** (subjects + chapters), reusing the shared `subject` / `chapter`
taxonomy. Nothing has been seeded yet.

**Accuracy:** independently fact-checked against official + reputable education
sources. Confirmed accurate: ICET (incl. the 75/75/50 split), CAT, CMAT, GATE CS,
SSC CGL, GRE (current shorter test — Analytical Writing is *Analyze an Issue* only).
Corrections applied below: **MAT** section 5 renamed to *Economic & Business
Environment* (AIMA "MAT 2.0", May 2024) at **120 min**; **CMAT** total = 400 marks.
Note: **BANK** covers IBPS PO & SBI PO — syllabus is ~identical but their exam
patterns differ (SBI adds a Group Exercise & Interview stage); we seed the shared
syllabus, not per-exam mark tables.

## How the syllabus maps to the schema
Syllabus lives on the exam via `competitive_exam_subject` + `competitive_exam_subject_chapter`,
which reference the shared `subject` / `chapter` tables. So we use a **canonical
subject set** (below): a subject like *Quantitative Aptitude* is **one** row, its
topics are **one** set of `chapter` rows, and each exam **links the subset** it
tests. This is the intended design — the same subject carries different depth per
exam. The seed upserts subjects/chapters **by name** (idempotent), so shared
topics collapse to shared rows automatically.

> **Decision needed (Q):** your DB already has some subjects (e.g. *Arithmetic*,
> *English*, *Reasoning* from the exam module). Do you want this seed to (a)
> **create the canonical set below** as new subjects (recommended — cleanly scoped
> to competitive-exam prep), or (b) **map onto/reuse the existing** subject names
> where they overlap? The seed dedupes by name, so if a canonical name already
> exists it's reused; brand-new ones are created.

---

## Canonical subjects & their full chapter sets (the superset)

**QA — Quantitative Aptitude**
Number System · LCM & HCF · Surds & Indices · Simplification & Approximation ·
Percentages · Ratio & Proportion · Averages · Partnership · Mixtures & Alligations ·
Profit, Loss & Discount · Simple & Compound Interest · Time & Work · Pipes & Cisterns ·
Time, Speed & Distance · Boats & Streams · Number Series · Quadratic Equations ·
Progressions (AP & GP) · Permutation & Combination · Probability · Set Theory ·
Algebra · Inequalities · Functions · Logarithms · Geometry · Coordinate Geometry ·
Mensuration (Areas & Volumes) · Trigonometry · Heights & Distances ·
Matrices & Determinants · Limits & Derivatives (basic) · Frequency Distributions ·
Mean, Median & Mode · Standard Deviation & Variance · Correlation

**DI — Data Interpretation & Data Sufficiency**
Tables · Bar Graphs · Line Graphs · Pie Charts · Caselets · Mixed & Radar Graphs ·
Missing-Data DI · Data Sufficiency · Data Comparison

**LR — Logical & Analytical Reasoning**
Number & Alphabet Series · Analogy · Classification (Odd One Out) · Coding–Decoding ·
Blood Relations · Direction Sense · Order & Ranking · Seating Arrangement (Linear/Circular) ·
Puzzles · Syllogism · Coded Inequalities · Input–Output · Statements & Assumptions ·
Statements & Arguments · Statements & Conclusions · Cause & Effect · Course of Action ·
Decision Making · Venn Diagrams · Clocks & Calendars · Data Sufficiency (Reasoning) ·
Non-Verbal Reasoning (Mirror/Water Images, Paper Folding, Embedded Figures) ·
Spatial Visualization

**VA — Verbal Ability & Reading Comprehension**
Reading Comprehension · Vocabulary (Synonyms & Antonyms) · Idioms & Phrases ·
One-Word Substitution · Spellings · Grammar & Usage · Error Spotting ·
Sentence Correction / Improvement · Sentence Completion · Fill in the Blanks ·
Cloze Test · Para Jumbles · Para Summary · Odd Sentence Out · Sentence Equivalence ·
Text Completion · Critical Reasoning · Active–Passive Voice · Direct–Indirect Speech ·
Verbal Analogies · Business & Computer Terminology

**GA — General Awareness & Current Affairs**
Current Affairs (National) · Current Affairs (International) · History · Geography ·
Indian Polity & Constitution · Economics · General Science ·
Banking & Financial Awareness · Business & Economy ·
Static GK (Capitals, Currencies, Important Days) · Sports, Awards & Books ·
Government Schemes & Budget

**CP — Computer Aptitude**
Computer Fundamentals · Hardware & Software · Operating Systems · MS Office ·
Networking & Internet · Database Basics · Computer Security · Abbreviations & Terminology

**IE — Innovation & Entrepreneurship**
Entrepreneurship Concepts · Startups & Business Models · Innovation & Management Concepts ·
Entrepreneurial Ecosystem (Funding & Incubation) · Government Schemes for Entrepreneurs ·
Management Theory Basics

**AW — Analytical Writing**
Analyze an Issue

**EM — Engineering Mathematics (GATE)**
Discrete Mathematics · Linear Algebra · Calculus · Probability & Statistics

**CS — Computer Science & IT (GATE)**
Digital Logic · Computer Organization & Architecture · Programming & Data Structures ·
Algorithms · Theory of Computation · Compiler Design · Operating System · Databases ·
Computer Networks

---

## Per-exam: description + syllabus (subject → chapters it links)

### ICET — AP/TS Integrated Common Entrance Test
State-level test (APSCHE/TGCHE, via Andhra/Osmania/Kakatiya University) for MBA & MCA
admission across Andhra Pradesh and Telangana. 200 questions / 150 minutes assessing
analytical, mathematical and communication ability; taken by graduates seeking PG
management/computer-application seats in the two states.
- **QA:** Number System, LCM & HCF, Surds & Indices, Ratio & Proportion, Percentages, Profit Loss & Discount, Partnership, Time & Work, Pipes & Cisterns, Time Speed & Distance, Simple & Compound Interest, Mensuration, Algebra, Progressions (AP & GP), Matrices & Determinants, Limits & Derivatives (basic), Geometry, Coordinate Geometry, Trigonometry, Heights & Distances, Set Theory, Frequency Distributions, Mean Median & Mode, Standard Deviation & Variance, Correlation, Probability
- **LR:** Number & Alphabet Series, Analogy, Classification (Odd One Out), Coding–Decoding, Blood Relations, Seating Arrangement (Linear/Circular), Clocks & Calendars, Data Sufficiency (Reasoning)
- **DI:** Tables, Bar Graphs, Pie Charts, Venn Diagrams, Caselets
- **VA:** Vocabulary (Synonyms & Antonyms), Grammar & Usage, Reading Comprehension, Business & Computer Terminology

### MAT — Management Aptitude Test (AIMA)
National MBA entrance by the All India Management Association, offered several times a
year (paper/computer/remote-proctored). 150 questions / 200 marks in 120 minutes across
five sections (0.25 negative marking); scores accepted by hundreds of B-schools for
MBA/PGDM admission. Under AIMA's "MAT 2.0" (May 2024) the fifth section is **Economic &
Business Environment** (scored separately — excluded from the composite percentile most
schools use).
- **VA:** Reading Comprehension, Vocabulary (Synonyms & Antonyms), Idioms & Phrases, One-Word Substitution, Grammar & Usage, Error Spotting, Sentence Correction / Improvement, Fill in the Blanks, Para Jumbles, Verbal Analogies
- **LR:** Statements & Arguments, Statements & Assumptions, Statements & Conclusions, Syllogism, Coding–Decoding, Blood Relations, Number & Alphabet Series, Puzzles, Seating Arrangement (Linear/Circular), Analogy, Classification (Odd One Out), Cause & Effect, Course of Action
- **QA:** Number System, Percentages, Profit Loss & Discount, Ratio & Proportion, Averages, Partnership, Time Speed & Distance, Time & Work, Simple & Compound Interest, Algebra, Geometry, Mensuration, Permutation & Combination, Probability, Trigonometry
- **DI:** Tables, Bar Graphs, Line Graphs, Pie Charts, Caselets, Data Sufficiency, Data Comparison
- **GA** *(Economic & Business Environment):* Business & Economy, Economics, Current Affairs (National), Current Affairs (International), Government Schemes & Budget, Static GK (Capitals, Currencies, Important Days), Sports Awards & Books

### CAT — Common Admission Test (IIMs)
India's premier MBA entrance, conducted annually by the IIMs (rotating), gateway to the
IIMs and top B-schools (FMS, SPJIMR, MDI, IITs…). ~2-hour computer-based test with three
sectionally-timed sections and negative marking; taken by graduates for flagship MBA/PGP
programmes.
- **VA:** Reading Comprehension, Para Jumbles, Para Summary, Odd Sentence Out, Sentence Completion, Critical Reasoning, Grammar & Usage, Vocabulary (Synonyms & Antonyms)
- **DI:** Tables, Bar Graphs, Line Graphs, Pie Charts, Caselets, Mixed & Radar Graphs, Data Sufficiency
- **LR:** Seating Arrangement (Linear/Circular), Puzzles, Blood Relations, Venn Diagrams, Order & Ranking, Coding–Decoding, Data Sufficiency (Reasoning)
- **QA:** Number System, Percentages, Profit Loss & Discount, Simple & Compound Interest, Ratio & Proportion, Averages, Mixtures & Alligations, Time Speed & Distance, Time & Work, Algebra, Inequalities, Functions, Logarithms, Surds & Indices, Geometry, Coordinate Geometry, Mensuration, Trigonometry, Permutation & Combination, Probability, Set Theory

### CMAT — Common Management Admission Test (NTA)
National computer-based MBA entrance by the National Testing Agency for AICTE-approved
management programmes. 100 questions / 400 marks in 180 minutes across five sections
(20 each, 4 marks per question, −1 negative marking); accepted by numerous B-schools.
- **QA:** Number System, Percentages, Profit Loss & Discount, Ratio & Proportion, Averages, Partnership, Time Speed & Distance, Time & Work, Pipes & Cisterns, Simple & Compound Interest, Algebra, Geometry, Mensuration, Permutation & Combination, Probability
- **DI:** Tables, Bar Graphs, Line Graphs, Pie Charts, Caselets
- **LR:** Number & Alphabet Series, Coding–Decoding, Blood Relations, Direction Sense, Analogy, Classification (Odd One Out), Statements & Assumptions, Statements & Arguments, Statements & Conclusions, Syllogism, Seating Arrangement (Linear/Circular), Puzzles, Cause & Effect
- **VA:** Reading Comprehension, Grammar & Usage, Vocabulary (Synonyms & Antonyms), Idioms & Phrases, One-Word Substitution, Sentence Correction / Improvement, Para Jumbles, Sentence Completion
- **GA:** History, Geography, Indian Polity & Constitution, General Science, Current Affairs (National), Current Affairs (International), Business & Economy, Sports Awards & Books
- **IE:** Entrepreneurship Concepts, Startups & Business Models, Innovation & Management Concepts, Entrepreneurial Ecosystem (Funding & Incubation), Government Schemes for Entrepreneurs, Management Theory Basics

### GATE — Graduate Aptitude Test in Engineering
National exam by IISc Bengaluru and the IITs (rotating), testing undergraduate
engineering/science depth; scores used for M.Tech/PhD admission and PSU recruitment.
Every paper has General Aptitude (15 marks) + the discipline's Engineering Mathematics +
core subjects. **Shown here with Computer Science & IT as the example discipline — other
disciplines (ME, EE, ECE, CE…) would be added the same way, each as its own subject.**
- **QA** *(General Aptitude — quant part):* Data Interpretation via DI subject, Number System, Percentages, Ratio & Proportion, Permutation & Combination, Probability, Geometry, Logarithms, Surds & Indices
- **VA** *(General Aptitude — verbal part):* Grammar & Usage, Vocabulary (Synonyms & Antonyms), Reading Comprehension, Sentence Completion
- **LR** *(General Aptitude — analytical/spatial):* Statements & Conclusions, Syllogism, Verbal Analogies, Number & Alphabet Series, Non-Verbal Reasoning, Spatial Visualization
- **EM:** Discrete Mathematics, Linear Algebra, Calculus, Probability & Statistics
- **CS:** Digital Logic, Computer Organization & Architecture, Programming & Data Structures, Algorithms, Theory of Computation, Compiler Design, Operating System, Databases, Computer Networks

### BANK — IBPS PO / SBI PO (bank officer recruitment)
National bank-officer recruitment: IBPS PO (Institute of Banking Personnel Selection, for
public-sector banks) and SBI PO (State Bank of India). Graduates are selected as
Probationary Officers via Prelims → Mains → Interview/GD; the two syllabi are ~90% identical.
- **VA:** Reading Comprehension, Cloze Test, Para Jumbles, Error Spotting, Sentence Correction / Improvement, Fill in the Blanks, Vocabulary (Synonyms & Antonyms)
- **QA:** Simplification & Approximation, Number Series, Quadratic Equations, Percentages, Ratio & Proportion, Averages, Profit Loss & Discount, Simple & Compound Interest, Time & Work, Time Speed & Distance, Boats & Streams, Mixtures & Alligations, Partnership, Permutation & Combination, Probability, Mensuration
- **DI:** Tables, Bar Graphs, Line Graphs, Pie Charts, Caselets, Missing-Data DI, Data Sufficiency
- **LR:** Puzzles, Seating Arrangement (Linear/Circular), Syllogism, Coding–Decoding, Blood Relations, Direction Sense, Coded Inequalities, Order & Ranking, Number & Alphabet Series, Data Sufficiency (Reasoning), Input–Output
- **GA:** Banking & Financial Awareness, Current Affairs (National), Current Affairs (International), Static GK (Capitals, Currencies, Important Days), Economics, Government Schemes & Budget
- **CP:** Computer Fundamentals, Hardware & Software, Operating Systems, MS Office, Networking & Internet, Database Basics, Computer Security, Abbreviations & Terminology

### SSC — Staff Selection Commission (SSC CGL)
Conducted by the Staff Selection Commission to recruit graduates into Group B & C central
government posts (Income Tax Inspector, Assistant Section Officer, Auditor…). Selection via
Tier 1 (screening) → Tier 2 (mains).
- **LR:** Analogy, Classification (Odd One Out), Number & Alphabet Series, Coding–Decoding, Syllogism, Blood Relations, Direction Sense, Venn Diagrams, Non-Verbal Reasoning, Decision Making, Statements & Conclusions
- **GA:** History, Geography, Indian Polity & Constitution, Economics, General Science, Current Affairs (National), Static GK (Capitals, Currencies, Important Days), Sports Awards & Books
- **QA:** Number System, Simplification & Approximation, Percentages, Ratio & Proportion, Averages, Profit Loss & Discount, Partnership, Simple & Compound Interest, Time & Work, Time Speed & Distance, Mixtures & Alligations, Algebra, Geometry, Mensuration, Trigonometry, Heights & Distances
- **DI:** Tables, Bar Graphs, Line Graphs, Pie Charts
- **VA:** Reading Comprehension, Cloze Test, Error Spotting, Fill in the Blanks, Vocabulary (Synonyms & Antonyms), Spellings, Idioms & Phrases, One-Word Substitution, Para Jumbles, Active–Passive Voice, Direct–Indirect Speech
- **CP:** Computer Fundamentals, MS Office, Networking & Internet, Computer Security *(Tier 2 module)*

### GRE — Graduate Record Examinations (General Test)
Standardized graduate-admissions test administered worldwide by ETS, used for Master's/PhD
and many business programmes. The current shorter test runs ~1h 58m across three measures;
reasoning measures scored 130–170, writing 0–6. Taken by graduates applying mainly to the
US, Canada and Europe.
- **AW:** Analyze an Issue
- **VA:** Reading Comprehension, Text Completion, Sentence Equivalence, Vocabulary (Synonyms & Antonyms), Critical Reasoning
- **QA:** Number System, Percentages, Ratio & Proportion, Averages, Surds & Indices, Algebra, Inequalities, Functions, Coordinate Geometry, Geometry, Mensuration, Permutation & Combination, Probability, Mean Median & Mode, Standard Deviation & Variance
- **DI:** Tables, Bar Graphs, Line Graphs, Pie Charts

---

## Sources
Official bodies + reputable education sites (AP/TS ICET, AIMA MAT, IIM CAT, NTA CMAT,
GATE/IITR, IBPS/SBI, SSC, ETS GRE); see shiksha / careers360 / mbauniverse / testbook /
adda247 / geeksforgeeks / magoosh for syllabus outlines.
