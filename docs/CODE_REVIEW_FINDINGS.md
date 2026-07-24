# Code Review Findings — `ui/consistency-pass` (PR #67)

**Review:** high-effort, workflow-backed (4 finder angles + independent verify pass, 17 agents).
**Scope:** the 5 commits `cf82b50..0db58e8` — shared print system (`PrintDocument`/`usePrint`/print blocks), `ConfirmDialog` + destructive-action migrations, `RefSelect` + raw `<select>` conversions (diff `main...ui/consistency-pass`, 99 changed files).
**Outcome:** 14 candidates → **14 verified, 0 refuted**. The review panel shows **9** (the synthesis deduped same-line/same-defect hits); this file lists **10** distinct entries (it additionally breaks out the results-table `overflow-x` issue, #7, from the "print sheet visible on screen" theme). Nothing was refuted.
**Date:** 2026-07-24.

This file lists **every** verified finding, including the duplicate/related locations that were collapsed in the summary UI. The 10 entries below span ~14 concrete file locations (see each finding's "Location(s)"). Severity is this doc's own triage (High = correctness/mobile-first breakage on a primary surface; Medium = functional regression; Low = rare edge case / cosmetic / doc).

## Resolution status (2026-07-24)

All 10 findings addressed.

| # | Status | What was done |
|---|--------|---------------|
| 1 | ✅ Fixed | `lib/format-date.ts` gained `formatISODate()` (UTC, timezone-agnostic date-only); `date-picker.tsx` renders the label with it — no more IST shift. |
| 2 | ✅ Fixed | `PrintDocument` now wraps the sheet in a `.pd-scroll` (`overflow-x:auto`) with a min-width, so the A4 preview scrolls inside its own box instead of overflowing the page on mobile. |
| 3 | ✅ Fixed | Same `PrintDocument` change — the always-visible admin sheets no longer force page-level horizontal scroll. |
| 4 | ✅ Fixed | Event times now carry an explicit **"IST"** label (`formatDateTime` + new `formatTimeRange`), so a non-IST viewer can't misread them, while keeping the app's canonical IST rendering. |
| 5 | ✅ Fixed | `ConfirmDialog` type-to-confirm is now case-insensitive. |
| 6 | ✅ Fixed | The optional `SelectRef`/`RefSelect` instances (mentor, registration, tell-us) now pass `emptyLabel`, restoring a selectable clear item. |
| 7 | ✅ Fixed | Covered by the `PrintDocument` `.pd-scroll` wrapper (the wide results table scrolls within the sheet). |
| 8 | ✅ Fixed | `usePrint` now cleans up on parent-window `focus` (reliable after the print dialog closes) with a 10-min last-resort fallback, instead of a blind 60s timer. |
| 9 | ✅ Fixed | `batch-schedule` prepends `formatWeekdayShort()` (new in `lib/format-date.ts`) — "Mon, 24 Jul 2026 · …". |
| 10 | ✅ Fixed | `student paper-print.tsx` comment corrected (preview-only/unused; no `usePrint` wired). |

`tsc` + `build` pass after the fixes.

## Summary table

| #   | Severity | Category    | Verdict   | Location(s)                                                                                                                                     |
| --- | -------- | ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | correctness | CONFIRMED | `components/ui/date-picker.tsx` (label render vs local-midnight parse)                                                                          |
| 2   | High     | correctness | CONFIRMED | `app/student/exams/[sessionId]/result/student-result.tsx`                                                                                       |
| 3   | High     | correctness | CONFIRMED | `app/dashboard/exams/sessions/[id]/results/results-print.tsx`; sibling `.../sessions/[id]/paper-print.tsx`                                      |
| 4   | High     | correctness | CONFIRMED | `app/student/exams/exam-columns.tsx`; `app/student/exams/[sessionId]/attempt-runner.tsx`; `app/dashboard/exams/blueprints/blueprint-editor.tsx` |
| 5   | Medium   | correctness | CONFIRMED | `components/ui/confirm-dialog.tsx` (consumer: `components/batches/batch-schedule.tsx`)                                                          |
| 6   | Medium   | cleanup     | CONFIRMED | `components/mentor/mentor-fields.tsx`; `components/students/registration-fields.tsx`                                                            |
| 7   | Medium   | correctness | CONFIRMED | `app/dashboard/exams/sessions/[id]/results/results-print.tsx` (wide table, no `overflow-x`)                                                     |
| 8   | Low      | correctness | PLAUSIBLE | `lib/use-print.ts` (60s cleanup timer)                                                                                                          |
| 9   | Low      | cleanup     | CONFIRMED | `components/batches/batch-schedule.tsx` (weekday dropped)                                                                                       |
| 10  | Low      | cleanup     | CONFIRMED | `app/student/exams/[sessionId]/paper-print.tsx` (comment vs code)                                                                               |

---

## 1. DatePicker shows the date one day early for viewers ahead of IST — High · correctness · CONFIRMED
**File:** `components/ui/date-picker.tsx`

The value is parsed at **local midnight** (`new Date(\`${value}T00:00:00\`)`) but the trigger label is rendered with the new shared `formatDate()`, which forces `timeZone: "Asia/Kolkata"`. For any viewer whose offset is greater than +05:30 (Bangladesh +6, Singapore/China +8, Japan +9, Sydney +10), local midnight maps to the **previous** calendar day in IST, so the button shows a date one day earlier than what is stored/selected. The pre-refactor code used `date.toLocaleDateString(undefined, …)` (viewer-local), which always matched — this is a regression introduced by the `lib/format-date.ts` consolidation.

**Failure scenario:** A student in Singapore (UTC+8) picks 15 May 2000 as DOB. The stored/submitted value is correct (`2000-05-15`), but the trigger button reads **14 May 2000** — the picked and displayed dates disagree, so the user believes it saved wrong.

**Suggested fix:** Render the trigger label consistently with how the value is parsed — format the date-only value in the viewer's local timezone (e.g. `date.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })`), or give `lib/format-date.ts` a date-only formatter that does **not** force IST. Date-only values must not be timezone-shifted.

---

## 2. Student result renders as a fixed A4 sheet only — unreadable on mobile — High · correctness · CONFIRMED
**File:** `app/student/exams/[sessionId]/result/student-result.tsx`

The responsive on-screen layout (the `no-print` "Your result" header, the section-wise breakdown `Card`, and the shadcn-`Card` answer key inside a `max-w-2xl` container) was **deleted**. The student's result now renders **only** as the fixed-geometry A4 `<PrintDocument>` letterhead sheet, which is also what shows on screen (the "preview everywhere" decision).

**Failure scenario:** A student opens their result on a ~320–390px phone — the primary device for this surface. Instead of the former responsive card view, they get the 820px-max A4 sheet: the header band's fixed ~150px left padding plus the wordmark + phone/website contact block (absolute, no overflow clipping) exceed the viewport, forcing horizontal scroll, while the 4-column Marks/Percentage/Correct/Grade and 6-column section tables are crushed — unreadable without zoom/side-scroll. This violates the project's mobile-first mandate.

**Suggested fix:** Don't use the A4 print sheet as the on-screen view on this student-facing mobile surface. Either (a) restore a responsive on-screen result view and keep `<PrintDocument>` for the print path only, or (b) make the on-screen sheet responsive — scale/fit to width and wrap wide tables in `overflow-x-auto`. Revisit the "A4 preview everywhere" decision for public mobile surfaces specifically.

---

## 3. Admin print sheets are now always-visible and overflow on narrow widths — High · correctness · CONFIRMED
**Files:** `app/dashboard/exams/sessions/[id]/results/results-print.tsx`; sibling `app/dashboard/exams/sessions/[id]/paper-print.tsx`

`ResultsPrint` and `PaperPrint` were previously `className="hidden"` / print-only (via a `body *{visibility:hidden}` trick), so they never affected on-screen layout. They now render an **always-visible** A4 `<PrintDocument>` preview embedded directly in the results/session pages.

**Failure scenario:** An admin opens the Statement of Results or the session question-paper page at a narrow/tablet width. The live fixed-geometry A4 document's edge-to-edge header band (fixed ~150–188px left padding + wordmark + contact) and wide ranked-results table overflow the viewport, scrolling the page sideways — a case the removed `.hidden` guard used to prevent entirely.

**Suggested fix:** Same root decision as #2. Either keep these admin printouts print-only, or make `<PrintDocument>`'s on-screen presentation responsive (fit-to-width container + `overflow-x-auto` on wide content) so it never forces page-level horizontal scroll.

---

## 4. Exam times now hard-coded to IST instead of the viewer's local timezone — High · correctness · CONFIRMED
**Files:** `app/student/exams/exam-columns.tsx`; `app/student/exams/[sessionId]/attempt-runner.tsx` (`opensAtDate` via `formatDateTime`); `app/dashboard/exams/blueprints/blueprint-editor.tsx` (computed end time)

Exam open/close times previously formatted with `toLocaleTimeString(undefined, …)` (viewer-local) are now rendered with `formatTime`/`formatDateTime`/`formatDate`, which hard-code `Asia/Kolkata`. For any non-IST viewer the displayed wall-clock time changes.

**Failure scenario:** A student or mentor in a non-IST timezone opens the exams list; "opens at" now shows the IST wall-clock (e.g. 10:00 AM) rather than their local time, so they may misjudge when a live exam actually starts relative to their own clock.

**Suggested fix:** Decide the intended semantics. If the audience is India-only, IST-always is arguably *more* consistent and this is acceptable (document it). If not, wall-clock **event times** should render in the viewer's local timezone (keep `formatDate` for date-only fields, but use viewer-local for time-of-day of a scheduled event, or show the timezone label, e.g. "10:00 AM IST"). This is a product decision — confirm intent before "fixing".

---

## 5. `ConfirmDialog` type-to-confirm is now case-sensitive — Medium · correctness · CONFIRMED
**File:** `components/ui/confirm-dialog.tsx` (regressed consumer: `components/batches/batch-schedule.tsx`)

The gate is `phraseOk = !confirmPhrase || typed.trim() === confirmPhrase.trim()` — strict, case-sensitive `===`. The batch-schedule "Cancel class" dialog passes `confirmPhrase="CANCEL"`; its pre-migration check was case-insensitive (`cancelConfirm.trim().toUpperCase() === "CANCEL"`), so the migration silently tightened the rule.

**Failure scenario:** An admin types `cancel` (lowercase) in the cancel-class confirm box. Because `cancel !== CANCEL`, the confirm button stays permanently disabled with no explanation, and the class can't be cancelled — behaviour that worked before.

**Suggested fix:** Compare case-insensitively (`typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase()`) — this also matches the common "type DELETE" convention. If exact-case matching is wanted for resource *names*, add an opt-in `caseSensitive?` prop (default off).

---

## 6. Optional `RefSelect` dropdowns can no longer be cleared — Medium · cleanup · CONFIRMED
**Files:** `components/mentor/mentor-fields.tsx` (`SelectRef`); `components/students/registration-fields.tsx` (`SelectRef`)

The old native `SelectRef` rendered `<option value="">{placeholder}</option>` as a **selectable** item, so an optional field (e.g. Degree, Branch, Gender) could be reset to blank. The `RefSelect` replacement is called with **no `emptyLabel`**, so it only shows the placeholder while `value === ""` and offers no clear item — once a value is picked, the user is stuck with a value and cannot return the field to empty.

**Failure scenario:** A mentor picks a Degree, then realises the field is optional and wants to clear it — there is no way to unset it in the dropdown.

**Suggested fix:** Pass an `emptyLabel` (e.g. `"—"` or `"Not specified"`) to the optional `SelectRef`/`RefSelect` instances so a clear item is rendered, or add a dedicated clear affordance. Confirm which of these fields are truly optional and should be clearable.

---

## 7. Wide per-sitting results table lacks an `overflow-x` wrapper — Medium · correctness · CONFIRMED
**File:** `app/dashboard/exams/sessions/[id]/results/results-print.tsx` (the `.results-table.pd-repeat-head` table)

The per-sitting results table is rendered unwrapped, whereas the sibling `consolidated-results.tsx` wraps its equivalent wide table in `<div className="overflow-x-auto">` (and uses `orientation="landscape"`). With the sheet now visible on screen (see #3), a Statement of Results with several subject columns can overflow horizontally on a phone.

**Failure scenario:** On a ~320–390px phone, the on-screen preview of a multi-subject Statement of Results (Rank, Roll, Name, N subjects, Total, %, Remarks) overflows its container and pushes the page into horizontal scroll.

**Suggested fix:** Wrap the wide table in an `overflow-x-auto` container (mirroring `consolidated-results.tsx`), and/or apply the same landscape treatment. Best addressed together with #3.

---

## 8. `usePrint` 60s cleanup timer can tear down the iframe mid-print — Low · correctness · PLAUSIBLE
**File:** `lib/use-print.ts`

Cleanup (iframe removal) is scheduled 60s after `cw.print()` returns, in addition to the `afterprint` listener. On browsers where `window.print()` does **not** block the main thread (some Safari/WebKit configurations), `print()` returns immediately and the 60s timer starts while the OS print/save dialog may still be open.

**Failure scenario:** On a non-blocking browser, a user leaves the native print dialog open for over a minute choosing a save location; the safety-net timer fires, removes the source iframe, and the resulting PDF/print comes out blank or truncated.

**Suggested fix:** Prefer `afterprint` (and/or `focus`/`visibilitychange` on the parent) to trigger cleanup rather than a fixed timer; if a safety-net timer is kept, make it much longer or re-arm it while the dialog is detected open. Low priority (rare browser/timing combination).

---

## 9. Schedule list dropped the weekday from class dates — Low · cleanup · CONFIRMED
**File:** `components/batches/batch-schedule.tsx`

Consolidating the schedule date format onto `formatDate()` dropped the weekday that the removed `fmtDay()` (`weekday: "short"`) used to show — even though `lib/format-date.ts` exports `formatWeekday()`.

**Failure scenario:** The upcoming-class list previously read `Mon, 24 Jul · 09:30 AM–…`; it now reads `24 Jul 2026 · …`, losing the weekday — the single most useful field for a recurring weekly class ("my Monday class").

**Suggested fix:** Prepend `formatWeekday(s.startsAt)` to the schedule line (e.g. `Mon · 24 Jul 2026 · 09:30 AM–…`), or add a weekday-inclusive helper to `lib/format-date.ts`.

---

## 10. `StudentPaperPrint` comment claims `usePrint()` but none is wired — Low · cleanup · CONFIRMED
**File:** `app/student/exams/[sessionId]/paper-print.tsx`

The rewritten header comment says the component is "printed with `usePrint()`", but it imports no `usePrint`/`PrintToolbar`, has no `printRef`, and no print trigger. It renders only `<PrintDocument docLabel="Question Paper">`. The component is also **imported nowhere** (dead export — only its `SessionPrintMeta` type is used).

**Failure scenario:** Anyone wiring it up per the comment finds no print mechanism; the file remains dead code that contradicts its own documentation.

**Suggested fix:** Either wire it up properly (add `usePrint` + a `PrintToolbar` with a print button, and render it somewhere), or fix the comment to state it is a preview-only/currently-unused component and that the file exists for the `SessionPrintMeta` type.

---

## Cross-cutting themes
- **Timezone (#1, #4):** the `lib/format-date.ts` consolidation forcing `Asia/Kolkata` changed behaviour for date-only fields (a real off-by-one) and for event wall-clock times (a product decision). Audit every `formatDate`/`formatTime`/`formatDateTime` call site introduced in this PR.
- **"A4 preview everywhere" (#2, #3, #7):** rendering the fixed-geometry print sheet on screen breaks the mobile-first mandate on the student result and admin exam pages. Reconsider making `<PrintDocument>` responsive on screen, or keeping print-only on mobile-critical surfaces.
- **Consistency regressions from consolidation (#5, #6, #9):** each shared primitive slightly changed an existing behaviour (case-insensitivity, clearable selects, weekday). Worth a targeted pass to restore parity.
