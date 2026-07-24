# Print System — Analysis & Implementation Plan

**Status:** ✅ IMPLEMENTED (2026-07-24) — see "Implementation outcome" at the end.
**Date:** 2026-07-24
**Goal:** Replace the hand-written, per-feature print implementations with **one reusable Letterhead print component** (standard header + footer, A4 page geometry) plus **one shared print mechanism**. A feature's "Print" button hands its *content* to the component; the component renders that content onto A4 letterhead paper with correct margins and repeating header/footer.

---

## 1. Current state

No PDF library is used anywhere (no jsPDF/puppeteer/html2canvas/react-to-print). Everything is **browser print** driven by print-scoped CSS. There are **five printable features**, built on **two independent letterhead implementations** and **three different print-trigger mechanisms**.

### The five printable surfaces

| # | Feature | File | Letterhead used | Print trigger |
|---|---------|------|-----------------|---------------|
| 1 | Admin question paper + answer key | `app/dashboard/exams/sessions/[id]/paper-print.tsx` | `LetterheadFrame` | `window.print()` + `body[data-print]` stamp |
| 2 | Student question paper | `app/student/exams/[sessionId]/paper-print.tsx` | `LetterheadFrame` (via `print-brand.tsx`) | visibility trick |
| 3 | Admin statement of results (per sitting) | `app/dashboard/exams/sessions/[id]/results/results-print.tsx` | `LetterheadFrame` | `window.print()` + visibility trick |
| 4 | Admin consolidated results (across batches) | `app/dashboard/exams/blueprints/[id]/consolidated/consolidated-results.tsx` | `LetterheadFrame` | `window.print()` + visibility trick |
| 5 | Student own result + answer key | `app/student/exams/[sessionId]/result/student-result.tsx` | `LetterheadFrame` (via `print-brand.tsx`) | `window.print()` + `data-print` state |
| 6 | **Fee receipt** | `components/students/fee-receipt.tsx` | **its own hand-written `fr-*` letterhead** | **isolated iframe** |

### The two letterhead implementations (the core duplication)

1. **`components/print/letterhead.tsx` → `LetterheadFrame`** — the intended canonical letterhead. `<table>` with `<thead>` (navy logo corner + blue→green band with phone/website) and `<tfoot>` (fixed navy address footer + spacer). Units in **mm**. **Print-only** (`display:none` on screen). Used by all four exam printouts. `@page { margin: 0 }` — **does not pin A4 size.**

2. **`components/students/fee-receipt.tsx` → `fr-*` classes** — a **from-scratch re-implementation** of the exact same letterhead (same logo, same address, same gradient recipe, same inks) but in **px units**, with a `@media (max-width:640px)` responsive variant, rendered **on screen AND print**, and the **only** place that pins `@page { size: A4 portrait; margin: 0 }`.

So the official letterhead exists **twice**, drawn two different ways, and the two have already drifted (mm vs px, print-only vs on-screen, A4-pinned vs not).

### Supporting shared bits that already exist

- `app/student/exams/print-brand.tsx` — `PrintFrame` (thin wrapper over `LetterheadFrame`), `BrandBlock` (centered cover), `InfoTable`/`InfoCell` (4-col info grid). Student-only today.
- `components/print/company-seal.tsx` — the SVG ink stamp. Fee-receipt only.

---

## 2. Issues identified

**I1 — The letterhead is defined twice and has drifted.** (severity: high)
`LetterheadFrame` (mm, print-only) and fee-receipt's `fr-*` (px, screen+print) are the same brand artifact drawn independently. A brand change (phone number, address, logo spacing, gradient) must be made in two places in two unit systems, and they are already inconsistent (only the receipt pins A4; only the receipt is responsive/on-screen).

**I2 — Three different print mechanisms, only one of which is robust.** (severity: high)
- The `window.print()` + `body * { visibility:hidden }` **visibility trick** is duplicated as a near-identical `<style>` block in 4–5 files. It mutates the *whole live document*, is fragile inside modals/transformed containers, and each copy re-declares the same rules.
- Split documents (paper vs answer key, result vs answer key) are toggled by stamping `body.dataset.print` — but with **inconsistent keys** (`data-print` on `<body>` in one file, `data-print` on the print root in another).
- The fee receipt already proved the visibility trick fails inside a Radix dialog and switched to an **isolated iframe** (clones the node + stylesheets, prints that). This is the robust approach — but it lives inline in one file and is used nowhere else.

**I3 — A4 page geometry is not centralized.** (severity: medium)
`@page { size: A4 portrait; margin: 0 }` is only in the fee receipt. The exam path sets `@page { margin: 0 }` with no size, so those printouts depend on the printer's default paper size. Margins (14mm body padding, footer spacer height) are re-specified per file with slightly different values (13mm vs 16mm footer spacer).

**I4 — Brand inks are copy-pasted constants.** (severity: medium)
`NAVY/BLUE/GREEN` (and green-ink, label-bg, line colors) are re-declared as literals in `letterhead.tsx`, `fee-receipt.tsx`, `results-print.tsx` (`BAR_BLUE`), `print-brand.tsx` (`BRAND_GREEN`), and `company-seal.tsx`. No single source.

**I5 — The signature / footer-note blocks are hand-written four ways.** (severity: low)
"Controller of Examinations" signature (results-print, consolidated), "Date of issue / computer-generated" notes (student-result), and the receipt's "Authorised Signatory + computer-generated" sign-off are four slightly different bespoke variants of the same two ideas (a signature line and a computer-generated disclaimer).

**I6 — Content blocks are only half-shared.** (severity: low)
`BrandBlock`/`InfoTable`/`InfoCell` are shared for *student* printouts but the admin results/paper covers re-roll their own centered headings and tables, and the fee receipt has its own `fr-info` grid that duplicates `InfoTable`.

---

## 3. Proposed design

Three shared pieces, then migrate all six surfaces onto them.

### 3.1 `<Letterhead>` — the one print-document frame

Evolve `components/print/letterhead.tsx` into the **single** letterhead, absorbing the fee receipt's needs so the `fr-head`/`fr-foot` copy can be deleted:

- Owns the `<table>` thead(header)/tfoot(footer)/tbody(body) structure and the **thead/tfoot repeat-on-every-page** mechanics (already there).
- Owns the **A4 page geometry**: `@page { size: A4 portrait; margin: 0 }`, the 14mm body side margins, and the footer spacer height — in **one place** (fixes I3).
- Reads brand inks from the shared module (3.3) (fixes I4).
- Renders correctly **both on screen (as an A4 preview sheet) and in print** — a `preview?: boolean` (or `variant="preview" | "offscreen"`) prop decides whether the sheet is visible on screen (receipts, a student's own result) or only materialized for printing (admin exam papers embedded in a console page). This unifies the "mm print-only" and "px screen+print" split into one component (fixes I1).
- Keeps `docLabel`; adds an optional accent for the doc-type band so the *financial* receipt can read green while academic printouts read navy — a prop, not a fork.

Net effect: the fee receipt keeps its **document body** styles (`fr-docband`, `fr-info`, payment table, sign-off) but drops its own header/footer and wraps its body in `<Letterhead preview>`. One letterhead, one unit system.

### 3.2 `printDocument()` / `usePrint()` — the one print mechanism

Extract the fee receipt's **isolated-iframe** printer into a reusable hook/util, e.g. `lib/use-print.ts`:

```ts
const { printRef, print } = usePrint();
// <div ref={printRef}> … <Letterhead> … </Letterhead> </div>
// <Button onClick={() => print()}>Print / Download PDF</Button>
```

It clones the ref'd node + the page's stylesheets/`<base>` into a hidden iframe and prints that. Because it prints an **isolated** copy, it:
- works everywhere including inside modals (fixes the reason the receipt forked in the first place),
- **eliminates the `body * { visibility:hidden }` visibility-trick blocks** entirely (fixes I2) — no more mutating the live document,
- needs no per-file `<style>` duplication.

For **split documents** (paper vs key, result vs answer-key), `print(part?)` stamps a data attribute on the cloned root (e.g. `data-print-part="key"`) and the component's CSS shows only that section — one consistent key replacing the two inconsistent `data-print` schemes.

### 3.3 Shared brand + content blocks

- **`lib/print-brand.ts`** — export the print inks (`NAVY`, `BLUE`, `GREEN`, `GREEN_INK`, `LABEL_BG`, line/ink colors) once; consumed by `Letterhead`, `company-seal`, and any content block (fixes I4). These are **fixed print inks**, intentionally not theme tokens (paper has no dark mode) — this is the one sanctioned exception to the "tokens only" rule, documented in the style guide.
- **`components/print/blocks.tsx`** (promote `print-brand.tsx`, app-wide) — `BrandBlock`, `InfoTable`/`InfoCell`, plus new `SignatureLine` (label prop: "Controller of Examinations" / "Authorised Signatory") and `ComputerGeneratedNote` (fixes I5, I6). Admin covers and the receipt migrate onto `InfoTable`.

---

## 4. Implementation plan (phased — checkpoint after Phase 1)

**Phase 1 — build shared primitives (no consumer changes yet), then checkpoint for review**
1. `lib/print-brand.ts` — ink constants.
2. `lib/use-print.ts` — the iframe print hook (lifted from fee-receipt, generalized; supports `print(part?)`).
3. Evolve `components/print/letterhead.tsx` → `<Letterhead>` with A4 geometry, `preview` mode, doc-band accent, inks from the shared module.
4. `components/print/blocks.tsx` — `BrandBlock`/`InfoTable`/`InfoCell` (moved from `print-brand.tsx`) + `SignatureLine` + `ComputerGeneratedNote`.
5. Verify `tsc` + `build`. **Show for review before touching consumers.**

**Phase 2 — migrate the exam printouts (features 1–5)**
- Replace each `window.print()` + visibility-trick with `usePrint()`.
- Replace `body[data-print]` / `data-print` stamping with `print(part)`.
- Swap bespoke covers/signatures for the shared blocks.
- Delete the duplicated visibility-trick `<style>` blocks.

**Phase 3 — migrate the fee receipt (feature 6)**
- Wrap the receipt body in `<Letterhead preview accent="financial">`; **delete `fr-head`/`fr-foot` + the inline iframe printer** (now `usePrint`); keep the receipt-specific body CSS.
- Move `company-seal` inks to the shared module.

**Phase 4 — docs + verification**
- Update `docs/STYLE_GUIDE.md` with a "Printing" section (the component, the hook, the fixed-ink exception).
- `tsc --noEmit` + `npm run build`; **spot-print each surface** (real browser Print → Save as PDF) at A4 and confirm header/footer repeat, margins, and that split docs export the correct halves. (Print output can't be verified by build alone.)

---

## 5. Decisions (locked 2026-07-24)

- **Scope:** all six surfaces in **one combined PR**.
- **Screen preview:** **show the A4 preview on screen everywhere.** The component (`PrintDocument`) always renders a visible A4 sheet; the admin exam paper/results pages, which were print-only, now show the sheet on screen too. (Accepted tradeoff: those console pages change appearance.)
- **Component name:** **`PrintDocument`** (names what it does — wraps content into a printable letterhead document).
- **PDF download:** keep the browser **Print → Save as PDF** (zero deps). A real one-click PDF library is explicitly **out of scope** for this pass.

Because "preview everywhere" is chosen, `PrintDocument` needs no print-only/offscreen mode — it always renders the sheet on screen and prints an isolated clone of it via `usePrint()`.

---

## 6. Implementation outcome (2026-07-24)

Delivered as one combined change. `npx tsc --noEmit` and `npm run build` both pass.

**New shared primitives**
- `lib/print-brand.ts` — `PRINT_INK` + `printInkVars()` (fixed inks, one source).
- `lib/use-print.ts` — `usePrint()` isolated-iframe printer (modal-safe, forces light, `print(part)` for split docs).
- `components/print/print-document.tsx` — `<PrintDocument>`, the one letterhead frame (on-screen A4 preview + print, A4 `@page`, repeating header/footer).
- `components/print/blocks.tsx` — `PrintToolbar`, `BrandBlock`, `InfoTable`/`InfoCell`, `SignatureLine`, `ComputerGeneratedNote`.

**Migrated (all 6 surfaces)**
- Admin question paper (`app/dashboard/exams/sessions/[id]/paper-print.tsx` + `session-detail-client.tsx` + `page.tsx`) — self-contained; Print paper/key moved into the doc's toolbar via `print("paper")`/`print("key")`.
- Admin results (`…/results/results-print.tsx` + `results-client.tsx` + `page.tsx`).
- Consolidated results (`…/blueprints/[id]/consolidated/consolidated-results.tsx`).
- Student result (`app/student/exams/[sessionId]/result/student-result.tsx`) — split result/key via `data-print-part`.
- Student question paper (`app/student/exams/[sessionId]/paper-print.tsx`) — migrated off the deleted helpers (component is currently unused; kept for its `SessionPrintMeta` type + future use).
- Fee receipt (`components/students/fee-receipt.tsx`) — hand-rolled `fr-head`/`fr-foot` + inline iframe printer **removed**; body now wraps in `<PrintDocument>`.

**Deleted:** `components/print/letterhead.tsx`, `app/student/exams/print-brand.tsx`. **Company seal** now uses `PRINT_INK.sealBlue`.

**Docs:** `docs/STYLE_GUIDE.md` gained a "Printing (letterhead documents)" section.

**Follow-up findings — now resolved (2026-07-24):**
- **Dark-mode preview fixed.** The student-result answer key no longer uses shadcn `<Card>` / theme tokens / `dark:` variants; it's converted to fixed print colours, so the on-screen preview and the print output both render correctly on the white sheet regardless of app theme. Swept all six print documents — the only remaining theme tokens are in screen-only chrome (toolbar helper text, loading/error states), never inside a printed document.
- **Ink source fully consolidated.** `results-print.tsx`'s `BAR_BLUE` now comes from `PRINT_INK.blue`; company seal from `PRINT_INK.sealBlue`. No brand-ink hexes remain duplicated across the print surfaces.

**Still not done (needs a real browser):** actual Print → Save-as-PDF spot-checks of each surface at A4 (header/footer repeat, one-page fit, split halves, images in the clone) — build/type-check can't verify print output.
