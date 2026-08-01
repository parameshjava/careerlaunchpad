# Exam paper → assessment question bank: extraction spec

A reusable, **format-agnostic** procedure for turning **one** exam question-paper PDF —
ICET, MAT, XAT, CAT, GATE, bank/SSC, or any MCQ paper — into **one** importable
assessment JSON file. The output is the platform's "all-subjects" import format: a single
file per paper in which **every question carries its own `subject` and `chapter`**, so a
mixed paper does not need to be split.

- **Schema (authoritative):** [`assessment-import.schema.json`](./assessment-import.schema.json)
- **Worked sample:** [`assessment-import.sample.json`](./assessment-import.sample.json)
- ICET-specific tooling (deterministic key reader, per-subject variant, taxonomy from
  migration 126) lives in [`icet/`](./icet/) — use it for ICET papers; this spec is the
  general playbook every format follows.

---

## 1. The output: one file per paper

Write exactly one JSON file per paper:

```
question-imports/<exam>/papers/<paper-slug>.json      # e.g. icet/papers/ts-icet-2024-06-05-s1.json
```

`<exam>` is the format folder (`icet`, `mat`, `xat`, …). `<paper-slug>` is a stable id:
`<board>-<exam>-<yyyy>-<mm>-<dd>-s<shift>` (lowercase), e.g. `ts-icet-2024-06-05-s1`,
`xat-2024-01-07-s1`. The file is the **all-subjects** shape — no top-level `subject`:

```jsonc
{
  "questions": [
    {
      "subject":  "<one of the 13 subjects in §3>",
      "chapter":  "<a chapter of THAT subject in §3>",
      "kind":     "standard",            // or "data_sufficiency"
      "difficulty": "easy",              // easy | medium | hard | very_hard
      "answer_type": "single",           // single | multi
      "stem": "Question text. Markdown + LaTeX ($…$). Self-contained.",
      "explanation": "Authored worked solution (required).",
      "source": "TS ICET",
      "source_year": 2024,
      "options": [
        { "label": "…", "is_correct": true  },
        { "label": "…", "is_correct": false },
        { "label": "…", "is_correct": false },
        { "label": "…", "is_correct": false }
      ]
    }
  ]
}
```

### Field rules (enforced by the schema + importer)
- **`subject`** — must be one of the 13 subjects in §3 (exact string).
- **`chapter`** — must be a chapter **of that subject** in §3 (exact string). Unknown
  subject/chapter is reported, not created.
- **`kind`** — `standard` (default) or `data_sufficiency` (statement-sufficiency items).
- **`difficulty`** — `easy` | `medium` | `hard` | `very_hard`.
- **`answer_type`** — `single` ⇒ **exactly one** option `is_correct: true`; `multi` ⇒ one
  or more.
- **`stem`** — required, Markdown + LaTeX. **Self-contained** (see §4).
- **`explanation`** — **required**, authored (the papers carry no solutions); teach the
  method and why the right option is right.
- **`source` / `source_year`** — on **every** question. `source` is the **exam name only**
  (e.g. `"TS ICET"`, `"MAT"`, `"XAT"`) — the year lives in `source_year`, and shift/date
  belong in the `<paper-slug>`, so don't repeat them here.
- **`options`** — 4 or 5, each a non-empty `label` + boolean `is_correct`.
- No other fields except optional `stem_image_url`. The importer dedupes on
  **`(chapter, stem)`**, so two questions with the same chapter and stem collide and one is
  dropped — keep stems distinct and self-contained.

A copy-paste starting point with one question per kind is in
[`assessment-import.sample.json`](./assessment-import.sample.json).

---

## 2. Procedure (per paper)

1. **Identify the paper.** Read its metadata and first page; fix `source`, `source_year`,
   and the `<paper-slug>`.
   ```bash
   pdfinfo -meta "<pdf>"; pdftotext -f 1 -l 1 "<pdf>" - | head -40
   ```
2. **Decide how the paper is rendered** and pick the read path:
   - **Image-export papers** (TCS-iON "Question Paper Preview" — most ICET/bank papers):
     stems/options are **images**; the text layer holds only metadata. Render pages and
     read them visually:
     ```bash
     pdftoppm -png -r 150 "<pdf>" pg/p        # → pg/p-001.png …  (200–220 dpi for dense figures)
     ```
   - **Text papers** (many MAT/XAT/CAT PDFs): the text layer is real —
     `pdftotext -layout` may be enough; still render pages to confirm figures/options.
3. **Map question number → page** so nothing is missed (works even for image papers):
   ```bash
   pdftotext -layout "<pdf>" - | awk 'BEGIN{p=1}/\f/{p++}
     /(Question Number|Q\.?[0-9])/{print $0" -> page "p}'
   ```
4. **Read the answer key — then verify it** (§5). This is the single most important step.
5. **Transcribe + classify + solve** each question (§3, §4): English stem, options,
   subject+chapter, authored explanation, and the answer **you** derived. **Work in
   batches of ≤25 questions** (or one section at a time) and **write each batch to the
   file before starting the next** — never assemble a whole ~200-question paper in a
   single model response. Small, incremental writes keep any output content-filter block
   (§7) contained to one batch instead of losing the entire paper.
6. **Assemble one file**, `question-imports/<exam>/papers/<paper-slug>.json`, and
   **validate** (§6). Log every excluded question with its reason.

---

## 3. Subject + chapter taxonomy (classification authority)

Pick the **subject** from the section/topic heading the paper prints, then the **chapter**
from what the question actually tests. Use these **exact** strings (from
`assessment-import.schema.json`; the importer resolves by name):

| Subject | Chapters |
| --- | --- |
| **Analytical Writing** | Analyze an Issue |
| **Arithmetic** | Alligation or Mixture · Area · Average · Banker's Discount · Boats and Streams · Calendar · Chain Rule · Clocks · Compound Interest · Decimal Fractions · H.C.F. and L.C.M. of Numbers · Heights and Distances · Logarithms · Number System · Odd Man Out and Series · Partnership · Percentage · Permutations and Combinations · Pipes and Cisterns · Probability · Problems on Ages · Problems on Numbers · Problems on Trains · Profit and Loss · Races and Games of Skill · Ratio and Proportion · Simple Interest · Simplification · Square Roots and Cube Roots · Stocks and Shares · Surds and Indices · Time and Distance · Time and Work · True Discount · Volume and Surface Area |
| **Computer Aptitude** | Abbreviations & Terminology · Computer Fundamentals · Computer Security · Database Basics · Hardware & Software · MS Office · Networking & Internet · Operating Systems |
| **Computer Science & IT (GATE)** | Algorithms · Compiler Design · Computer Networks · Computer Organization & Architecture · Databases · Digital Logic · Operating System · Programming & Data Structures · Theory of Computation |
| **Data Interpretation & Data Sufficiency** | Bar Graphs · Caselets · Data Comparison · Data Sufficiency · Line Graphs · Missing-Data DI · Mixed & Radar Graphs · Pie Charts · Tables |
| **Engineering Mathematics** | Calculus · Discrete Mathematics · Linear Algebra · Probability & Statistics |
| **English** | Antonyms · Fill in the Blanks · Idioms and Phrases · One Word Substitution · Reading Comprehension · Sentence Improvement · Spotting Errors · Synonyms |
| **General Awareness & Current Affairs** | Banking & Financial Awareness · Business & Economy · Current Affairs (International) · Current Affairs (National) · Economics · General Science · Geography · Government Schemes & Budget · History · Indian Polity & Constitution · Sports, Awards & Books · Static GK (Capitals, Currencies, Important Days) |
| **Innovation & Entrepreneurship** | Entrepreneurial Ecosystem (Funding & Incubation) · Entrepreneurship Concepts · Government Schemes for Entrepreneurs · Innovation & Management Concepts · Management Theory Basics · Startups & Business Models |
| **Logical & Analytical Reasoning** | Analogy · Blood Relations · Cause & Effect · Classification (Odd One Out) · Clocks & Calendars · Coded Inequalities · Coding-Decoding · Course of Action · Data Sufficiency (Reasoning) · Decision Making · Direction Sense · Input-Output · Non-Verbal Reasoning · Number & Alphabet Series · Order & Ranking · Puzzles · Seating Arrangement · Spatial Visualization · Statements & Arguments · Statements & Assumptions · Statements & Conclusions · Syllogism · Venn Diagrams · Verbal Analogies |
| **Quantitative Aptitude** | Algebra · Averages · Boats & Streams · Coordinate Geometry · Correlation · Frequency Distributions · Functions · Geometry · Heights & Distances · Inequalities · LCM & HCF · Limits & Derivatives · Logarithms · Matrices & Determinants · Mean, Median & Mode · Mensuration · Mixtures & Alligations · Number Series · Number System · Partnership · Percentages · Permutation & Combination · Pipes & Cisterns · Probability · Profit, Loss & Discount · Progressions (AP & GP) · Quadratic Equations · Ratio & Proportion · Set Theory · Simple & Compound Interest · Simplification & Approximation · Standard Deviation & Variance · Surds & Indices · Time & Work · Time, Speed & Distance · Trigonometry |
| **Reasoning** | Analogy · Blood Relations · Classification · Coding and Decoding · Direction Sense · Letter Series · Number Series · Syllogism |
| **Verbal Ability & Reading Comprehension** | Active-Passive Voice · Business & Computer Terminology · Cloze Test · Critical Reasoning · Direct-Indirect Speech · Error Spotting · Fill in the Blanks · Grammar & Usage · Idioms & Phrases · Odd Sentence Out · One-Word Substitution · Para Jumbles · Para Summary · Reading Comprehension · Sentence Completion · Sentence Correction & Improvement · Sentence Equivalence · Spellings · Text Completion · Verbal Analogies · Vocabulary (Synonyms & Antonyms) |

### Choosing the subject when several fit
Several subjects overlap (Arithmetic ⊂ Quantitative Aptitude; English ⊂ Verbal Ability &
Reading Comprehension; Reasoning ⊂ Logical & Analytical Reasoning). **Follow the paper's own
section family**, and be consistent within a paper:

- **ICET** → Analytical Ability = *Logical & Analytical Reasoning* (data-table items →
  *Data Interpretation & Data Sufficiency*); Mathematical Ability = *Quantitative Aptitude*;
  Communication Ability = *Verbal Ability & Reading Comprehension*.
- **MAT** → Intelligence & Critical Reasoning = *Logical & Analytical Reasoning*; Data
  Analysis & Sufficiency = *Data Interpretation & Data Sufficiency*; Mathematical Skills =
  *Quantitative Aptitude*; Language Comprehension = *Verbal Ability & Reading Comprehension*;
  Economic/Business/GK = *General Awareness & Current Affairs*.
- **XAT** → Verbal & Logical Ability = *Verbal Ability & Reading Comprehension* (pure logic
  items → *Logical & Analytical Reasoning*); Decision Making = *Logical & Analytical Reasoning*;
  Quantitative Ability & DI = *Quantitative Aptitude* / *Data Interpretation & Data
  Sufficiency*; GK = *General Awareness & Current Affairs*.

When a topic has no exact chapter, pick the closest and note it (see the ICET taxonomy-gap
notes in [`icet/REVIEW.md`](./icet/REVIEW.md) §1.5 for precedents, e.g. idioms → *Vocabulary
(Synonyms & Antonyms)*, perm/comb → *Permutation & Combination*).

---

## 4. Transcription rules

- **English only.** Bilingual papers (English + Telugu/Urdu): drop the second language.
- **Markdown + LaTeX.** Inline math as `$…$`; small tables as Markdown tables.
- **Self-contained stems.** A generic instruction whose items live only in the options
  ("Pick the odd one.") must inline them: *"Pick the odd one out: Mango, Orange, Potato,
  Apple."* Otherwise `(chapter, stem)` dedupe silently drops questions.
- **Author the explanation** — this *is* the per-question solve of §5.
- **Data sufficiency** (`kind: "data_sufficiency"`): put statements I/II in the stem; if the
  paper omits the option wording (prints bare `1 2 3 4`), supply the canonical set —
  1. answered using statement I alone; 2. using statement II alone; 3. using both together
  but not either alone; 4. cannot be answered even together — unless the paper prints its own
  block, in which case use that verbatim.
- **Reading comprehension:** the bank is standalone-MCQ only, so embed the passage as a
  `>` blockquote at the top of **each** dependent question's stem (repetition is accepted).
- **Figures:** no image-hosting pipeline yet. Describe-in-text if possible (small tables,
  a few labelled angles); otherwise **exclude** the question and log it with paper + page.

---

## 5. The answer key — trust, then verify (core rule)

**A marked/keyed answer is a claim, not a fact.** Different formats present keys differently
(image papers: a green tick per option; text papers: an "Answers" page or per-question key;
some papers: none). Whatever the source:

1. **Classify the whole key first.** If it is a **placeholder** (same option marked for every
   question — e.g. TS ICET 2024 marks option 1 ×200) or **absent**, the key is worthless. The
   default is to **drop the paper**; import it only on an explicit instruction, and then treat
   every answer as hand-derived (raise the bar, exclude on any doubt).
2. **Solve every question independently** and compare with the key. If your solution disagrees,
   or the keyed option is only defensible under a strained reading, or **no** option is correct,
   or two options are equally correct → **exclude the question** and log the worked reason.
   Never patch a stem or invent a key to make a question "work".
3. **Record excluded questions** (question number, page, reason) alongside the paper so
   `imported + excluded` reconciles to the paper's total. Even genuine keys run ~4–6% excluded;
   a paper far above that has an unreliable key and should be reconsidered whole. Content-filter
   drops (§7, reason `content-filter`) count toward this reconciliation too.

---

## 6. Validate before importing

Validate the assembled file against the schema (subject enum, chapter-belongs-to-subject,
4–5 options, `single` ⇒ exactly one correct, explanation + source + source_year present,
no unknown fields, no in-file `(chapter, stem)` duplicates). For ICET papers,
`node question-imports/icet/validate.mjs <file>` mirrors the server checks; for any format,
validate against [`assessment-import.schema.json`](./assessment-import.schema.json) with any
JSON-Schema (draft 2020-12) validator. Then upload at
**/dashboard/assessment-questions/import**, choose **All subjects**, dry-run, and commit —
re-running is safe (duplicates are skipped).

---

## 7. Output content-filter: keep the run smooth

Transcribing a full paper occasionally trips **`API Error: 400 Output blocked by content
filtering policy`** — an *output* filter on the model's response, which kills the **whole**
turn, not just the offending line. Two things cause it here: (a) one giant output — ~200
questions + explanations dumped in a single response; (b) a single sensitive item — a GK /
Current Affairs / Reading-Comprehension / Reasoning passage touching violence, terrorism,
weapons, drugs, self-harm, or communal topics, whose explanation trips the filter. Handle it
without fighting the filter:

1. **Batch small, write incrementally** (§2 step 5). ≤25 questions per response, each batch
   written to the file before the next. A block then costs one batch, not the paper.
2. **Bisect a blocked batch.** Re-emit its questions individually so the one problematic item
   surfaces; the rest write cleanly.
3. **Neutralize framing** for sensitive-but-legitimate items: keep the academic MCQ, strip the
   charged detail, explain clinically ("This tests knowledge of X") — no graphic or
   instructional phrasing, no editorializing.
4. **If neutralizing would distort the question, exclude it.** Log it in
   `<paper-slug>.excluded.json` (question number, page, reason `content-filter`); it still
   counts toward `imported + excluded` (§5.3). This stays inside the "never patch — exclude
   and log" rule rather than working around the filter.
5. **Reduce verbatim bulk.** Read the rendered page and **author fresh** (stems and
   explanations) instead of pasting the raw PDF text layer — the spec already wants authored,
   self-contained content. Do Reading-Comprehension sets (repeated blockquote passages, §4) in
   their own small batch, since the repetition multiplies bulk.
6. **Run heavy papers in a subagent.** A block inside a subagent doesn't poison the main
   transcript; the subagent returns only the clean JSON batch.

---

## Checklist (per paper)

- [ ] `source`, `source_year`, `<paper-slug>` fixed; pages rendered / text extracted; Q→page map built.
- [ ] Key classified; if placeholder/absent, explicit go-ahead confirmed and answers hand-derived.
- [ ] Every question: English self-contained stem + options + **authored explanation** + subject + exact chapter.
- [ ] Every question **solved**; disagreements/defects **excluded and logged**, not patched.
- [ ] Transcribed in **≤25-question batches, written incrementally**; any content-filter block contained and logged (§7).
- [ ] One file `question-imports/<exam>/papers/<paper-slug>.json` in the all-subjects shape.
- [ ] Validates clean against the schema; `imported + excluded` reconciles to the paper's total.
