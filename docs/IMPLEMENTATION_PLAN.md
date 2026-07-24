# Implementation Plan — Chapter Progress, Assessments & Student Analytics

**For review.** Covers GitHub **#72** (Chapter Progress Tracking & Per-Chapter Assessments)
and **#73** (Student Progress Analytics).

**Source of truth:** `CHAPTER_PROGRESS_AND_ASSESSMENTS.md` (A), `STUDENT_PROGRESS_ANALYTICS.md`
(B), decisions in `OPEN_DECISIONS_CHECKLIST.md`.

## Sequencing at a glance

```
#72 (migration 143) ─────────────────────────────► must land first
   P1 schema ─► P2 assessment bank ─► P3 progress ─► P4 student quiz
                                                          │
#73 (reads #72's data) ───────────────────────────────────► P5 RPCs ─► P6 charts ─► P7 study plan
```

**#73 depends on #72** — analytics reads `chapter_quiz_attempt` / `batch_chapter`. #73 can't
be verified with real data until #72's quiz flow (P4) is producing attempts. Build #72 fully,
then #73.

**Decision gates (from the checklist):** settle **Q6, Q7, Q10, Q3, Q9** before P1 (they change
migration 143's schema) and **Q12, Q14** before P5 (they define the analytics RPCs). Everything
else can take its recommended default and be tuned in the app layer later.

## Conventions every slice follows

- **Migrations** — one numbered file, `begin;`…`commit;`, idempotent (`create ... if not
  exists` / `create or replace`), RLS enabled per table, cross-RLS reads via `SECURITY
  DEFINER` RPCs that guard on `has_permission(...)`/assignment/`auth.uid()` internally.
  Mirrors 134/135.
- **API routes** — thin route → `lib/*-query.ts` / `*-write.ts` helper. `getAuthContext()` +
  `can(ctx, perm)` gate → 403; `parse*Payload` validation → 422; unique-violation `23505` →
  409. GET returns `{ <plural>: [...] }`, writes `{ ok: true }` / entity.
- **App surfaces** — Tailwind + shadcn tokens per `STYLE_GUIDE.md`; **mobile-first, verified
  at ~320–390px**; wide content scrolls in its own container.
- **Every PR** — `npm run lint && npm run build`, then browser-verify the surface (no test
  suite exists). Charts additionally: run the dataviz palette validator (light+dark), ship a
  table-view fallback.

---

# Story #72 — Chapter Progress & Per-Chapter Assessments

## P1 — Database foundation (migration `143_chapter_progress_and_assessments.sql`)

One migration containing everything schema-level (folds cleanly; can be split if review prefers).

**Tables / columns** (per A §4):
1. `ALTER batch_subject` → `progress_status`, `started_at/by`, `completed_at/by`.
2. `CREATE batch_chapter` (PK `(batch_id, subject_id, chapter_id)`, FK → `batch_subject`,
   `chapter_name` denormalized, `sort_order`, `status`, audit stamps).
3. `CREATE assessment_question` + `assessment_question_option` — mirror `question`/
   `question_option` (021) exactly; composite FK `(chapter_id, subject_id) → chapter`.
   *(Passages only if Q10 = yes.)*
4. `CREATE chapter_quiz` (config; `pass_pct` per Q6; authored-or-default per Q7).
5. `CREATE chapter_quiz_attempt` + `chapter_quiz_attempt_question` (attempt_no 1–3).

**RLS** (A §5.2): progress tables readable by staff/assigned-mentor/enrolled-student, written
via RPC only; `assessment_question*` same policy as the exam bank (staff read, `exam.question.manage`
write); attempt tables have no direct student SELECT of answer keys.

**Permissions** (seed as data, A §5.1): `batch.progress.manage` → platform_admin / coordinator /
support; `chapter.quiz.take` → student (or reuse `exam.attempt.take`).

**RPCs** (A §5.3): `sync_batch_chapters`, `set_batch_subject_progress`,
`set_batch_chapter_progress`, `student_chapter_quizzes`, `start_chapter_quiz_attempt`
(race-safe like `113`), `save_chapter_quiz_answers`, `submit_chapter_quiz_attempt`.

**Hook into existing flow:** extend `replace_batch_subjects` (135) — or call `sync_batch_chapters`
after it — so editing a batch's subjects materializes/prunes `batch_chapter` rows.

**Verify:** apply locally; `supabase db advisors`; unit-check RPC guards by calling as
staff/mentor/student sessions.

## P2 — Assessment question bank (authoring)

Parallel to the exam questions admin, so it's familiar and reuses proven UI.

- **API:** `app/api/assessment/questions/route.ts` (+ `[id]`, `[id]/archive`, `import`) →
  `lib/assessment-question-query.ts` / `-write.ts` / `-validation.ts`. Model on
  `app/api/exam/questions/*` and `lib/exam-*`.
- **UI:** `app/dashboard/assessment-questions/` (list + `new` + edit), mirroring
  `app/dashboard/questions/`. Reuse the question editor components where possible.
- Bulk import (Q11) reuses the exam CSV import shape.

**Verify:** author a question per chapter, edit, archive, re-fetch (round-trip). Mobile widths.

## P3 — Chapter progress (mentor + staff/admin)

The "living progress board."

- **API (staff/admin + mentor):**
  - `GET app/api/admin/batches/[id]/progress/route.ts` → subjects+chapters+status.
  - `POST .../subjects/[subjectId]/progress` and `.../chapters/[chapterId]/progress` →
    RPCs `set_batch_subject_progress` / `set_batch_chapter_progress`.
  - Mentor-facing mirror under `app/api/mentor/progress/route.ts` (same RPCs; RPC enforces
    assignment). Helper: `lib/batch-progress-query.ts`.
- **Staff/admin UI:** add a **"Progress" tab** to `components/batches/batch-workspace.tsx`
  (today: Details / Subjects & mentors / Schedule / Students). New
  `components/batches/progress-tab.tsx` — subjects → chapters with status chips + mark
  in-progress/completed/revert (revert per Q2). Summary counts.
- **Mentor UI:** extend `app/mentor/page.tsx` (currently only vetting status) with a
  **"My teaching"** board of assigned (batch → subject) → chapters + the same controls,
  scoped to their assignments. New `components/mentor/teaching-board.tsx`.
- **Guards:** edits only while `batch.status ∈ (open,running)`; subject-completed semantics
  per Q3.

**Verify:** as a mentor (assigned) start/complete a chapter; confirm a non-assigned mentor is
blocked; as staff complete any chapter; mobile widths.

## P4 — Student chapter quiz (self-service, ≤3 attempts)

Completing a chapter (P3) unlocks the quiz here.

- **API:** under `app/api/student/`:
  - `GET courses/[batchId]/quizzes` → `student_chapter_quizzes` (available chapters, attempts
    used/remaining, best score).
  - `POST courses/[batchId]/quizzes/[chapterId]/attempts` → `start_chapter_quiz_attempt`
    (409 when 3 used / not unlocked).
  - `GET quiz-attempts/[attemptId]` (resume), `PATCH` (save answers), `POST .../submit`.
  - Helper: `lib/chapter-quiz-query.ts`.
- **UI:**
  - `app/student/courses/[courseId]` (exists) → show per-chapter status + "Take assessment"
    (attempts x/3, best score) for completed chapters.
  - Quiz runner `app/student/quizzes/[...]/` — reuse patterns from
    `app/student/exams/[sessionId]/attempt-runner.tsx` (question nav, save, submit) but
    lightweight. Result view shows score + pass/fail (+ explanations per Q8).

**Verify:** full round-trip — start, save, resume, submit, see score; 4th attempt refused;
locked chapter hidden; mobile widths.

**#72 done when:** mentor/staff drive progress, completion unlocks the quiz, students take it
(≤3), results persist and re-read.

---

# Story #73 — Student Progress Analytics

Reads #72's data. Lands on `/student/insights` as a new section (recharts already installed).

## P5 — Aggregation RPCs + API (no new tables)

- **Migration** (`144_*`) — the read RPCs (B §6): `student_performance_summary`,
  `student_subject_scores`, `student_chapter_scores`, `student_score_trend`,
  `student_study_plan`, (+ `student_mastery_grid` if Q18 = v1). All `SECURITY DEFINER`,
  self-only on `auth.uid()`. Add index `chapter_quiz_attempt (student_id, chapter_id,
  submitted_at)`. Score basis per Q12; unattempted handling per Q14; exams-in-trend per Q15.
- **API:** `app/api/student/performance/{summary,subjects,subjects/[id]/chapters,trend,
  study-plan,mastery}` → `lib/student-performance-query.ts`. `{ ...: [...] }` shapes.

**Verify:** numbers match hand-computed aggregates for a seeded student.

## P6 — Performance charts (the visuals)

New components under `components/analytics/` (recharts), added as a **"My performance"**
section/tab on `app/student/insights/page.tsx` (reuse `PageContainer`, approval gate).

- `PerformanceSnapshot` — stat tiles (FR-1).
- `PerformanceTrend` — line chart, one y-axis, overall + optional per-subject overlay capped
  ~6 series (FR-2).
- `SubjectMasteryBars` — horizontal bars, sorted (Q17), pass-line ref, below-pass in status
  color (FR-3).
- `ChapterDrilldown` — chapter bars on subject select (FR-4).
- (Optional Q18) `MasteryHeatmap` (FR-5).
- Filters row: time range (Q16) + batch filter (FR-7). Empty/low-data states.

**Verify (dataviz method):** run `scripts/validate_palette.js` light+dark; legend for ≥2
series; hover tooltips; **table-view** toggle; dark mode; **~320–390px** (bars horizontal,
line overlay → small multiples on phones).

## P7 — Study plan (prescriptive layer)

- `StudyPlan` component at the **top** of the performance section — prioritized focus list
  (impact × achievability), quick-wins vs. needs-study, target input + projected average
  (Q20), momentum nudges. Each item one-tap to retake quiz / open material (FR-8).
- Backed by `student_study_plan` (P5). Read-only in v1 (Q21).

**Verify:** plan ranks the right chapters; projection updates with target; links resolve.

**#73 done when:** a student sees trend + subject/chapter strengths-and-weaknesses charts and
an actionable plan, mobile-first, accessible.

---

## Suggested PR breakdown (reviewable slices)

| PR | Scope | Depends on |
|---|---|---|
| **PR-1** | Migration 143: schema + RLS + permissions + RPCs (P1) | Q6,Q7,Q10,Q3,Q9 |
| **PR-2** | Assessment question bank API + admin UI (P2) | PR-1 |
| **PR-3** | Progress API + staff/admin Progress tab + mentor board (P3) | PR-1 |
| **PR-4** | Student chapter quiz API + runner + results (P4) | PR-1, PR-2 (needs questions) |
| **PR-5** | Migration 144: analytics RPCs + API (P5) | PR-4 (real data), Q12,Q14 |
| **PR-6** | Performance charts on /student/insights (P6) | PR-5 |
| **PR-7** | Study plan (P7) | PR-5 |

Each PR is independently lint/build-clean and browser-verified. PR-2 and PR-3 can proceed in
parallel after PR-1.

## Risks & watch-items

- **Taxonomy RLS** — chapter/subject/question names are exam-staff-locked; every mentor/student
  read path must go through a `SECURITY DEFINER` RPC (established pattern) or it returns empty.
- **Attempt-cap race** — enforce the 3-attempt cap in-RPC, row-locked (mirror `113`), not in
  app code.
- **Multi-college batches** — quizzes/analytics are **batch-scoped**, not college-scoped (unlike
  the exam engine) — keep scoping on `batch_id`/enrollment, not `college_id`.
- **`replace_batch_subjects` interaction** — ensure re-running it never wipes progress or the
  new `batch_subject` progress columns (it only upserts name/sort_order).
- **Chart accessibility** — don't ship color-only encodings; validator + table view are
  required, not optional.

## Out of scope (explicit)

Staff/college class-wide mastery dashboards (B O-6), peer benchmarking, saveable study-plan
checklists (Q21 fast-follow), ML-based recommendations, and unlock emails (Q5 phase 2).
