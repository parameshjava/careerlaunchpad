# Reference Catalogue — Degree → Branch (issue #99)

**Status:** BUILT (2026-08-05) · migrations `161_degree_branch_map.sql`, `162_year_of_study_anchor.sql` · screen `/dashboard/reference`
**Next free migration:** `163_*`

> A high-effort code review of this change found 10 defects; all are fixed, and the fixes are folded **into 161/162 themselves** rather than a follow-up migration — neither had been committed or applied anywhere but the preview DB, so there was no history to preserve and a reviewer reads two coherent files instead of three.

---

## 1. What was broken

`ref_degree` (13 rows) and `ref_branch` (10 rows) were two **flat, unrelated** lookup tables from migration 010. Consequences:

- The form offered every branch to every degree, so `degree='mba' + branch='civil'` was accepted — by the UI *and* by `loadRefs()`, which validated each slug against its own table only.
- The branch list was **engineering-only** (CSE/IT/AI&ML/DS/ECE/EEE/Mech/Civil/Chem/Other), so a B.Sc, B.Com or B.A student had **no correct option** and was pushed into "Other" — where their real answer was then **discarded**.
- `ref_year_of_study` offered 4th Year to everyone, so a 3-year B.Sc student could claim a year they don't have.
- The admin grids rendered raw slugs (`btech — cse`).

The same defect existed on the mentor form and the admin Excel intake.

## 2. Data model (migration 161)

```
ref_degree   + branch_mode ('required'|'optional'|'none') · level · duration_years · search_terms
ref_branch   + family · search_terms          (143 rows: the 10 original slugs KEPT + 133 new)
ref_degree_branch (degree_slug, branch_slug, sort_order, group_label, is_active)   -- 248 pairs
ref_data_audit (table_name, row_key, action, before, after, actor_id, created_at)
student_profile / mentor_profile  + degree_other · branch_other
ref_year_of_study  + year_5, year_6 (final_year/passed_out moved to the end)
permission 'refdata.manage'  → granted to platform_admin; owner inherits via '*'
```

Research basis for the catalogue: **AP/TS EAPCET** counselling branch codes (B.Tech/B.E), **AP SBTET C-20** (Diploma — a polytechnic "Computer Engineering (CME)" is *not* `cse`), **APSCHE OAMDC + CBCS** (B.Sc/B.Com/B.A/BBA/BCA/B.Voc — including **both** the pre-2025-26 *combinations* (MPC, MPCs, BZC, HEP…) and the 2025-26 *single majors*, because both generations are in the funnel right now), **AP PGECET** (M.Tech/M.Pharm specialisations — a different list from UG branches), and **AP/TS ICET** (MBA/MCA admit to the bare programme, hence `branch_mode = 'none'`).

### Four decisions worth knowing

1. **The relation is `(degree, branch)`, not `branch.degree_id`.** "Computer Science" under B.Sc, "Computer Science & Engineering (CSE)" under B.Tech and "Computer Engineering (CME)" under Diploma are three different things, while Data Science / AI&ML / Biotechnology legitimately appear under several degrees. Many-to-many with per-degree ordering is the only shape that expresses it.
2. **`group_label` is on the mapping, not on `ref_branch.category`.** The issue proposed grouping by `ref_branch.category`, but a shared branch belongs to different groups under different degrees (`data_science` is "Engineering" under B.Tech, "Single major" under B.Sc) and one global column can't be both. The UI groups by `group_label ?? branch.category`. **This is the one deliberate deviation from the issue's spec.**
3. **`ref_branch.label` is globally UNIQUE (enforced by index).** `lib/intake-excel.ts` resolves an imported Branch cell by label→slug through a `Map`, so two rows sharing a label would silently import as the *wrong* branch. Hence `General (Commerce)` / `General (Management)` / `General (Computer Applications)` rather than three rows labelled "General".
4. **`ref_branch.family`** (12 buckets: computing, electronics, mechanical, civil, chemical, science, commerce, arts, management, pharmacy, vocational, health) is the stable coarse axis for `ref_mentor_preference.same_branch` and branch-keyed analytics. Without it, going from 10 to 143 branches would stop a B.Sc `computer_science` student ever matching a B.Tech `cse` mentor, and shatter every branch chart into slivers.

### Idempotency: the seed is a baseline, the DB is truth

Admins edit this catalogue, so a re-run of 161 must never undo their work. Every insert is `on conflict do nothing` (**never** `do update`); every attribute backfill is guarded either by `where <col> is null` (fills a gap, can't overwrite) or by `where <col> = '<the exact 010 seed value>'` (a one-time correction that no-ops on the second run and skips any row an admin has since renamed).

`branch_mode` is added **nullable**, backfilled, then set `not null` + defaulted — adding it with a default would have stamped every existing row and made "never seeded" indistinguishable from "an admin set this".

### Backfill

Rows the old unrelated dropdowns allowed but the new rules forbid, in order: drop the branch on a `branch_mode='none'` degree → remap the plausible engineering-on-a-science-degree cases (`bsc+cse → computer_science`, `bcom+cse → com_computers`, `bca+cse → ca_general`, …) → park anything still unmapped on `other` (visible to the student, who re-picks from a correctly filtered list) → clear a branch with no degree at all. Applied to `student_profile`, `mentor_profile` **and** `student_intake` (a bad pair staged there would reappear as a bad profile on claim).

## 3. One source of truth: `lib/degree-branch.ts`

Dependency-free (no supabase, no `next/*`) so the **same** functions run in the student form, the mentor form, both PATCH validators, the Excel intake and the admin screen:

| Export | Job |
|---|---|
| `branchesForDegree` | the ordered, grouped options for a degree |
| `branchModeOf` / `degreeHasBranch` | whether to render Branch at all |
| `isPairAllowed` | the single predicate every validator calls |
| `resolveBranchPair` | the four-rule cross-field reconciliation (see the API doc) |
| `yearsForDegree` | Year of Study capped by `duration_years` |
| `groupContiguously` | gather option groups without re-sorting the caller's order |
| `normalizeSearch` / `matchesQuery` | alias + punctuation-insensitive search |
| `courseLabel` / `labelWithOther` | display, including the "Other" write-in |

`groupContiguously` ranks groups by **first appearance**, not by each group's lowest `sort_order` — a row's `sort_order` is a *global* fallback, so min-sort_order put B.Sc's "Single major" block above "Common combinations" purely because it contains `aiml` (global sort 3).

## 4. UI

- **`components/ui/combobox.tsx`** — a new searchable, grouped single-select with RefSelect's prop shape. `RefSelect` is a bare Radix `<Select>` with no filtering and no groups, which is unusable at 20–32 options on a 320px phone. Hand-rolled rather than adding `cmdk`. Mobile = a near-full-height bottom sheet; `sm`+ = a **portalled, measured** popover. ≥44px rows, sticky group headings, 16px search input (or iOS Safari zooms the page), full keyboard nav + `aria-activedescendant`, and a no-match hint that points at **Other** instead of dead-ending.

  **Four things the panel has to get right, each of which broke a real screen first:**
  1. **Don't get clipped.** An `absolute` panel is cut off by any ancestor with `overflow-hidden` — the student form's Branch dropdown was being sliced by its own `Card`. It now portals to `<body>` and positions `fixed`.
  2. **Don't run past the fold.** Anchored under a trigger low on the page with a fixed `max-h-72` (288px ≈ 8 rows), most of a 30-branch list was unreachable. It now measures the trigger, **flips above** it when there is more room there, and caps the height to the space actually available (≤60vh) — ~12–14 rows instead of 4. Re-measured on scroll and resize.
  3. **Paint and receive clicks inside a modal.** Portalling makes the panel a *sibling* of a Radix dialog, not a descendant, so it needs `z-[60]` (over the dialog's `z-50`) **and** `pointer-events-auto` — an open Radix modal sets `pointer-events: none` on `<body>`, which otherwise left the catalogue's "Preview as student" list fully visible and silently swallowing every click.
  4. **Only show group headings when there is more than one group.** All 30 B.Tech branches are "Engineering", and one sticky heading pinned over a scrolling list just read as a stray row appearing mid-list. B.Sc (two generations) still gets its headings.
- **`components/registration/degree-branch-fields.tsx`** — the dependent Degree + Branch group, shared by the student and mentor wizards so they can't diverge.
- **`/dashboard/reference`** — folder tabs (`docs/STYLE_GUIDE.md`): **Mapping**, **Degrees** / **Branches** (`DataTable` with search + faceted filters), **Other answers**, **History**.

### The Mapping tab took three attempts; the first two are instructive

1. *"Add a branch" behind an overlay combobox.* Wrong: mapping a degree means repeatedly comparing what's in against what's out, and an overlay hides one side every time you reach for the other.
2. *Two side-by-side panels, each scrolling inside a fixed 26rem box.* Also wrong: B.Tech has 30 branches and B.Sc 32, so a 26rem window showed four at a time and "see all the branches for this degree" became impossible.
3. **What shipped:** pick a degree and its WHOLE list renders — **no inner scroll, no row cap** — one dense line per branch, in student order, under the same group headings the dropdown shows. Each row carries its heading (a free-text input with a native `<datalist>` of headings already in use), **↑ / ↓** to reorder, **✎** to edit the branch itself in the same dialog the Branches tab uses, and **✕** to unmap it. Below it, an **Add branches** section searches the remaining catalogue with checkboxes for multi-add — that one *does* scroll internally, because it is a search result over 113 rows, not the thing you came here to read. Nothing writes until **Save mapping**; **Discard** restores.

Moving a row across a group boundary makes it **adopt the destination heading**, so a branch moved into "Single major" doesn't keep saying "Common combinations" and re-open a one-row group where it landed.

### Five things that bit, and how they're handled

1. **`ref_*` had no write policies at all** (010 created only `for select using (true)`). Rather than route catalogue writes through the service-role key — which bypasses RLS entirely — 161 adds insert/update policies gated on `has_permission('refdata.manage')`, so the API uses the normal authed client and the database enforces it a second time. **DELETE is not granted** on `ref_degree`/`ref_branch`.
2. **The 1-hour cache made the editor look broken.** `lib/ref-cache.ts` had no `tags` and the repo had zero `revalidateTag` usage, so a new branch wouldn't reach students for up to an hour (and inconsistently, since Vercel's Data Cache persists across instances). Every cached reader now carries `tags: [REF_DATA_TAG]` and every mutation calls `bustRefCache()`. Verified end-to-end: admin PATCH → the student reference API serves the new label on the next request.
3. **Nothing protected a branch in use** (`student_profile.branch` is a plain slug, no FK). No hard delete from the UI; `is_active = false` only; the confirm dialog states the live student + mentor counts; a deactivated-but-held branch still renders its label (`getDegreeBranchLabels()` deliberately does **not** filter `is_active`).
4. **Labels are editable, slugs are not.** Slug inputs are read-only after create. A genuine rename/merge would have to UPDATE the affected profiles in the same transaction — a deliberate action, not a field edit.
5. **The audit actor is stamped by a trigger, not a column default.** `create table if not exists` means a DEFAULT never lands on a database where the table already exists, and a missing default would fail every audit insert against the pinning policy — losing the trail exactly where it matters. The trigger is reinstalled on every run and *overwrites* whatever the client sends. It resolves `acting_user()` (migration 160), never `auth.uid()`: during a "View as" session `auth.uid()` **is** the impersonated user.

## 5. Year of study stops going stale (migration 162)

`year_of_study` stored a RELATIVE fact ("3rd Year") as an absolute snapshot, and nothing ever advanced it — no trigger, no cron, no other writer in 161 migrations. A student who answered "3rd Year" in 2026 read "3rd Year" in 2030, nobody aged into `passed_out`, and enrolling "the 3rd years" into a batch pulled a stale cohort including students who had already graduated. Two live rows were already inconsistent before any rollover, because the same students had also given a `graduation_year` that contradicted their year, with nothing reconciling the two.

**We still ask for the year, and never ask for the admission year.** Students reliably know "I'm in 3rd year"; "admission year" is ambiguous to them between the calendar year they joined, the academic-year label, and the year the course started — and for lateral entry none of those agree. So the form keeps asking the answerable question and derives the anchor from it:

```
ayEnd(d) = year(d) + (month(d) >= JUNE ? 1 : 0)     // academic year, named by its END
capture:  entry_academic_year = ayEnd(answered_at) − N
read:     N                   = ayEnd(now)          − entry_academic_year
```

The two are mirror images, so answer → anchor → answer is **idempotent** — a student who reopens Step 2 next July sees the derived "Final Year" and saving it re-anchors to the same integer. That property is what makes it safe to show a derived value in an editable field.

| Design point | Why |
|---|---|
| Anchor stamped by a **trigger**, not at call sites | `year_of_study` has six writers, two of them large SQL functions with fixed column lists (migration 133). Per-call-site anchoring would miss one today and drift when a seventh appears — the same reasoning migration 160 records for the registration audit. |
| `entry_academic_year` is in `DERIVED_FIELDS`, not `STEP_FIELDS` | Selected so read paths can derive; rejected as a client field, so a crafted PATCH can't back-date a cohort. Verified: `400 fields not allowed in step 2: entry_academic_year`. |
| `year_of_study` is **kept** | The override and the fallback. Derivation is impossible for `passed_out` (no anchor) and for a degree with no `duration_years` (`other`), and it's the escape hatch for a repeat/gap year/transfer — re-answering the year re-anchors. |
| **Numbered years only** — `final_year` is retired | Offering "Final Year" *alongside* the numbered years put two options for the same year in every list ("2nd Year"/"Final Year" for a 2-year MCA, "4th Year"/"Final Year" for a 4-year B.Tech), and whichever the student picked, the derived label rendered as the other one. Stored values were migrated to their numeric equivalent (lossless — we know the degree's length) and the option deactivated, so it vanishes from the form *and* the Excel template. `yearNumberOf()` still **reads** it, so any row that couldn't be converted still derives correctly. |
| Year of Study is **disabled until a degree is chosen** | Same rule as Branch: the valid year list is *derived* from the degree's length, so offering it first would let a student answer a question that can't yet be validated — and then silently narrow it under them. |
| Derived at the **API boundary**, not in the client | The client would need ref data loaded before it could derive (a first-paint race), and the enrolment filter has to derive server-side anyway. |
| The enrolment filter **inverts** the question | A derived value can't be matched in SQL, so `?year=year_3` resolves to `entry_academic_year = ayEnd − 3` — an equality on an indexed int. Still scales to thousands; no JS post-filtering. Un-anchored rows fall back to the stored slug. |
| `graduation_year` is derived-but-editable, and **tracks** | Auto-filled from the anchor. On a re-anchor it updates *only if it still equals what the previous anchor implied* (i.e. it was auto-filled and untouched); a hand-typed value survives, and its disagreement becomes the signal for a repeat/gap year rather than reading as a typo. The FORM applies the identical rule via `retrackedGraduationYear()` — an earlier cut only filled a blank field, so changing 3rd → 4th Year left a stale year on screen that the server then silently corrected on save. |
| The June boundary is **policy** | Duplicated as `ACADEMIC_YEAR_START_MONTH` (live reads) and a literal `6` in 162's one-time backfill. Both must change together — the same documented duplication CLAUDE.md accepts for the navbar `clamp()` values. |

Backfill anchors existing rows from `registration_started_at` (issue #83's audit) — **when they answered**, not `now()`, since anchoring a 2024 answer to today would silently rewrite that student's history.

**Known edge, recorded rather than papered over:** the intake→profile claim merge copies `year_of_study` but not the anchor (fixed column list), so the trigger re-derives it from `now()` at claim time. An import and claim straddling the June boundary anchors that student one year late. Imports happen at admission (June–August) with claims following within days, so it's rare; the fix is the same as for a repeater — re-answer the year. Threading it through properly means re-declaring migration 133's functions, a bigger correctness risk than the edge it removes.

## 6. Consequences handled in the same change

- **Grids show labels, not slugs** — `lib/students-query.ts` and `lib/enrollment-query.ts` resolve through `courseLabel()`; fee receipts no longer print `btech · cse`.
- **Excel intake** — flat Branch dropdown + a visible `Degree → Branch` sheet + per-row server-side enforcement (see the API doc).
- **Mentor matching / analytics** — `ref_branch.family`.
- **Year of Study** — derived from `duration_years`, in the form and on import.

## 7. Known gaps (deliberate, non-blocking)

- **PG specialisations are not `branch`.** MBA/MCA *do* have specialisations, but they're chosen in year 2 and AP/TS ICET admits to the bare programme, so this story specs "no branch". If placements later want that data it belongs in a separate optional `specialization` column — reusing `branch` would put "Finance" in the same column as "Civil" and break every branch filter and rollup.
- **The mapping is state-wide, not per-college.** A college running only CSE/ECE/EEE still shows all 30 B.Tech branches. A later `college_branch` table can narrow it; nothing here blocks that.
- **No locale column.** Telugu labels would be a `label_te` column or a `ref_*_i18n` table, not a rework of this mapping.
- **Mapping reorder is ↑/↓, not drag-and-drop** — a 44px tap target reorders reliably on a phone; a drag handle inside a scrolling list does not.
