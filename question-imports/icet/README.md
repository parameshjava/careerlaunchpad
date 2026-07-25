# ICET past papers → assessment question bank

Turns the ICET question papers in `/Users/paramesh/LP/materials` into import files
for the **assessment** question bank (`POST /api/assessment/questions/import`,
migrations 143-145). English only; every question carries `source` + `source_year`.

```
question-imports/icet/
  build-manifest.mjs   triage the PDFs        → manifest.json
  extract-key.mjs      read the answer key    → keys/<paper>.json
  taxonomy.mjs         ICET subjects/chapters (parsed from migration 126)
  slugs.mjs            stable <paper-slug> ⇄ filename mapping
  validate.mjs         pre-flight the import files (mirrors the server rules)
  papers/<paper-slug>/<subject-slug>.json    ← the deliverable, one file per subject
  REVIEW.md            everything needing a human decision
```

## The source material

34 PDFs → 30 papers with questions → **25 papers whose answer key can be trusted**
(~5,000 questions). The rest are duplicates
(byte-identical or an Urdu edition of a paper already present in English) or not
question papers at all. All of them are TCS-iON "Question Paper Preview" exports:
bilingual, with the stems and options rendered as **images**, so the text layer
holds only metadata. Question text must be read visually; the answer key does not.

## How the answer key is read without OCR

Each option is marked with a green tick (correct) or red cross (wrong).
`extract-key.mjs` dumps every image on a page as a PPM (poppler decodes the JPEGs),
measures how green vs. red it is, keeps the shape class that repeats four times per
question, and groups those markers in reading order — the tick's position is the
correct option. It reports `aligned` (markers = 4 × questions) and flags any
question whose group isn't exactly one tick, so a bad read is visible rather than
silent.

Verified against 24 questions read visually on `tg-icet-2025-06-08-s1`: 24/24 match.

```bash
node question-imports/icet/build-manifest.mjs
node question-imports/icet/slugs.mjs --with-text-layer | while IFS=$'\t' read -r slug file; do
  node question-imports/icet/extract-key.mjs "/Users/paramesh/LP/materials/$file" -o "question-imports/icet/keys/$slug.json"
done
```

### Only genuine keys are imported

```bash
node question-imports/icet/key-status.mjs        # → key-status.json
```

`key-status.mjs` classifies every paper's key and `merge.mjs` **refuses** to write
questions from one it does not trust:

| Verdict | Papers | Why |
| --- | --- | --- |
| genuine | 23 | one tick per question, answer spread consistent with a real key ($\chi^2 < 16.27$ at 3 df, p = 0.001) |
| genuine, vision-only | 2 | AP ICET 2020 10 Sep S1/S2 — image-only scans; key is printed but must be read page by page |
| **placeholder — dropped** | 3 | TS ICET 2024 ×3 mark option 1 for all 200 questions ($\chi^2 = 600$), confirmed wrong by solving two |
| **absent — dropped** | 2 | AP ICET 2019 ×2 are plain papers with no marks at all |

Guessing the missing answers was rejected: a wrong "correct" option teaches a wrong
method and marks a student who reasoned correctly as wrong. Individual questions get
the same treatment — see "Transcription" below.

## Transcription (the manual pass)

Per question: read the page image, transcribe the **English** stem and options
(Markdown + LaTeX), classify it into the ICET taxonomy from the section heading the
paper prints above every question (`SECTION - B : MATHEMATICAL ABILITY / 1.
Arithmetical Ability` → `Quantitative Aptitude`, then the chapter by content), and
**author the explanation** — the papers contain no solutions.

Solving each question also double-checks the extracted key. A disagreement is not
resolved silently: the question is left out and logged in REVIEW.md.

Because the importer takes **one subject per file**, a paper produces up to four
files, named by `SUBJECT_SLUGS` in `taxonomy.mjs`.

## Before importing

```bash
node question-imports/icet/validate.mjs --all      # or a single file
```

This mirrors `lib/exam-validation.ts` + `lib/assessment-validation.ts` + the import
route: enum values, 4-5 options, `single` ⇒ exactly one correct, explanation
required, `source_year` range, chapter must exist in the ICET taxonomy, and
in-file `(chapter, stem)` duplicates (which the importer skips).

Then upload at **/dashboard/assessment-questions/import**, pick the matching
subject, dry-run, and commit. Re-running a file is safe: duplicates are skipped.

## Progress

| Paper | Key | Status |
| --- | --- | --- |
| tg-icet-2025-06-08-s1 | genuine | **COMPLETE** — 188 of 200 imported, 12 excluded (REVIEW.md §2) |
| 22 other papers with a genuine key | genuine | not started |
| ap-icet-2020-09-10-s1 / -s2 | genuine (scan) | not started — vision-only, slower |
| ts-icet-2024 ×3, ap-icet-2019 ×2 | placeholder / absent | **dropped, will not be imported** |
