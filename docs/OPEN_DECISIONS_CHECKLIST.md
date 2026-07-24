# Open Decisions — Sign-off Checklist

**Purpose:** one place to resolve every open decision across the two requirements docs
before build. Tick each box and fill the **Decision** column; the **Recommended** column is
the default we'll build if nothing is chosen.

**Sources:**
- **[A] `CHAPTER_PROGRESS_AND_ASSESSMENTS.md`** — batch chapter progress + per-chapter quizzes (migration `143`).
- **[B] `STUDENT_PROGRESS_ANALYTICS.md`** — student performance charts + study plan (ships after `143`).

**Already locked** (for reference, not re-litigated here): assessment is a new lightweight,
batch-scoped quiz drawing from a dedicated `assessment_question` bank that mirrors
`question`/`question_option` (A·D1); students self-serve up to **3 attempts** (A·D2);
**free / any-order** chapter progression (A·D3).

**Gating decisions LOCKED (2026-07-24) at recommended defaults — building against these:**
**Q3** subject `completed` = explicit flag + derived "x/y done"; **Q6** pass mark = 40%,
configurable via `chapter_quiz.pass_pct`; **Q7** optional `chapter_quiz` override else defaults;
**Q9** read-only after batch close (no new attempts); **Q10** standalone MCQs (no
`assessment_passage`); **Q12** chapter score = best attempt; **Q14** unattempted chapters
excluded from score (shown as coverage). These are implemented in migration `143`
(Q3/Q6/Q7/Q9/Q10) and `144` (Q12/Q14). Remaining items keep their recommended defaults unless
you change them.

> Legend — **Src** = source doc·id · **Rec** = recommended default · **Decision** = your call (blank = accept Rec).

---

## Group 1 — Progress & completion rules  *(doc A)*

- [ ] **Q1 — Chapter ordering** · Src A·O-1
  Chapters have no ordering column in the DB. Add a display-only `sort_order` to `batch_chapter` (seeded from syllabus / alphabetical)?
  **Rec:** Yes, display-only. · **Decision:** ______

- [ ] **Q2 — Mentor revert** · Src A·O-4
  Can a mentor revert their own `completed → in_progress`, or staff/admin only?
  **Rec:** Mentors may revert their own. · **Decision:** ______

- [ ] **Q3 — Subject-level "completed"** · Src A·O-9
  Is subject `completed` an explicit flag, or purely derived from its chapters?
  **Rec:** Explicit flag + a derived "x/y chapters done" shown alongside. · **Decision:** ______

- [ ] **Q4 — Removing a subject/chapter mid-batch** · Src A·O-7
  Discard its progress + attempts, or block/soft-delete when attempts exist?
  **Rec:** Block removal if attempts exist. · **Decision:** ______

- [ ] **Q5 — Unlock notification** · Src A·O-8
  Notify students (email / in-app) when a chapter quiz unlocks?
  **Rec:** Phase 2 — in-app badge first, email later. · **Decision:** ______

---

## Group 2 — Assessment quiz behavior  *(doc A)*

- [ ] **Q6 — Pass mark** · Src A·O-3
  Fixed platform default or per-chapter configurable? What value?
  **Rec:** 40%, configurable via `chapter_quiz.pass_pct`. · **Decision:** ______

- [ ] **Q7 — Quiz authoring vs. auto-generate** · Src A·O-2
  Can staff author/override a chapter quiz (title, count, pass %, curated questions), or always auto-generate from the assessment bank with defaults?
  **Rec:** Optional `chapter_quiz` override; else defaults. · **Decision:** ______

- [ ] **Q8 — Post-submit review** · Src A·O-5
  After submit, show per-question review (correct answer + explanation) or score only?
  **Rec:** Score + explanations after the final attempt. · **Decision:** ______

- [ ] **Q9 — Quizzes after batch close** · Src A·O-6
  Can students take quizzes after the batch closes (revision), or does close lock them?
  **Rec:** Read-only after close; no new attempts. · **Decision:** ______

---

## Group 3 — Assessment question bank  *(doc A)*

- [ ] **Q10 — Passages** · Src A·O-10
  Does the assessment bank need passages (`assessment_passage`, like the exam bank), or standalone MCQs only?
  **Rec:** Standalone MCQs first; add passages only if needed. · **Decision:** ______

- [ ] **Q11 — Bulk import** · Src A·O-11
  Should assessment questions be importable in bulk (like `questions/import`) and shareable across chapters?
  **Rec:** Reuse the same CSV import pattern for the assessment bank. · **Decision:** ______

---

## Group 4 — Analytics metrics  *(doc B)*

- [ ] **Q12 — Chapter score basis** · Src B·O-1
  Chapter score = best attempt, latest, or average of the ≤3?
  **Rec:** Best (mastery), with improvement shown separately. · **Decision:** ______

- [ ] **Q13 — Strong/weak thresholds** · Src B·O-3
  "Strong" value (proposed 75%) and whether strong/weak is absolute (thresholds), relative (quartiles), or both.
  **Rec:** Absolute pass-line for "weak" + 75% for "strong"; quartiles as secondary. · **Decision:** ______

- [ ] **Q14 — Unattempted-but-completed chapters** · Src B·O-8
  Exclude from the subject score, or count as a gap that pulls it down?
  **Rec:** Exclude from score; surface separately as "coverage" / easy next step. · **Decision:** ______

- [ ] **Q15 — Include exams in the trend** · Src B·O-7
  Include `exam_attempt` (published exams) in the trend, or chapter quizzes only?
  **Rec:** Quizzes drive mastery; add published exams as an optional overlay. · **Decision:** ______

---

## Group 5 — Analytics charts & scope  *(doc B)*

- [ ] **Q16 — Default time window** · Src B·O-4
  Academic year vs. trailing 12 months? Include a custom range?
  **Rec:** Academic year, with last-12-months + custom options. · **Decision:** ______

- [ ] **Q17 — Subject bar sort** · Src B·O-2
  Sort subject bars weakest-first (surfaces gaps) or strongest-first (motivating)?
  **Rec:** Weakest-first, with a sort toggle. · **Decision:** ______

- [ ] **Q18 — Mastery heatmap in v1** · Src B·O-5
  Ship the subject×chapter heatmap in v1, or defer?
  **Rec:** Defer to v2; ship tiles + trend + bars first. · **Decision:** ______

- [ ] **Q19 — Peer / college benchmark** · Src B·O-6
  Show "you vs. batch average per subject"? (privacy + fairness implications)
  **Rec:** Defer; self-only in v1. · **Decision:** ______

---

## Group 6 — Study plan  *(doc B)*

- [ ] **Q20 — Projection math** · Src B·O-9
  Simple recompute ("lift these chapters to pass → new average") vs. a richer model? Show a projected number or just ranked priorities?
  **Rec:** Simple, transparent recompute; show projected average with an "estimate" caveat. · **Decision:** ______

- [ ] **Q21 — Read-only vs. saveable plan** · Src B·O-10
  Read-only guidance, or a saveable plan the student checks off (persisted state)?
  **Rec:** Read-only in v1; saveable checklist as a fast-follow. · **Decision:** ______

---

## Decisions that gate the build — ✅ LOCKED

All settled at recommended defaults (2026-07-24). Status below:

| # | Locked value | 
|---|---|
| **Q6** | ✅ `chapter_quiz.pass_pct` default **40**, configurable. |
| **Q7** | ✅ `chapter_quiz` is an **optional** override row; RPCs fall back to defaults (10 questions). |
| **Q10** | ✅ **No** `assessment_passage` — standalone MCQs only. |
| **Q3 / Q9** | ✅ Subject `completed` is an explicit flag; **closed batches block new attempts**. |
| **Q12 / Q14** | ✅ Chapter score = **best** attempt; **unattempted** chapters excluded (shown as coverage). |

Everything else can be adjusted in the app layer later without a schema change.
