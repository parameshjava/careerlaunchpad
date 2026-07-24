// PrintDocument — the one CareerLaunchpad letterhead print frame.
//
// Every printable surface (question papers, results, statements, fee receipts)
// wraps its CONTENT in <PrintDocument>; the component supplies the standard
// letterhead furniture around it:
//   • header  — navy logo corner + blue→green band with phone/website (repeats
//     at the top of every printed page via <thead>)
//   • footer  — navy address band (repeats at the bottom via <tfoot>, pinned to
//     the page edge in print)
//   • A4 page geometry — @page { size: A4 portrait; margin: 0 } and the body
//     side margins, defined once here (not per feature).
//
// It renders a visible A4 preview sheet on screen AND prints. Printing is done
// by usePrint() (lib/use-print.ts), which clones this node into an isolated
// iframe — so put the ref on <PrintDocument> and call print() from a button in
// a <PrintToolbar> placed OUTSIDE the ref'd node (so the toolbar never prints).
//
// Brand inks come from lib/print-brand.ts (fixed print colours, not theme
// tokens — paper has no dark mode; see the note there). This replaces the two
// former letterhead copies (components/print/letterhead.tsx, in mm units, and
// the fee receipt's hand-written fr-* header/footer, in px).

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { printInkVars } from "@/lib/print-brand";

// Brand-standard contact block — the same on every letterhead.
const PHONE = "+91 99635 49926";
const WEBSITE = "www.careerlaunchpad.ai";
const ADDRESS =
  "Plot 30, Cinema Hall Centre, Yerrabalem Village, Mangalagiri Mandal, Guntur District – 522502";

const PD_CSS = `
${printInkVars(".pd-page")}
/* On screen the fixed-geometry A4 sheet scrolls inside its own box so it never
   forces the whole page to scroll sideways on mobile (min-width keeps the
   letterhead/tables readable rather than crushed). In print this is neutralised. */
.pd-scroll { overflow-x: auto; }
/* The sheet is a <table> so the letterhead header (thead) and address footer
   (tfoot) repeat on EVERY printed page. */
.pd-sheet { width: 100%; min-width: 680px; max-width: 820px; margin: 0 auto; background: #fff; color: var(--pd-ink);
  border-collapse: collapse; table-layout: fixed;
  box-shadow: 0 1px 2px rgba(15,23,42,.06), 0 24px 60px -20px rgba(15,23,42,.28);
  print-color-adjust: exact; -webkit-print-color-adjust: exact; }
/* A landscape document previews on a wider sheet so the on-screen shape matches
   the printed A4 landscape page. */
.pd-page[data-orientation="landscape"] .pd-sheet { max-width: 1120px; }
.pd-cell { padding: 0; }
.pd-body { padding: 22px 40px 10px; }

/* Header */
.pd-head { position: relative; height: 92px; }
.pd-band { position: absolute; top: 0; left: 0; right: 0; height: 86px;
  background: linear-gradient(95deg, var(--pd-blue) 15%, var(--pd-green) 95%);
  display: flex; align-items: center; padding-left: 188px; }
.pd-word { color: #fff; font-size: 18px; letter-spacing: .06em; }
.pd-word b { font-weight: 800; } .pd-word span { font-weight: 300; }
.pd-contact { margin-left: auto; padding: 0 20px 0 16px;
  border-left: 1.5px solid rgba(255,255,255,.55); color: #fff; text-align: right;
  font-size: 10px; line-height: 1.7; }
.pd-corner { position: absolute; top: 0; left: 0; width: 168px; height: 92px;
  background: var(--pd-navy); border-bottom-right-radius: 42px; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding-right: 20px; }
.pd-logo { width: 46px; height: 50px; background: #fff; border-radius: 7px; display: flex;
  align-items: center; justify-content: center; }
.pd-logo img { width: 34px; height: auto; }
.pd-tag { color: #cfe3d8; font-size: 8px; letter-spacing: .18em; font-weight: 600; white-space: nowrap; }
.pd-rule { position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
  background: linear-gradient(90deg, var(--pd-navy) 25%, var(--pd-blue) 55%, var(--pd-green)); }
.pd-doclabel { text-align: right; font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--pd-ink-faint); font-weight: 700; padding: 10px 40px 0; }

/* Footer */
.pd-foot { position: relative; height: 40px; background: var(--pd-navy); overflow: hidden; }
.pd-foot .top { position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--pd-blue), var(--pd-green)); }
.pd-foot .swoop { position: absolute; right: 0; bottom: 0; width: 120px; height: 30px;
  background: linear-gradient(95deg, var(--pd-blue), var(--pd-green)); border-top-left-radius: 100% 200%; }
.pd-foot .addr { position: absolute; left: 20px; top: 50%; transform: translateY(-50%);
  color: #dbe6ef; font-size: 10px; display: flex; align-items: center; gap: 7px; padding-right: 130px; }
.pd-pin { width: 11px; height: 11px; flex: none; }
.pd-foot-spacer { display: none; }

@media (max-width: 640px) {
  .pd-band { padding-left: 150px; }
  .pd-corner { width: 132px; }
  .pd-body { padding-left: 20px; padding-right: 20px; }
  .pd-doclabel { padding-left: 20px; padding-right: 20px; }
}

@media print {
  html, body { background: #fff; }
  .pd-page { background: none; padding: 0; }
  .pd-scroll { overflow: visible; }
  .pd-sheet { min-width: 0; max-width: none; box-shadow: none; }
  /* Header/footer repeat on every printed page. */
  .pd-sheet thead { display: table-header-group; }
  .pd-sheet tfoot { display: table-footer-group; }
  /* The tfoot spacer (repeats per page) reserves the footer's height so content
     never overlaps the fixed band. */
  .pd-foot-spacer { display: block; height: 16mm; }
  .pd-foot { position: fixed; left: 0; right: 0; bottom: 0; }
  /* Content pagination: keep table rows and marked blocks from splitting across
     a page break; long inner tables still break between rows, and a table
     marked .pd-repeat-head repeats its own column header on each page. */
  .pd-body tr { break-inside: avoid; }
  .pd-body .break-inside-avoid, .pd-body .break-avoid { break-inside: avoid; }
  .pd-body .pd-repeat-head thead { display: table-header-group; }
}
`;

// The @page rule is orientation-specific and kept separate from the base CSS so
// a wide statement can opt into A4 landscape. Zero page margin means no margin
// box for the browser to inject its own URL/date header/footer into (so those
// disappear); the brand bands run edge-to-edge and the text margin lives inside
// .pd-body instead. The body width is pinned so the layout is independent of the
// printer's default paper size.
function pageRule(orientation: "portrait" | "landscape"): string {
  const width = orientation === "landscape" ? "297mm" : "210mm";
  return `@media print { @page { size: A4 ${orientation}; margin: 0; } html, body { width: ${width}; } }`;
}

export const PrintDocument = forwardRef<
  HTMLDivElement,
  {
    /** Small uppercase document-type line under the header, e.g. "Question Paper". */
    docLabel?: string;
    /** A4 orientation. Default "portrait"; use "landscape" for wide statements. */
    orientation?: "portrait" | "landscape";
    className?: string;
    children: React.ReactNode;
  }
>(function PrintDocument({ docLabel, orientation = "portrait", className, children }, ref) {
  return (
    <div
      ref={ref}
      className={cn("pd-page", className)}
      data-orientation={orientation}
      role="document"
      aria-label={docLabel ? `${docLabel} — CareerLaunchpad` : "CareerLaunchpad document"}
    >
      <style>{PD_CSS}</style>
      <style>{pageRule(orientation)}</style>
      <div className="pd-scroll">
      <table className="pd-sheet">
        <thead>
          <tr>
            <td className="pd-cell">
              {/* Letterhead header — repeats at the top of every printed page */}
              <div className="pd-head">
                <div className="pd-band">
                  <span className="pd-word">
                    <b>CAREER</b>
                    <span>LAUNCHPAD</span>
                  </span>
                  <span className="pd-contact">
                    📞 {PHONE}
                    <br />
                    🌐 {WEBSITE}
                  </span>
                </div>
                <div className="pd-corner">
                  <span className="pd-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/letterhead-logo.png" alt="" />
                  </span>
                  <span className="pd-tag">LEARN · GROW · SUCCEED</span>
                </div>
                <div className="pd-rule" />
              </div>
              {docLabel && <div className="pd-doclabel">{docLabel}</div>}
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td className="pd-cell">
              {/* Spacer reserves the footer's height at the bottom of every page
                  (tfoot repeats per page); the band itself is fixed. */}
              <div className="pd-foot-spacer" />
              <div className="pd-foot">
                <div className="top" />
                <div className="swoop" />
                <div className="addr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="pd-pin" src="/icons8-google-maps.svg" alt="" />
                  {ADDRESS}
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="pd-cell pd-body">{children}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
});
