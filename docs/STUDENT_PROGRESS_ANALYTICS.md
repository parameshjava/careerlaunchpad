# Student Progress Analytics — Requirements

**Status:** draft for review · **Owner:** (tbd) · **Depends on:** `CHAPTER_PROGRESS_AND_ASSESSMENTS.md` (assessment data), `021_exam_core.sql` (exam attempts)

## 1. Purpose & summary

Give each **student** a personal, year-long view of **how they're doing academically** —
rendered as charts (trend lines, bar comparisons) — so they can instantly see **which
subjects they're strong in and which they're lacking**, and drill **down to chapter level**.

Crucially, the view is **prescriptive, not just retrospective**: it turns those insights into
a concrete, personalized **plan to raise their score** — what to focus on next, which quizzes
to retake, and where the biggest, most-achievable gains are.

The raw signal already exists once `CHAPTER_PROGRESS_AND_ASSESSMENTS.md` ships:
- **`chapter_quiz_attempt`** — per-chapter quiz scores (up to 3 attempts), timestamped → the
  primary source for subject- and chapter-level performance over time.
- **`exam_attempt`** (021) — broader exam scores per sitting → optional secondary trend.
- **`batch_chapter`** — chapters completed vs. remaining → a coverage/progress dimension.

This feature **reads and visualizes** that data. It adds **no new writes** to curriculum or
assessment data — only aggregation RPCs, an API, and chart UI.

### What already exists (reused)

- **`recharts` ^3.9** is the chart library (in `package.json`).
- **`/student/insights`** (`app/student/insights/page.tsx`) already hosts student-facing
  charts (today: profile/skills/goals vs. college benchmark) built from
  `components/analytics/*` (`AnalyticsView`, `StudentComparisonView`, `InteractiveAnalytics`)
  and `lib/analytics-query.ts`. **This is where the new academic-performance view lands** —
  as a new tab/section, not a new top-level surface.
- The approval gate `requireApprovedStudent()` and `PageContainer` layout are established.

---

## 2. Actor & scope

| Actor | Access |
|---|---|
| **Student** (`student` role, **approved**) | Sees **only their own** performance, across all their batches, over a selectable time range. |

Out of scope here (already covered elsewhere or future): the **college/staff** cross-student
analytics on `/dashboard/analytics` — this doc is the **self-view**. Staff dashboards of
class-wide chapter mastery are a natural follow-up (§9, O-6) but not specified here.

---

## 3. Metrics & definitions (must be pinned before charts)

| Metric | Definition (proposed) |
|---|---|
| **Chapter score** | The student's **best** of their (≤3) attempts on that chapter's quiz, as a **percent** (`score / total_marks × 100`). *(Best = mastery; see O-1 for best-vs-latest-vs-average.)* |
| **Subject score** | Average of that subject's **completed** chapter scores. |
| **Pass line** | The quiz `pass_pct` (default 40%) — the threshold for "needs work" vs. "on track". |
| **Strong subject/chapter** | Score **≥ strong threshold** (proposed 75%) **or** top-quartile among the student's own subjects. |
| **Weak subject/chapter** | Score **< pass line**, or bottom-quartile. Weakness uses **status color**, not a categorical hue (dataviz rule). |
| **Improvement** | Best score − first-attempt score, per chapter — shows growth across the 3 tries. |
| **Coverage** | Chapters attempted ÷ chapters completed-in-batch — how much of the unlocked material they've actually assessed. |
| **Time bucket** | Attempts grouped by **month** for the trend (a year = 12 buckets); range filterable. |

> These definitions drive every number on screen; §9 lists the ones needing sign-off.

---

## 4. Functional requirements

### FR-1 — Snapshot (headline stats)
A row of **stat tiles** (not charts): **overall average %**, **pass rate** (chapters ≥ pass
line ÷ attempted), **chapters assessed / completed**, and **strongest / weakest subject**.

### FR-2 — Performance over the year (trend)
A **line chart**: x = month (selectable range, default trailing 12 months / current academic
year), y = score %. Default series = **overall average per month**; a toggle overlays
**per-subject** lines (capped — see chart spec). Answers *"am I improving?"*

### FR-3 — Subject strengths & weaknesses (comparison)
A **horizontal bar chart**, one bar per subject, value = subject score %, **sorted
weakest→strongest** (or strongest→weakest, O-2), with a **reference line at the pass mark**.
Bars **below the pass line use the "needs work" status color**; the rest use the sequential/
brand hue. Answers *"which subjects am I lacking?"* at a glance.

### FR-4 — Chapter drill-down (within a subject)
Selecting a subject reveals its **chapters** as a **horizontal bar chart** (chapter score %,
sorted, pass-line reference), so the student sees exactly **which chapters** drag a subject
down. Answers the "chapter-wise as well" requirement.

### FR-5 — Whole-picture heatmap (optional, O-5)
A **subject × chapter heatmap** (single-hue **sequential** scale, low→high score) giving the
entire mastery grid in one view — dense but powerful for spotting gaps.

### FR-6 — Auto-called-out strengths & weaknesses
A short, plain-language list: **"Strongest: …"** and **"Focus on: …"** (top/bottom N
chapters), each linking to that chapter's quiz (retake if attempts remain) or its class
material — turning insight into action.

### FR-8 — Personalized study plan (turn insight → action)
The whole point of the charts is to **help the student plan a better path to a good score**.
Above/beside the visuals, surface a **prioritized, actionable plan** derived from the same
data:
- **Prioritized focus list** — chapters/subjects ranked by **impact × achievability**: biggest
  drag on the subject score that also has **attempts remaining** or **low best-score** ranks
  highest. Each item states *why* ("Quant · Ratios — 32%, 2 attempts left") and a **one-tap
  action** (retake the quiz, or open the chapter's class material / recording).
- **"Quick wins" vs. "needs study"** — separate near-pass chapters (a retake likely clears
  them) from well-below-pass chapters (revisit material first), so effort goes where it pays.
- **Target & projection** — let the student set a **target average** (e.g. 70%) and show the
  gap plus *"lift these N chapters to pass and your average rises to ~X%"* — a concrete plan,
  not just a diagnosis.
- **Streak / momentum nudge** — highlight improvement (best vs. first attempt) to reinforce
  the behavior, and flag **completed-but-unattempted** chapters as easy next steps.

All recommendations are computed from `chapter_quiz_attempt` + `batch_chapter` (no ML in v1 —
transparent rules the student can trust). See O-9 for scope of the projection math.

### FR-7 — Filters & empty states
- **Time range** (academic year / last 12 months / custom) and, if enrolled in several
  batches, a **batch filter** — one filter row above the charts (dataviz interaction rule).
- **Empty/low-data states**: a student with no attempts yet sees an encouraging empty state,
  not broken axes; subjects/chapters with no attempts render as "not assessed", not 0%.

---

## 5. Chart specifications (per the dataviz method: form → color → validate)

> Build-time rule: **run `scripts/validate_palette.js` on the chosen categorical palette in
> both light and dark modes before shipping** — do not eyeball colorblind-safety. Charts must
> ship the full accessibility layer: legend for ≥2 series, hover tooltip/crosshair, a
> **table-view** fallback, selected dark-mode steps, and status colors with icon+label.

| Insight (FR) | Form (the data's job) | Encoding notes |
|---|---|---|
| Snapshot (FR-1) | **Stat tiles** — single headline numbers, *not* a chart | Big number + small delta vs. prior period; weakest subject tile uses status color + label. |
| Year trend (FR-2) | **Line chart** — change over time | **One y-axis** (%). Overall = single line (no legend). Per-subject overlay capped at **≤ ~6 series**; more → **small multiples** or "Other", never cycled hues. Crosshair + tooltip. |
| Subject compare (FR-3) | **Horizontal bar** — magnitude across identity | Sorted; **pass-line reference**; below-pass bars in **status "needs work"** color, others in the sequential/brand hue. Direct value labels at bar ends. |
| Chapter drill (FR-4) | **Horizontal bar** — same, one level down | Same rules; title names the subject; back-to-subjects control. |
| Mastery grid (FR-5, opt) | **Heatmap** — magnitude over 2 categories | **Sequential single hue** low→dark; neutral for "not assessed"; per-cell hover. Never rainbow. |
| Improvement (opt) | **Dumbbell / paired bar** — first vs. best | Two marks per chapter (first attempt → best), 2px surface gap; shows growth. |

**Non-negotiables that apply here:** never a dual y-axis (score and count → two charts);
color follows the **subject entity**, not its rank, so re-sorting/filtering never repaints a
subject; text stays in ink tokens, never the series color.

---

## 6. Data model & aggregation (no new tables)

All reads are the **student's own** rows; because `assessment_question`/`chapter`/`subject`
are RLS-locked, aggregation runs through **`SECURITY DEFINER` RPCs** (same pattern as
`lib/analytics-query.ts` and the syllabus RPCs), each filtering on `auth.uid()` internally.

| RPC | Returns |
|---|---|
| `student_performance_summary(p_from date, p_to date, p_batch uuid default null)` | Snapshot metrics (FR-1): overall avg, pass rate, counts, strongest/weakest subject id+name. |
| `student_subject_scores(p_from, p_to, p_batch)` | One row per subject: `subject_id, subject_name, score_pct, chapters_assessed, chapters_completed`. Feeds FR-3. |
| `student_chapter_scores(p_subject, p_from, p_to, p_batch)` | One row per chapter of a subject: `chapter_id, chapter_name, best_pct, first_pct, attempts_used, passed`. Feeds FR-4 & improvement. |
| `student_score_trend(p_from, p_to, p_batch, p_group text)` | Monthly buckets: `month, overall_pct` and (when `p_group='subject'`) `subject_id, subject_name, pct`. Feeds FR-2. |
| `student_mastery_grid(p_from, p_to, p_batch)` | `subject_id, subject_name, chapter_id, chapter_name, best_pct` — the FR-5 heatmap. |
| `student_study_plan(p_batch, p_target int default null)` | The FR-8 plan: ranked focus items (`chapter_id, chapter_name, subject_name, best_pct, attempts_remaining, gap_to_pass, category 'quick_win'/'needs_study', action`), plus target-gap + projected average if `p_target` given. Pure SQL rules, no ML. |

Source rows: `chapter_quiz_attempt` (+ `chapter_quiz_attempt_question` for marks), joined to
`batch_chapter` for names/completion, scoped by `student_enrollment`. Exam trends (FR-2
secondary) draw from `exam_attempt` where `results_published`.

### API (matches repo conventions: `{ <plural>: [...] }`, 403 gate, thin route → `lib/` helper)
```
GET /api/student/performance/summary?from&to&batch          → { summary: {...} }
GET /api/student/performance/subjects?from&to&batch         → { subjects: [...] }
GET /api/student/performance/subjects/[subjectId]/chapters?from&to&batch → { chapters: [...] }
GET /api/student/performance/trend?from&to&batch&group      → { points: [...] }
GET /api/student/performance/mastery?from&to&batch          → { cells: [...] }   (FR-5, optional)
GET /api/student/performance/study-plan?batch&target        → { plan: {...} }    (FR-8)
```
Query/aggregation helpers live in `lib/` (e.g. `lib/student-performance-query.ts`), mirroring
`lib/analytics-query.ts`. Charts consume the JSON; a **table view** renders the same JSON.

---

## 7. UX & placement

- **Location:** a new **"My performance"** section/tab on **`/student/insights`** (or a
  sibling route `/student/insights/performance`), reusing `PageContainer`, the approval gate,
  and the `components/analytics/*` patterns. Charts are **new components** under
  `components/analytics/` (e.g. `PerformanceTrend`, `SubjectMasteryBars`, `ChapterDrilldown`).
- **Reading order (top→bottom):** snapshot tiles → **study plan / prioritized focus list
  (FR-8)** → year trend → subject bars → (tap a subject) chapter bars → optional heatmap. The
  plan sits high because it's the *action* the charts justify; the charts below are the
  evidence behind it.
- **Mobile-first (primary requirement):** verify at ~320–390px. Charts must fit width
  (`ResponsiveContainer`), never force horizontal page scroll; bar charts go **horizontal** so
  long subject/chapter names stay legible on narrow screens; the per-subject line overlay
  collapses to small multiples or a single line on phones; filters stack.
- **Accessibility:** legend for multi-series, hover tooltips, a **"View as table"** toggle,
  validated **dark mode**, and status color always paired with an icon/label.

---

## 8. Non-functional

- **Correctness before pretty** — the aggregation RPCs are the source of truth; the table view
  and the chart must show identical numbers.
- **Performance** — aggregate in SQL (not in the browser); index `chapter_quiz_attempt` on
  `(student_id, chapter_id, submitted_at)`; a year of one student's attempts is small, so no
  caching needed initially.
- **Privacy** — strictly self-only; RPCs never accept another student's id; no peer scores
  shown (peer benchmarking is a separate, opt-in decision — O-6).

---

## 9. Open decisions (need product input)

| # | Question | Proposed default |
|---|---|---|
| **O-1** | Chapter score = **best** attempt, **latest**, or **average** of the ≤3? | **Best** (mastery), with improvement shown separately. |
| **O-2** | Subject bars sorted **weakest-first** (surfaces gaps) or **strongest-first** (motivating)? | Weakest-first, with a sort toggle. |
| **O-3** | **Strong** threshold value (proposed 75%) and whether "strong/weak" is **absolute** (thresholds) or **relative** (quartiles) or both. | Absolute pass-line for "weak" + 75% for "strong"; quartiles as secondary. |
| **O-4** | Default time window — **academic year** vs. **trailing 12 months**? Include a custom range? | Academic year, with last-12-months and custom options. |
| **O-5** | Ship the **subject×chapter heatmap** (FR-5) in v1, or defer? | Defer to v2; ship tiles + trend + bars first. |
| **O-6** | Show **peer/college benchmark** (e.g. "you vs. batch average per subject")? Privacy + fairness implications. | Defer; self-only in v1 (existing insights already benchmark profile, not scores). |
| **O-7** | Include **exam_attempt** (published exams) in the trend, or **chapter quizzes only**? | Quizzes drive subject/chapter mastery; add exams as an optional overlay. |
| **O-8** | How to treat **unattempted-but-completed** chapters — exclude, or count as a coverage gap that pulls the subject score down? | Exclude from score; surface separately as "coverage" and as an FR-8 "easy next step". |
| **O-9** | **Projection math** for the study plan — simple ("lift these chapters to pass → recompute average") vs. a richer model? Show a projected number or just ranked priorities? | Simple, transparent recompute; show projected average with a "estimate" caveat. |
| **O-10** | Should the study plan be **read-only guidance**, or a **saveable plan** the student checks off (persisted state)? | Read-only guidance in v1; saveable checklist as a fast-follow. |

---

## 10. Build plan

1. **Migration** — aggregation RPCs (§6) + the `chapter_quiz_attempt` index; no new tables.
   Ships **after** `143` (the assessment tables must exist first).
2. **API** — `app/api/student/performance/*` routes → `lib/student-performance-query.ts`.
3. **UI** — new `components/analytics/*` chart components (recharts) + a "My performance"
   section on `/student/insights`; **run the palette validator** (light + dark), add the
   table-view fallback, verify at ~320–390px.
4. **Lint + build** (`npm run lint && npm run build`) and browser-verify every chart, including
   empty/low-data states, dark mode, and the mobile layout.

---

## 11. Traceability — requirement → spec

| Original requirement | Covered by |
|---|---|
| See progress **in a year** through **graph/bar charts** | FR-2 (line trend), FR-3 (bars), §5 chart specs |
| Identify subjects they are **lacking** | FR-1 (weakest tile), FR-3 (below-pass bars), FR-6 |
| Identify subjects they are **good at** | FR-1 (strongest tile), FR-3, FR-6 |
| **Chapter-wise as well** | FR-4 (chapter drill-down), FR-5 (heatmap), `student_chapter_scores` |
| Helps them **plan better to approach a good score** | FR-6 (call-outs), **FR-8 (personalized study plan + target/projection)**, `student_study_plan` |
