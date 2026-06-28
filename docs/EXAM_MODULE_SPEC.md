# CareerLaunchPad — Exam Module Requirement Specification

**Status:** Draft for review
**Date:** 2026-06-27
**Scope:** Product + data + API specification for the student examinations module — subject/chapter/question authoring, percentage-driven paper generation, online (cached) test-taking, and offline PDF conduct.
**Aligns with:** `roles-specification.md` (RBAC), `docs/REGISTRATION_AND_INTAKE_API.md` (API style), `supabase/migrations/*` (schema conventions), `docs/R2_SETUP.md` (file storage).
**Reference paper format:** **ICET** (Integrated Common Entrance Test) — see Appendix A.

### Resolved decisions (locked 2026-06-27)

- **D1 Paper strategy → `fixed`.** All students sit the *same* generated paper (required for offline PDF and fair comparison). Per-student randomized draws are **deferred** — the schema leaves room for it but v1 ships fixed only.
- **D2 Bank scope → per-college.** Subjects, chapters, passages, questions, and blueprints are **owned by a college** and RLS-scoped to it; a College Admin sees and authors only their own college's bank. (Owners are unrestricted.)
- **D4 Multi-answer scoring → all-or-nothing.** Full marks only when the selected option set exactly equals the correct set. No partial credit in v1.
- **D7 Content → Markdown + LaTeX (math) + fenced code blocks + optional image.** Stems, options, and passages are stored as text rendered with Markdown, KaTeX math (`$…$`/`$$…$$`), and fenced code blocks; an optional image (R2) may accompany a stem. ICET papers themselves are **single-answer, no negative marking** (Appendix A), but the bank still supports multi-answer questions for non-ICET use.

---

## 1. Overview

The exam module lets **admins** build a question bank (subjects → chapters → questions), define a reusable **exam blueprint** (which subjects, how many questions each, and the easy/medium/hard/very-hard mix), and then **conduct** that exam either:

- **Online** — the system *generates* a paper by reference (a small manifest of question IDs) and *caches* the questions to the student's device for the duration of the attempt. **No full copy of the paper is stored** — only ID references — to keep the DB small.
- **Offline** — the admin exports the generated paper to **PDF** and conducts it on paper where students lack internet.

The module reuses the platform's existing **permission-based RBAC** and **Supabase/Postgres + RLS** foundation. No new auth mechanism is introduced.

### 1.1 Core design principles (from CLAUDE.md)

- **API design first.** Every form (question authoring, blueprint builder, exam-taking) is built against the API contract in §9 — forms submit *through* the API and round-trip (a question created via the form re-fetches and edits via the same API). Reference data (subjects, chapters, difficulty levels) is fetched from the API, never hard-coded in the component.
- **No paper duplication.** Generated papers are **manifests of question references** (`question_id` + version + position), not copies of question content. See §6.
- **Mobile-first.** The exam-taking surface is the most-used surface and must work on phones (~320–390px) — one question per screen, large tap targets, offline-tolerant caching.

---

## 2. Roles & permissions

New permission strings, granted to roles per the RBAC model in `roles-specification.md` (§3). Permissions are data, not hardcoded.

| Permission                  | Owner | College Admin | Student | Notes |
| --------------------------- | :---: | :-----------: | :-----: | ----- |
| `exam.subject.manage`       |  ✅   |       ✅¹      |         | Create/edit subjects & chapters |
| `exam.question.manage`      |  ✅   |       ✅¹      |         | Author/edit/version questions & passages |
| `exam.blueprint.manage`     |  ✅   |       ✅¹      |         | Create/edit exam blueprints |
| `exam.paper.generate`       |  ✅   |       ✅¹      |         | Generate a paper from a blueprint |
| `exam.paper.export_pdf`     |  ✅   |       ✅¹      |         | Export a generated paper to PDF (offline) |
| `exam.assign`               |  ✅   |       ✅¹      |         | Assign an exam to students/cohorts |
| `exam.attempt.take`         |       |               |   ✅    | Sit an assigned exam |
| `exam.results.view_all`     |  ✅   |       ✅¹      |         | View all results / analytics |
| `exam.results.view_own`     |       |               |   ✅    | View own results (when published) |

¹ **Per-college (resolved D2).** Every subject/chapter/passage/question/blueprint carries a `college_id`; RLS restricts a College Admin to rows for their own college (`scope_college_id` on `user_role`, per `004_rls_policies.sql`). Owners hold `*` and see all colleges. There is **no global shared bank** in v1 — if two colleges want the same question, it is authored (or copied) per college.

---

## 3. Domain model

```
subject 1───* chapter 1───* question *───1 question_difficulty (enum)
                              │
                  passage 1───* question        (English-style: many Qs per passage)
                              │
                  question 1───* question_option (exactly 4; 1+ flagged correct)

exam (blueprint) 1───* exam_section ───1 subject       (per-subject: count + difficulty mix)
exam_section 1───* exam_section_chapter ───1 chapter   (per-chapter % quota within the subject)

exam (blueprint) 1───* exam_session                  (each CONDUCT event: date window, cohort, paper)
exam_session 1───1 exam_paper 1───* exam_paper_question   (fixed-paper manifest: references only)
exam_session 1───* exam_session_student              (who is assigned to this sitting)
exam_session 1───* exam_attempt 1───* exam_attempt_question  (per-student manifest + answers)

college 1───* subject / exam            (every bank entity & blueprint is owned by an existing college)
```

> **Blueprint vs. session (the "conduct multiple times" model).** An `exam` is a *reusable template* (subjects + quotas + difficulty mix). Each time the college actually runs it — Batch A in June, Batch B in July, a retest — that is a new **`exam_session`** with its own date window, assigned students, generated paper, attempts, and results. One blueprint → many sessions. A college therefore has many blueprints, and each blueprint many sittings, with no duplication: sessions share the blueprint and only reference questions.

### 3.1 Entities

**`subject`** — a top-level subject (English, Arithmetic, Reasoning, …). Admin-managed.
**`chapter`** — a chapter within a subject. Every question belongs to exactly one chapter, so the generator can spread questions across chapters rather than draw all from one.
**`passage`** — a reading passage (primarily English). Zero-to-many questions reference a passage; passage-bound questions are selected/printed as a group with their passage text.
**`question`** — one MCQ. Belongs to one chapter; optionally belongs to one passage. Carries a `difficulty`. Versioned (§6.3).
**`question_option`** — exactly 4 options per question. One or more flagged `is_correct` (supports single- **and** multi-correct).
**`exam`** — a reusable **blueprint/template**: title, duration, generation strategy, status. Owned by a college; **not** tied to a date or cohort — it can be conducted any number of times.
**`exam_section`** — per-subject config inside a blueprint: number of questions + the easy/medium/hard/very-hard percentages + marks-per-question.
**`exam_section_chapter`** — per-chapter **% quota** within a section, admin-editable per exam. Lets the admin say "Arithmetic = 40%, Algebra = 35%, Statistics = 25%" so coverage is uniform/intentional instead of left to round-robin. Optional: if a section has no chapter rows, the generator falls back to an even round-robin across all the subject's chapters.
**`exam_session`** — one **conduct event** of a blueprint: a label ("Batch 2026 — Mock 1"), an open/close window, online/offline mode, its generated paper, its assigned students, and its attempts. This is the unit that gets scheduled, run, and graded — and the answer to *"the same college can conduct the same exam multiple times."*
**`exam_session_student`** — the roster: which students are assigned to a given session (status invited → started → submitted).
**`exam_paper`** + **`exam_paper_question`** — *fixed-strategy* manifest generated **per session**: one ordered list of question references shared by all students in that sitting (used for offline PDF and "everyone gets the same paper"). Two sessions of the same blueprint can each get a *freshly drawn* paper, reducing leakage between sittings.
**`exam_attempt`** + **`exam_attempt_question`** — a student's sitting **within a session**: the manifest (references only) plus the student's selected options and awarded marks.

---

## 4. Question authoring rules

1. **Format.** Stem + exactly **4** options. **One or more** options may be correct — `single` vs `multi` is derived from how many options are flagged `is_correct` (stored as `answer_type` for fast filtering/validation). ICET questions are always `single` (Appendix A); `multi` exists for non-ICET banks.
2. **Content (resolved D7).** `stem`, each option `label`, and `passage.body` are **Markdown** strings that also render **LaTeX math** (`$…$` inline, `$$…$$` block, via KaTeX) and **fenced code blocks** (```` ``` ````). A stem may additionally carry one optional `stem_image_url` (R2 object key). The same renderer is used in the authoring preview, the online test surface, and the PDF export so what the author sees matches what the student sees.
3. **Question kinds.** A `kind` discriminator handles the ICET shapes:
   - `standard` — a plain MCQ.
   - `passage` — bound to a `passage_id`; used for Reading Comprehension. Selected/printed as a block with its passage (rule 4).
   - `data_sufficiency` — ICET Analytical Ability: stem poses a question plus two statements (I, II); the 4 options are the standard "statement sufficiency" choices. Modeled as a `standard`-shaped MCQ whose option labels are the fixed sufficiency choices; flagged `kind='data_sufficiency'` so the UI/PDF can render the I/II statement layout.
4. **Passage questions.** A passage holds shared text; its questions reference `passage_id`. In a generated paper, a passage and all of its selected questions stay together and are printed/rendered as a block. A passage's questions still each carry a `chapter_id` and `difficulty`.
3. **Chapter is mandatory.** Every question has `chapter_id` → enables cross-chapter spreading (§5.2).
4. **Difficulty is mandatory.** One of `easy | medium | hard | very_hard` (check constraint, mirrors the `employment_status` pattern in migration 018).
5. **Validation (enforced API-side, §9):**
   - exactly 4 options; at least 1 `is_correct`.
   - non-empty stem; explanation optional.
   - `answer_type` ∈ {`single`,`multi`} must match correct-option count (single ⇒ exactly 1 correct).
   - passage-bound questions must reference an existing passage in the same subject.
6. **Lifecycle.** Questions are **never hard-deleted** once used by a published exam — they are `archived` (status check constraint) so existing paper references never dangle. Editing a question that has been used creates a **new version** (§6.3).

---

## 5. Exam blueprint & paper generation

### 5.1 Blueprint (admin configures)

Per the requirement, the admin builds an exam by choosing subjects and, **for each subject**, the question count and difficulty mix:

```jsonc
// exam blueprint — ICET-shaped (200 Q, 1 mark each, 150 min, no negative marking; see Appendix A)
{
  "title": "ICET Mock — Batch 2026",
  "college_id": "uuid",                   // owns the blueprint (resolved D2)
  "duration_minutes": 150,
  "generation_strategy": "fixed",         // v1 = fixed only; per_student deferred (§6.1)
  "negative_mark_per_wrong": 0,           // ICET has none
  "shuffle_questions": false,             // ICET keeps section order; set true for general mocks
  "shuffle_options": true,
  "sections": [
    {
      "subject_id": "…analytical-ability…",
      "num_questions": 75,
      "marks_per_question": 1,
      "difficulty_mix": { "easy": 30, "medium": 40, "hard": 20, "very_hard": 10 }  // % — must sum to 100
    },
    {
      "subject_id": "…mathematical-ability…",
      "num_questions": 75,
      "marks_per_question": 1,
      "difficulty_mix": { "easy": 30, "medium": 40, "hard": 20, "very_hard": 10 },
      "chapter_quota": [                      // % per chapter — admin-editable; must sum to 100
        { "chapter_id": "…arithmetical…", "pct": 47 },   // ~35 of 75
        { "chapter_id": "…algebra-geom…", "pct": 40 },   // ~30 of 75
        { "chapter_id": "…statistical…",  "pct": 13 }    // ~10 of 75
      ]
    },
    {
      "subject_id": "…communication-ability…",
      "num_questions": 50,
      "marks_per_question": 1,
      "difficulty_mix": { "easy": 40, "medium": 40, "hard": 20, "very_hard": 0 }
    }
  ]
}
```

> The blueprint is the knob the requirement asks for: the admin picks each **subject**, its **number of questions**, and the **easy/medium/hard/very-hard percentage** — the engine (§5.2) does the rest. The mixes above are illustrative; the admin sets them per section.

**Validation rules:**
- Each section's `difficulty_mix` percentages must sum to **100**.
- If `chapter_quota` is present, its `pct` values must sum to **100**, and every `chapter_id` must belong to the section's subject. Chapters omitted from the list contribute **0** (excluded). If `chapter_quota` is absent, the generator spreads evenly (round-robin) across all the subject's chapters.
- Per-difficulty target count = `round(num_questions × pct / 100)`; rounding remainder is assigned to the largest bucket so the per-section total always equals `num_questions`. The same largest-remainder rounding applies to the chapter quotas and to the combined chapter×difficulty matrix (§5.2).
- A blueprint is **publishable only if the bank can satisfy it** — when chapter quotas are set, this means enough non-archived questions exist in **each (chapter, difficulty) cell**, not just per difficulty. A dry-run "feasibility check" endpoint reports shortfalls *before* generation (§9.4).

### 5.2 Generation algorithm

For each section, given `num_questions`, the `difficulty_mix`, and (optionally) the `chapter_quota`:

1. **Per-chapter counts.** If `chapter_quota` is set, `chapter_count[c] = round(num_questions × chapter_pct[c] / 100)` (largest-remainder so they sum to `num_questions`). If not set, distribute `num_questions` evenly across all the subject's chapters (round-robin).
2. **Chapter × difficulty matrix.** Within each chapter's allocation, split by `difficulty_mix`: `target[c][d] = round(chapter_count[c] × difficulty_pct[d] / 100)`, largest-remainder over the row so it sums to `chapter_count[c]`. The result is a 2-D target matrix; because every chapter uses the same difficulty mix, the section's overall difficulty marginal still matches `difficulty_mix` exactly.
3. **Fill each cell.** For each `(chapter, difficulty)` cell, draw `target[c][d]` non-archived questions from that exact chapter+difficulty pool.
4. **Keep passages intact:** if a selected question is passage-bound, co-selected questions from the same passage count toward the same cell where possible; a passage is emitted as a unit.
5. **Seeded** selection so generation is reproducible (the seed is stored on the paper — lets us re-export the identical PDF without storing the content).
6. **No silent substitution.** If a cell can't be filled, fail with a precise error naming the subject, **chapter**, difficulty, and shortfall — surfaced by the feasibility check (§9.4) before publish.

The output is an ordered list of `question_id`s (+ version + position) — the **manifest**. No question text is copied.

---

## 6. The "no-copy" model & caching

### 6.1 Two generation strategies

| Strategy      | When generated         | Manifest stored in        | Use case |
| ------------- | ---------------------- | ------------------------- | -------- |
| `fixed` **(v1)** | once **per session** | `exam_paper_question`  | Everyone in the sitting gets the same paper; required for offline PDF; fair comparison |
| `per_student` *(deferred)* | at attempt start | `exam_attempt_question` | Each student gets a different draw from the same blueprint (anti-cheating) |

**v1 ships `fixed` only (resolved D1).** The paper is generated **when a session is created** (not on the blueprint), so each conduct event has its own `exam_paper`; every attempt in that session references it. `exam_attempt` records each student's answers and score. The `per_student` column/tables are kept so the second mode is a later additive change, not a migration.

Both store **only references** (`question_id`, `question_version`, `position`, `section_id`). The student's answers live alongside in `exam_attempt_question.selected_option_ids`.

### 6.2 Caching to the student (online)

- On attempt start, the API returns the manifest **hydrated once** — questions + options with **correct flags stripped** — as a single payload.
- The client caches this payload (in-memory + `localStorage`/IndexedDB) so the student can navigate questions and answer **without re-fetching**, surviving brief connectivity loss.
- Answers are **autosaved** (debounced PATCH to `exam_attempt_question`); on reconnect, queued answers flush. Final **submit** locks the attempt and triggers scoring.
- The hydrated payload **never includes `is_correct`** — scoring happens server-side only.

### 6.3 Question versioning (integrity)

Because papers reference questions instead of copying them, an edit to a question would otherwise silently alter an already-conducted paper. Resolution:

- Each `question` has a `version` int. **Editing a question that is referenced by any published exam creates a new version row** (or bumps `version` and snapshots the prior content into `question_revision`).
- Manifests pin `question_version`, so a paper/attempt always renders the exact text the student saw, even after later edits.
- This keeps the bank editable while guaranteeing exam integrity — and still stores no *paper* copy (just per-question revisions, which are reused across all papers referencing them).

---

## 7. Offline conduct (PDF)

- `exam.paper.export_pdf` generates a print-ready PDF from a **fixed** paper's manifest (hydrated server-side, including the answer key as a separate page for the invigilator).
- PDF contents: cover (title, duration, total marks, instructions), questions grouped by section with passages inline, an OMR-friendly option layout, and a **separate answer-key + marking-scheme page**.
- Generated server-side (e.g. a route handler streaming a PDF). Because generation is **seeded** (§5.2), the same paper can be re-exported identically without storing the rendered file — though the generated PDF may optionally be cached to **R2** (see `docs/R2_SETUP.md`) for re-download.
- Offline results are entered back later via a results-entry screen (manual marks or OMR upload) — see open decision D6.

---

## 8. Scoring & results

- **Single-answer:** full `marks_per_question` if the one correct option is selected, else 0.
- **Multi-answer (resolved D4 — all-or-nothing):** full `marks_per_question` **only if** the selected option set exactly equals the correct set; otherwise 0. No partial credit in v1.
- **Negative marking:** off by default (`negative_mark_per_wrong = 0`); ICET has none. The blueprint exposes the field for non-ICET use, applied uniformly to wrong answers when > 0.
- Scoring runs **server-side on submit**; `exam_attempt.score` + per-question `awarded_marks` are persisted. Students see results only when the admin **publishes** them (`exam.results.view_own`).
- Analytics (admin): score distribution, per-subject/-chapter/-difficulty accuracy, item analysis (which questions are too easy/hard) — feeds the `recharts` dashboards already in the repo.

---

## 9. API contracts

Style mirrors `docs/REGISTRATION_AND_INTAKE_API.md`: Next.js route handlers under `app/api/`, JSON in/out, permission-checked server-side, validated before DB write.

### 9.1 Reference & authoring

```
GET    /api/exam/subjects                 → [{ id, name, chapter_count }]
POST   /api/exam/subjects                 { name } → { id }
GET    /api/exam/subjects/:id/chapters    → [{ id, name, question_count }]
POST   /api/exam/chapters                 { subject_id, name } → { id }

GET    /api/exam/questions                 ?subject_id&chapter_id&difficulty&q  (paged)
POST   /api/exam/questions                 (create — body below)
GET    /api/exam/questions/:id             → full question (with options + correct flags; authors only)
PATCH  /api/exam/questions/:id             (edit → new version if referenced)
POST   /api/exam/questions/:id/archive

POST   /api/exam/passages                  { subject_id, title, body } → { id }
GET    /api/exam/passages/:id              → passage + its questions
```

**Create-question request:**
```jsonc
{
  "chapter_id": "uuid",
  "passage_id": "uuid|null",
  "difficulty": "medium",
  "answer_type": "single",            // or "multi" (must match correct count)
  "stem": "What is 2 + 2?",
  "stem_image_url": null,
  "explanation": "…optional…",
  "options": [
    { "label": "3", "is_correct": false },
    { "label": "4", "is_correct": true  },
    { "label": "5", "is_correct": false },
    { "label": "6", "is_correct": false }
  ]
}
```
**Validation:** exactly 4 options; ≥1 correct; `single`⇒exactly 1 correct; chapter exists; passage (if set) in same subject.

### 9.2 Blueprint

```
GET    /api/exam/blueprints                → list
POST   /api/exam/blueprints                (body = §5.1 blueprint)
GET    /api/exam/blueprints/:id
PATCH  /api/exam/blueprints/:id
PUT    /api/exam/sections/:id/chapter-quota  { quotas: [{ chapter_id, pct }] }   (admin edits per-chapter %)
POST   /api/exam/blueprints/:id/publish    (runs feasibility check first)
```
**Validation:** each section `difficulty_mix` sums to 100; `num_questions` ≥ 1; subject exists; if `chapter_quota` set, its `pct` sums to 100 and every chapter belongs to the section's subject.

### 9.3 Paper generation, assignment, taking

```
# Sessions = a conduct event of a blueprint (the same blueprint can be run many times)
GET    /api/exam/blueprints/:id/sessions     → list sittings of this blueprint
POST   /api/exam/blueprints/:id/sessions     { label, opens_at, closes_at, mode } → { session_id, paper_id }
                                              (generating the paper happens here, per session)
GET    /api/exam/sessions/:id                 → session + status + paper + roster summary
POST   /api/exam/sessions/:id/assign          { student_ids[] | college_wide: true }
POST   /api/exam/sessions/:id/regenerate-paper → { paper_id }   (fresh draw before it opens)
POST   /api/exam/sessions/:id/export-pdf       → application/pdf (offline conduct)
POST   /api/exam/sessions/:id/close            → locks the sitting

# Attempts live under a session
POST   /api/exam/sessions/:id/attempts        → { attempt_id, manifest_hydrated }  (no is_correct)
PATCH  /api/exam/attempts/:id/answers         { question_id, selected_option_ids[] }  (autosave)
POST   /api/exam/attempts/:id/submit          → { status: "submitted" }
GET    /api/exam/attempts/:id/result          → score + breakdown (only when published)
```

### 9.4 Feasibility check (dry run)

```
POST   /api/exam/blueprints/:id/feasibility
→ { ok: false, shortfalls: [ { subject_id, chapter_id, difficulty, required, available } ] }
  // chapter_id is null when a section has no chapter_quota (checked per difficulty only)
```

---

## 10. Schema sketch (Postgres / Supabase)

Follows existing conventions: `public.` schema, `uuid` PKs via `gen_random_uuid()`, snake_case, `status`/`difficulty` check constraints, `created_by`/`created_at`/`updated_at`, indexes on FKs + filter columns, RLS per `004_rls_policies.sql`. Delivered as the next numbered migration (e.g. `021_exam_core.sql`).

```sql
-- Every bank entity carries college_id for per-college RLS (resolved D2).
create table public.subject (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.college(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  unique (college_id, lower(name))      -- name unique within a college
);
create index subject_college_idx on public.subject (college_id);

create table public.chapter (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subject(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (subject_id, lower(name)),
  unique (id, subject_id)               -- target for question's composite FK (keeps subject_id honest)
);

create table public.passage (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subject(id) on delete cascade,
  title text,
  body text not null,
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

create table public.question (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.college(id) on delete cascade,  -- denormalized for direct RLS
  subject_id uuid not null,                                                  -- denormalized for the generator's hot query
  chapter_id uuid not null,                                                  -- the question's chapter
  passage_id uuid references public.passage(id),
  kind text not null default 'standard'
    check (kind in ('standard','passage','data_sufficiency')),               -- §4 rule 3
  difficulty text not null check (difficulty in ('easy','medium','hard','very_hard')),
  answer_type text not null check (answer_type in ('single','multi')),
  stem text not null,                                                        -- Markdown + LaTeX + code (D7)
  stem_image_url text,                                                       -- optional R2 object key
  explanation text,
  version int not null default 1,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: the (chapter, subject) pair must match a real chapter row, so the
  -- denormalized subject_id can never drift from chapter.subject_id. The DB rejects
  -- any insert/update where subject_id != the chapter's actual subject.
  foreign key (chapter_id, subject_id) references public.chapter (id, subject_id)
);
create index question_chapter_idx on public.question (chapter_id);
create index question_passage_idx on public.question (passage_id);
-- the generator's hot path: eligible pool = subject + difficulty, not archived
create index question_gen_idx on public.question (subject_id, difficulty, status);

create table public.question_option (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  position int not null
);

-- exam blueprint
create table public.exam (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.college(id) on delete cascade,  -- owns the blueprint (D2)
  title text not null,
  duration_minutes int not null,
  generation_strategy text not null default 'fixed'
    check (generation_strategy in ('fixed','per_student')),   -- v1 = 'fixed' only (D1)
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  negative_mark_per_wrong numeric(4,2) not null default 0,    -- 0 for ICET; all-or-nothing scoring (D4)
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

create table public.exam_section (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam(id) on delete cascade,
  subject_id uuid not null references public.subject(id),
  num_questions int not null check (num_questions > 0),
  marks_per_question numeric(4,2) not null default 1,
  pct_easy int not null default 0,
  pct_medium int not null default 0,
  pct_hard int not null default 0,
  pct_very_hard int not null default 0,
  position int not null,
  check (pct_easy + pct_medium + pct_hard + pct_very_hard = 100),
  unique (id, subject_id)                 -- target for exam_section_chapter's composite FK
);

-- per-chapter % quota within a section (admin-editable per exam). Optional:
-- no rows ⇒ generator spreads evenly across the subject's chapters (§5.2 step 1).
create table public.exam_section_chapter (
  section_id uuid not null,
  subject_id uuid not null,               -- must equal the section's subject (composite-checked below)
  chapter_id uuid not null,
  pct int not null check (pct >= 0 and pct <= 100),
  primary key (section_id, chapter_id),
  -- chapter must belong to the SAME subject as the section — both ends composite-checked,
  -- reusing chapter (id, subject_id) and exam_section (id, subject_id):
  foreign key (section_id, subject_id) references public.exam_section (id, subject_id) on delete cascade,
  foreign key (chapter_id, subject_id) references public.chapter (id, subject_id)
);
-- NOTE: "pct values sum to 100 per section" is cross-row, so it is enforced in the
-- API (blueprint validate/publish) and optionally a deferred constraint trigger —
-- not a single-row CHECK.

-- a CONDUCT event of a blueprint — the same blueprint can have many sessions
create table public.exam_session (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam(id) on delete cascade,
  college_id uuid not null references public.college(id) on delete cascade,  -- denorm for RLS; = exam.college_id
  label text not null,                                       -- "Batch 2026 — Mock 1"
  mode text not null default 'online' check (mode in ('online','offline')),
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled','open','closed','graded')),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);
create index exam_session_exam_idx on public.exam_session (exam_id);
create index exam_session_college_idx on public.exam_session (college_id);

-- roster: who sits this session
create table public.exam_session_student (
  session_id uuid not null references public.exam_session(id) on delete cascade,
  student_id uuid not null references public.app_user(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','started','submitted')),
  primary key (session_id, student_id)
);

-- fixed-strategy manifest, generated PER SESSION (references only — NO copy of question content)
create table public.exam_paper (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_session(id) on delete cascade,
  seed bigint not null,
  created_at timestamptz not null default now()
);
create table public.exam_paper_question (
  paper_id uuid not null references public.exam_paper(id) on delete cascade,
  question_id uuid not null references public.question(id),
  question_version int not null,
  section_id uuid not null references public.exam_section(id),
  position int not null,
  primary key (paper_id, position)
);

-- per-student sitting
create table public.exam_attempt (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_session(id),  -- the sitting (→ exam, paper, college)
  student_id uuid not null references public.app_user(id),
  status text not null default 'in_progress'
    check (status in ('in_progress','submitted','graded')),
  seed bigint,                                              -- set only when per_student (deferred)
  score numeric(6,2),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (session_id, student_id)                           -- one attempt per student per sitting (D9)
);
create table public.exam_attempt_question (
  attempt_id uuid not null references public.exam_attempt(id) on delete cascade,
  question_id uuid not null references public.question(id),
  question_version int not null,
  section_id uuid not null references public.exam_section(id),
  position int not null,
  selected_option_ids uuid[] not null default '{}',
  awarded_marks numeric(4,2),
  primary key (attempt_id, position)
);
```

---

## 11. Open decisions (need your input)

| # | Decision | Status |
| - | -------- | ------ |
| D1 | **Generation strategy** — same paper vs per-student draw | ✅ **`fixed`** (per-student deferred) |
| D2 | **Question bank scope** — global vs per-college | ✅ **Per-college** (RLS-scoped) |
| D4 | **Multi-answer scoring** — all-or-nothing vs partial | ✅ **All-or-nothing** |
| D7 | **Rich content** — text/image/math/code | ✅ **Markdown + LaTeX + code + optional image** |
| D3 | **Chapter spread** — round-robin vs admin-set per-chapter quota | ✅ **Admin-editable `chapter_quota` per section** (`exam_section_chapter`); even round-robin only as the fallback when no quota is set |
| D5 | **Negative marking amount** — for non-ICET exams that enable it | ⬜ Open — *0 for ICET; field exists for later* |
| D6 | **Offline results capture** — manual marks entry, OMR-sheet upload, or both? | ⬜ Open — *recommend manual entry in v1* |
| D8 | **Timing** — hard auto-submit at duration, per-question timer, or soft? | ⬜ Open — *recommend hard auto-submit at 150 min for ICET* |
| D9 | **Retakes** — one attempt per student per exam, or multiple? | ⬜ Open — *recommend one in v1* |
| D10 | **Section time limits** — ICET has none (single 150-min pool); confirm for other exams | ⬜ Open — *recommend no sectional limit (matches ICET)* |

---

## 12. Suggested build order

1. **Schema migration** (`021_exam_core.sql`) + RLS policies + seed difficulty/permissions.
2. **Authoring API + admin UI** — subjects, chapters, passages, questions (the question bank). *Build the question form against §9.1 first.*
3. **Blueprint builder** — sections + difficulty-mix form, with the §9.4 feasibility check.
4. **Sessions + generation engine** (§5.2) — create a session from a blueprint, which generates the fixed paper manifest; assign the roster.
5. **PDF export** (offline path) — per-session export; earliest end-to-end value, no test-taking UI needed.
6. **Online attempt** — manifest hydration, client cache/autosave, submit + server scoring.
7. **Results & analytics** dashboards.

---

## Appendix A — ICET paper format (reference template)

The reference paper format is **ICET** (Integrated Common Entrance Test — TS/AP, MBA/MCA admissions). The module must be able to produce an ICET-shaped paper from a blueprint.

**Top-level pattern:** 3 sections · **200 questions** · **200 marks** (1 mark each) · **150 minutes** · **CBT** (online) · **no negative marking** · **no sectional time limit** · all questions **single-answer MCQ, 4 options**.

| Section | Subject (`subject`) | Q | Sub-areas → seed as `chapter` rows |
| ------- | ------------------- | -: | ---------------------------------- |
| A | **Analytical Ability** | 75 | Data Sufficiency (20, `kind='data_sufficiency'`); Problem Solving (55): Sequences & Series, Data Analysis, Coding & Decoding, Date/Time & Arrangement |
| B | **Mathematical Ability** | 75 | Arithmetical Ability (35); Algebraical & Geometrical Ability (30); Statistical Ability (10) |
| C | **Communication Ability** | 50 | Vocabulary; Business & Computer Terminology; Functional Grammar; Reading Comprehension (passages → `kind='passage'`) |

**Module implications:**
- These three subjects + their chapters are the **seed bank per college** (each college authors its own questions under this structure — D2).
- **Data Sufficiency** and **Reading Comprehension passages** are why §4 defines a question `kind`. RC passages reuse the `passage` table; the generator keeps a passage and its questions together.
- The ICET blueprint sets `negative_mark_per_wrong = 0`, `marks_per_question = 1`, `duration_minutes = 150`, and section question counts 75/75/50 — exactly the §5.1 example.
- Math sub-areas need **LaTeX** rendering (D7); hence the Markdown+KaTeX content model.

> Section counts/sub-areas reflect the published 2026 TS/AP ICET pattern. The numbers are seeded as defaults; admins can adjust per blueprint. The chapter-wise *question weightage within* a section is set by each section's difficulty mix and (future D3) optional chapter filters.

**Sources:** [CollegeDekho — TS ICET 2026 pattern](https://www.collegedekho.com/exam/ts-icet/exam-pattern), [Careers360 — AP ICET 2026 pattern](https://bschool.careers360.com/articles/ap-icet-exam-pattern), [Shiksha — TS ICET pattern](https://www.shiksha.com/mba/tsicet-exam-pattern).
```
