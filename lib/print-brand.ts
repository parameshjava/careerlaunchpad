// The CareerLaunchpad print inks — the fixed brand colours used by every
// printable document (letterhead header/footer, receipts, statements, seal).
//
// These are deliberately literal hex values, NOT the shadcn theme tokens the
// rest of the app uses: paper has no dark mode, so a printout must render in the
// same brand colours regardless of the viewer's theme. This is the one
// sanctioned exception to the "tokens only" rule in docs/STYLE_GUIDE.md, and it
// applies to print surfaces only. Import from here instead of re-declaring the
// hexes per file (they used to be copy-pasted across letterhead / fee-receipt /
// results-print / company-seal).

export const PRINT_INK = {
  navy: "#0e2f55", // logo corner, footer band, headings
  blue: "#1470c9", // gradient start, brand ink
  green: "#2fa04d", // gradient end
  greenInk: "#16a34a", // accent rules / positive emphasis
  sealBlue: "#1d4ed8", // company seal ink (royal blue)
  labelBg: "#dbeafe", // info-table label cell fill
  line: "#cbd5e1", // hairline table borders
  lineStrong: "#94a3b8", // stronger borders / signature lines
  ink: "#0f172a", // body text
  inkSoft: "#475569", // secondary text
  inkFaint: "#64748b", // captions / muted labels
} as const;

export type PrintInk = keyof typeof PRINT_INK;

/**
 * The CSS custom-property block that maps PRINT_INK onto `--pd-*` vars, scoped
 * to `selector` (default `.pd-page`). PrintDocument injects this so its stylesheet
 * — and any consumer body CSS — can reference the inks as `var(--pd-navy)` etc.
 */
export function printInkVars(selector = ".pd-page"): string {
  const vars = Object.entries(PRINT_INK)
    .map(([k, v]) => `--pd-${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${v};`)
    .join("");
  return `${selector}{${vars}}`;
}
