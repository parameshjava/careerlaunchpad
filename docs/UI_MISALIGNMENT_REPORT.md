# UI Misalignment Report

_Generated 2026-07-24. Audit of four UI-consistency concerns across the CareerLaunchpad app surface. Each section lists what exists today, every divergent implementation with `file:line` references, and a proposed solution for your review._

> **Status: IMPLEMENTED (2026-07-24).** All five areas migrated in one combined change. New shared primitives: `components/app-shell/page-container.tsx`, updated `components/ui/accordion.tsx` (circular chevron), `components/colleges/college-picker.tsx`, `lib/format-date.ts` + extended `components/ui/date-picker.tsx`, `components/data-table-parts.tsx` (`SortHeader`/`StatusBadge`), `components/calendar/schedule-calendar.tsx` (shared grid, now on admin + student). Consumers migrated across ~40 files; STYLE_GUIDE updated. `npx tsc --noEmit` and `npm run build` pass clean. (Also fixed an unrelated runtime error surfaced during testing: the mentors PostgREST embed in `lib/mentors-query.ts` — disambiguated by FK constraint after migration 134 added colliding relationships.)

---

## Executive summary

| #   | Area                | Verdict                                                                                                 | Impl. count                         | Recommended fix                                                                          |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Accordions          | Shared component exists but is used **once**; expand/collapse done 6 different ways                     | 6 different ways                    | Standardize on `components/ui/accordion.tsx` with the **circular chevron** everywhere    |
| 2   | College search      | One clean API, but the picker is **re-implemented 6×** in 4 different shapes                            | 6 UIs, 2 both named `CollegePicker` | Build one canonical `<CollegePicker>` and migrate all callers                            |
| 3   | Tables & structures | **Three parallel table stacks**; only 4 screens use the shared `DataTable`                              | 3 stacks / ~13 tables               | Migrate list screens onto `DataTable`; extract shared `SortHeader` + status-badge helper |
| 4   | Desktop width       | Shell allows 1536px, but STYLE_GUIDE caps pages at 768–1024px; 4 pages ignore the cap and go full-width | Inconsistent per-page caps          | Pick one width policy and encode it in the shell + style guide                           |
| 5   | Calendar / dates    | Good shared date-picker stack, mostly used; but a forked DOB picker and **no shared date formatter** (dates render ≥4 ways) | 1 fork + ≥4 format styles | Add one `lib/` date formatter; extend `DatePicker`; delete the fork                     |

Overall theme: **shared components exist but are under-adopted.** The fix in every case is consolidation onto one primitive plus a style-guide rule, not new infrastructure.

---

## 1. Accordions — "just an accordion without a circle to it"

### Do we have a component and reuse it?

Yes, a component exists — but it is barely used, and two screens use a hand-rolled variant with the circular chevron badge you want removed.

**Shared component:** `components/ui/accordion.tsx` — shadcn/Radix `Accordion` / `AccordionItem` / `AccordionTrigger` / `AccordionContent`. Uses a **plain chevron** (lines 51–52), no circle. Radix is installed via the unified `radix-ui` meta-package. There is no `collapsible.tsx`.

**Only one consumer:** `app/dashboard/exams/blueprints/blueprint-editor.tsx:488–695`.

### The "circle" — two spots, byte-identical

Both wrap the chevron in a `size-7 rounded-full border shadow-sm` purple badge:

- `components/competitive-exams/subject-chapter-picker.tsx:113–117`
- `components/students/tell-us-step.tsx:242–243` (used 5×)

### Every other expand/collapse (all hand-rolled)

| File:line                                                               | Mechanism          | Icon                                                       |
| ----------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `components/app-shell/ConsoleShell.tsx:113–124`                         | `useState`         | plain chevron, `-rotate-90` closed                         |
| `app/student/exams/[sessionId]/attempt-runner.tsx:884–895`              | `useState`         | plain chevron, `-rotate-90`; **no `aria-expanded`**        |
| `components/batches/batch-roster.tsx:320–328`                           | `useState`         | swaps `ChevronDown`↔`ChevronRight`; **no `aria-expanded`** |
| `app/dashboard/exams/evaluate/session/[sessionId]/answer-key.tsx:21–45` | `useState`         | text button, no icon                                       |
| `app/student/exams/[sessionId]/attempt-runner.tsx:702–717`              | native `<details>` | text swap, no icon                                         |

### Inconsistencies

1. **Circle vs plain chevron** (the flagged issue) — 2 files use the circular badge; everything else uses a bare chevron.
2. **Rotation convention** differs 4 ways: icon-swap (shared), `180deg`, `-90deg`, icon-swap-no-rotate.
3. **Hard-coded hex** (`#7c3aed`/`#2563eb`) header bands in the circle variants vs theme tokens elsewhere.
4. **Accessibility**: attempt-runner band-collapse and batch-roster omit `aria-expanded`.
5. **Three underlying mechanisms** for one UX: Radix, `useState`, native `<details>`.

### Proposed solution — DECIDED: standardize on the **circular chevron** everywhere

> **Decision (2026-07-24):** All accordions should have a **chevron inside a closed circle** — the `subject-chapter-picker`/`tell-us-step` style is the standard, not the exception. (This reverses the original "without circle" note.)

- **A. Promote the circle into the shared component.** Update `components/ui/accordion.tsx` so its `AccordionTrigger` renders the chevron inside a closed-circle badge (a `rounded-full border` wrapper), driven by **theme tokens** (not hard-coded `#7c3aed`/`#2563eb`). This becomes the single accordion look.
- **B. Standardize all consumers on it.** Migrate `subject-chapter-picker`, `tell-us-step`, `ConsoleShell` section collapse, `attempt-runner` band collapse, and `batch-roster` row-expand to the shared component so they all inherit the circular chevron + `aria-expanded`. Keep the native `<details>` only for the trivial anti-cheat notice.
- **C. Guardrail.** Add a STYLE_GUIDE line: "Collapsible sections use `components/ui/accordion.tsx` (circular chevron, `aria-expanded`, theme tokens). No custom toggles."
- **Scope:** medium — one component change plus consumer migrations.

---

## 2. College search — same component everywhere?

### Verdict: No. The data layer is clean; the UI is duplicated 6×.

**Single API (good):** all typeaheads hit `app/api/colleges/search/route.ts` (auth-gated `ilike` over name/place/district/code, capped 30). Types/validation centralized in `lib/college.ts`. Supporting: `universities`, `states`, `route.ts` (CRUD).

**Six UI implementations in 4 shapes:**

| #   | Picker                                                          | Used by                                                | Kind                                          |
| --- | --------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| 1   | `components/students/college-picker.tsx` (`CollegePicker`)      | Excel import (`import-client.tsx:88`)                  | exported component                            |
| 2   | `components/analytics/CollegePicker.tsx` (`CollegePicker`)      | analytics, users invite/roles, blueprint-editor        | exported component (2nd one, same name)       |
| 3   | `components/students/registration-fields.tsx:490–528` (private) | student self-register **and** admin add-student wizard | file-private copy                             |
| 4   | `components/mentor/mentor-fields.tsx:238–276` (private)         | mentor self-register **and** admin add-mentor          | file-private copy (near byte-identical to #3) |
| 5   | `components/batches/enrol-students.tsx:67–109`                  | batch enrollment college filter                        | inline, no debounce                           |
| 6   | `components/batches/batch-editor.tsx:65–150`                    | batch editor multi-select chips                        | inline, no debounce                           |

### Inconsistencies

1. **Two exported components both named `CollegePicker`** with incompatible props (`college`/`onPick` vs `selected`/`onSelect`/`onClear`/`disabled`).
2. **Six copies** of the same fetch+debounce logic.
3. **Divergent selected-state UX**: details panel + Change/Clear (#1, #2) vs name-crammed-into-input with no clear affordance (#3, #4) vs input + X (#5) vs chips (#6). The **highest-volume path (registration) gets the weakest variant.**
4. **Debounce**: #1–#4 = 250ms; #5, #6 fire per keystroke.
5. **Outside-click-to-close** only in #2.
6. **z-index / surface tokens** diverge (`z-10 bg-background` vs `z-20 bg-popover`).
7. **Required-marker** for the same "College" field rendered 3 different ways.
8. **Stale doc comment** in `students/college-picker.tsx` claims it backs the add-student dialog — it doesn't (that uses copy #3).
9. `components/exam/SearchableSelect.tsx` (a generic searchable select) already exists but no college surface uses it.

### Proposed solution

- **A. One canonical `<CollegePicker>`** — promote `analytics/CollegePicker.tsx` (the most complete: details panel, Change/Clear, outside-click, disabled/locked mode, controlled + uncontrolled) into a shared location (e.g. `components/colleges/CollegePicker.tsx`) with a single documented prop API. Support single-select and a `multi` mode (for batch-editor chips) and a lightweight `filter` variant.
- **B. Migrate all 6 callers** to it; delete the private copies (#3, #4) and inline versions (#5, #6); remove the duplicate-named `students/college-picker.tsx`.
- **C. Standardize** debounce (250ms), outside-click-close, z-index/token usage, and the required marker across the single component.
- **D.** Fix the stale doc comment.
- **Scope:** medium. Biggest UX win: registration/mentor flows gain the proper details + clear affordance.

---

## 3. Tables and structures

### Verdict: Three parallel table stacks; the shared `DataTable` covers only 4 of ~13 screens.

**Shared building blocks:** `components/data-table.tsx` (TanStack — search, faceted filters, column visibility, sorting, pagination, selection, empty state; **no loading state**) and `components/ui/table.tsx` (shadcn primitives; the `Table` primitive already self-wraps in `overflow-x-auto`).

**A — Uses shared `DataTable` (consistent, full-featured):**
- `app/dashboard/page.tsx:109` (students) · `components/analytics/InteractiveAnalytics.tsx:77` (reuses students columns) · `app/student/exams/exams-list.tsx:101/119` · `app/dashboard/exams/sessions/[id]/roster-table.tsx:202`

**B — shadcn `<Table>`, hand-built header/body (no TanStack; no sort/filter/paginate):**
- `components/colleges/CollegesManager.tsx:568` (reinvents client-side sort) · `competitive-exams-list.tsx:67` · `courses/courses-list.tsx:69` · `batches/batches-list.tsx:47` · `batches/batch-roster.tsx:307` · `students/my-fees.tsx:159`

**C — Raw HTML `<table>` with bordered `cell` const:**
- `employers/employers-manager.tsx:38` · `users/platform-users-table.tsx:188` · `students/import/import-client.tsx:141`

**D — Print/report tables** (raw HTML, judged separately — intentionally hand-rolled).

### Inconsistencies

1. **Three table stacks** with wildly varying feature parity (search/sort/filter/paginate vs none).
2. **`SortHeader` reimplemented 4×** plus 3 inline copies in `students/columns.tsx`.
3. **CollegesManager reinvents sorting** that `DataTable` provides free.
4. **Two visual languages:** borderless shadcn rows vs fully-bordered `cell`-const grids (the `cell` string is copy-pasted in employers + platform-users).
5. **Status-badge color map** duplicated across 5–6 files.
6. **Empty-state inconsistency:** in-table `colSpan` vs sibling-div-replaces-table.
7. **No loading state** anywhere.
8. **Redundant overflow wrappers** on group B (harmless); **one genuinely missing** wrapper at `consolidated-results.tsx:107` (page-level horizontal-scroll risk on mobile).
9. **Pagination only in `DataTable`** — every other list renders all rows.

### Proposed solution

- **A. Standardize on `DataTable`.** Migrate the strongest candidates: `CollegesManager`, `courses-list`, `batches-list`, `competitive-exams-list`, `employers-manager`, `platform-users-table`. They gain sort/filter/paginate/empty-state for free and lose bespoke code.
- **B. Extract shared helpers:** one `SortHeader` (delete the 4 copies + 3 inline) and one `statusBadge(status)` color helper (delete the 5–6 maps). Put both near `components/data-table.tsx`.
- **C. Add a loading/skeleton state** to `DataTable` so every grid gets it.
- **D. Fix the overflow bug** at `consolidated-results.tsx:107` (wrap in `overflow-x-auto`).
- **E. Pick one visual language** — recommend borderless shadcn rows; retire the bordered `cell` const.
- **Scope:** large but incremental — migrate one list per PR. Items B & D are quick standalone wins.

---

## 4. Use the full page width on desktop

### Verdict: The shell allows 1536px, but the STYLE_GUIDE mandates per-page caps of 768–1024px, and 4 pages ignore the cap entirely — so the width jumps as you navigate.

**Architecture — two nested caps:**
- Shell: `components/app-shell/ConsoleShell.tsx:242–243` — `<main>` content centered at **`max-w-screen-2xl` (1536px)**, minus a `w-60` sidebar. Generous — not the cause.
- `SiteHeader` is **full-bleed** (no inner max-width) — so on wide screens the header spans full width while page content sits in a narrower centered column (visible mismatch).
- Per-page: almost every page re-wraps content in its own `mx-auto max-w-*`, and **that** is the effective width.

**STYLE_GUIDE (`docs/STYLE_GUIDE.md:33–43`)** prescribes `max-w-3xl` forms / `max-w-4xl` lists / `max-w-5xl` wide — i.e. the narrow columns are **documented intent**, not a bug. The guide has **no desktop/wide guidance at all** (line 10 is mobile-only).

**The inconsistency — 4 pages omit the cap and go full-width (1536px):**
- `app/dashboard/page.tsx:44` · `app/dashboard/colleges/page.tsx:17` · `app/dashboard/analytics/page.tsx:46/70` · `app/dashboard/users/page.tsx:115`

Everything else is boxed to 896–1024px (full list of ~30 pages with exact `max-w-*` values captured in the audit). Navigating between them makes the content column visibly jump wider/narrower.

### Proposed solution — DECIDED: **Go wide**

> **Decision (2026-07-24):** Use the full desktop width. Named width tiers:
>
> | Tier | Width | Applies to |
> |------|-------|-----------|
> | `full` | `max-w-screen-2xl` (1536px) | dashboards, analytics, lists, tables, grids |
> | `wide` | `max-w-5xl` | mixed detail + grid pages |
> | `reading` | `max-w-4xl` | detail / reading pages |
> | `form` | `max-w-3xl` | single-column forms (kept narrow for readability) |

- **A. Introduce a shared `<PageContainer variant>` wrapper** encoding the four tiers so pages stop hand-picking `max-w-*`. Migrate all ~30 pages (Section 2 list) onto it.
- **B. Raise lists/tables/grids/dashboards to `full`**; fix the 4 outliers (`dashboard/page`, `colleges`, `analytics`, `users`) so nothing jumps.
- **C. Cap `SiteHeader`'s inner content** to the same width so header and body align.
- **D. Rewrite `docs/STYLE_GUIDE.md:33–43`** to encode the tiers as the rule.
- **Scope:** medium — mostly mechanical per-page edits + the wrapper + style-guide rewrite.

---

## 5. Calendar & date pickers — "we have different, need the same across"

### Verdict: A good shared date-picker stack exists and is mostly used — but there's one forked picker, one stray native input, and (the bigger issue) **no shared date formatter**, so dates render differently across screens.

**Shared stack (the intended standard, already used in batch/exam admin forms):**
- `components/ui/calendar.tsx` — shadcn `Calendar` over `react-day-picker@^10`.
- `components/ui/date-picker.tsx` — `DatePicker` (date-only, `"YYYY-MM-DD"`, drop-in for `<input type="date">`).
- `components/ui/date-time-picker.tsx` — `DateTimePicker` (`"YYYY-MM-DDTHH:mm"`).
- Consumed correctly in `batch-schedule.tsx:455/487/491/626`, `blueprint-editor.tsx:873`, `batch-roster.tsx`, `batch-editor.tsx`.
- Note: `date-fns@^4` is installed but **never imported directly** — all formatting is hand-rolled.

**Outliers / inconsistencies:**
1. **Forked DOB picker** — `components/students/tell-us-step.tsx:303–343` (`DobPicker`) re-implements the Popover+trigger of `DatePicker` just to gain `captionLayout="dropdown"` + `startMonth`/`endMonth` + `disabled={{after}}`. Should extend the shared `DatePicker` instead.
2. **Stray native input** — `batch-schedule.tsx:483` uses `<input type="time">` next to shared pickers (minor; the shared `DateTimePicker` already uses a `type="time"` internally).
3. **No shared date formatter — the main issue.** The same short date is spelled ≥4 ways: `Intl.DateTimeFormat("en-IN", …, timeZone:"UTC")` (my-fees, batch-roster, fee-receipt), `toLocaleDateString(undefined, {day:"numeric",…})` no timezone (exam-columns:57), `toLocaleDateString(undefined,{dateStyle:"medium"})` (date-picker, DobPicker), and `timeZone:"Asia/Kolkata"` (batch-schedule, my-calendar). Day style (2-digit vs numeric), locale (`en-IN` vs `undefined`), and timezone (UTC vs IST vs none) all vary — so the **same date shows differently on different screens**.
4. **Two calendar engines (expected, not a defect):** `MyCalendar` (`components/students/my-calendar.tsx`) is a bespoke Day/Week/Month/Agenda schedule grid — a genuinely different concern from date *selection*. The admin side shows the same class data as a flat list (`batch-schedule.tsx:534–606`) rather than a grid.

### Proposed solution

- **A. One shared date formatter in `lib/`** (e.g. `lib/format-date.ts` with `formatDate(iso)`, `formatDateTime(iso)`, all `en-IN` + `Asia/Kolkata`). Replace every hand-rolled `Intl.DateTimeFormat`/`toLocaleDateString` call. **This is the highest-value calendar fix** — it makes dates render identically everywhere.
- **B. Extend the shared `DatePicker`** to accept `captionLayout`, `startMonth`/`endMonth`, `disabled`, then delete `DobPicker` and use `DatePicker` for DOB.
- **C. Optionally** replace the `type="time"` input in batch-schedule with a small shared time control (low priority).
- **D. Leave `MyCalendar` as the schedule-grid**, but route its date math/formatting through the shared `lib/` util. **Open question:** do you also want the *admin* side to show a calendar grid (reuse `MyCalendar`) instead of the current flat list? (See question below.)
- **Scope:** small–medium. The formatter (A) is a quick, high-impact sweep.

---

## Cross-cutting recommendation

All four issues share one root cause: **shared primitives exist but adoption isn't enforced.** Beyond the per-area fixes, add a short "Reuse these" section to `docs/STYLE_GUIDE.md` naming the canonical component for each pattern (accordion, college picker, data table, page container) so new code defaults to them.

---

## Decisions locked in (2026-07-24)

1. **Width:** Go wide — full desktop width via a `<PageContainer variant>` wrapper (tiers above); forms stay `max-w-3xl`.
2. **Accordions:** Standardize on **chevron inside a closed circle**, promoted into the shared `components/ui/accordion.tsx` and applied everywhere.
3. **College search:** One canonical `<CollegePicker>` (single + multi + filter modes); migrate all 6 callers; delete duplicates.
4. **Tables:** Consolidate list screens onto the shared `DataTable`; extract shared `SortHeader` + status-badge helper; fix the `consolidated-results.tsx` overflow.
5. **Calendar (new):** Unify date pickers / calendar grids on one shared component — _audit in Section 5 below._
6. **Delivery:** **One combined PR** covering all areas.

**Implementation order (within the one PR):** (1) shared primitives — `PageContainer`, accordion circle, `CollegePicker`, `SortHeader`/badge helper, calendar → (2) migrate consumers → (3) style-guide updates → (4) build + lint + mobile/desktop verification.
