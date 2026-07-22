"use client";

// Fee receipt (issue #49) — the printable/downloadable receipt rendered on the
// CareerLaunchpad letterhead. Unlike the exam printouts (which use the
// print-only components/print/letterhead.tsx frame), a receipt is a document the
// student/admin also *views on screen*, so the letterhead chrome here renders on
// screen AND print. It's print furniture on paper, so — like letterhead.tsx and
// print-brand.tsx — it uses fixed brand inks and inline styles rather than
// dark-mode theme tokens (paper has no dark mode). Data comes in as a typed
// `FeeReceipt` (lib/fee-receipt.ts); nothing is hard-coded here.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer, ReceiptIndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanySeal } from "@/components/print/company-seal";
import {
  CONCESSION_LABEL,
  formatINR,
  MODE_LABELS,
  MODE_REFERENCE_LABEL,
  rupeesInWords,
  type FeeReceipt,
} from "@/lib/fee-receipt";

// Letterhead inks — matched to components/print/letterhead.tsx.
const NAVY = "#0e2f55";
const BLUE = "#1470c9";
const GREEN = "#2fa04d";
const GREEN_INK = "#16a34a";
const LABEL_BG = "#dbeafe";
const LINE = "#cbd5e1";
const LINE_STRONG = "#94a3b8";
const INK = "#0f172a";
const INK_SOFT = "#475569";
const INK_FAINT = "#64748b";

// Format date-only strings in UTC so a "2026-07-22" (parsed as UTC midnight)
// never slips to the previous day when rendered in a behind-UTC timezone.
const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}

export function FeeReceiptView({
  receipt,
  backHref,
  backLabel = "Back",
}: {
  receipt: FeeReceipt;
  backHref?: string;
  backLabel?: string;
}) {
  const { student, lineItems, mode } = receipt;
  const isCash = mode === "cash";
  const paidInFull = receipt.balancePaise <= 0;

  // Print on demand; reset nothing — the receipt is the only printable content.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  return (
    <div className="fr-page">
      <style>{`
        .fr-page { --navy:${NAVY}; --blue:${BLUE}; --green:${GREEN}; --green-ink:${GREEN_INK};
          --label-bg:${LABEL_BG}; --line:${LINE}; --line-strong:${LINE_STRONG};
          --ink:${INK}; --ink-soft:${INK_SOFT}; --ink-faint:${INK_FAINT}; }
        .fr-toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; align-items: center;
          justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        /* The sheet is a <table> so the letterhead header (thead) and the address
           footer (tfoot) repeat on EVERY printed page. */
        .fr-sheet { width: 100%; max-width: 820px; margin: 0 auto; background: #fff; color: var(--ink);
          border-collapse: collapse; table-layout: fixed;
          box-shadow: 0 1px 2px rgba(15,23,42,.06), 0 24px 60px -20px rgba(15,23,42,.28);
          print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .fr-cell { padding: 0; }

        /* Letterhead header */
        .fr-head { position: relative; height: 92px; }
        .fr-band { position: absolute; top: 0; left: 0; right: 0; height: 86px;
          background: linear-gradient(95deg, var(--blue) 15%, var(--green) 95%);
          display: flex; align-items: center; padding-left: 188px; }
        .fr-word { color: #fff; font-size: 18px; letter-spacing: .06em; }
        .fr-word b { font-weight: 800; } .fr-word span { font-weight: 300; }
        .fr-contact { margin-left: auto; padding: 0 20px 0 16px;
          border-left: 1.5px solid rgba(255,255,255,.55); color: #fff; text-align: right;
          font-size: 10px; line-height: 1.7; }
        .fr-corner { position: absolute; top: 0; left: 0; width: 168px; height: 92px;
          background: var(--navy); border-bottom-right-radius: 42px; display: flex;
          flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding-right: 20px; }
        .fr-logo { width: 46px; height: 50px; background: #fff; border-radius: 7px; display: flex;
          align-items: center; justify-content: center; }
        .fr-logo img { width: 34px; height: auto; }
        .fr-tag { color: #cfe3d8; font-size: 8px; letter-spacing: .18em; font-weight: 600; white-space: nowrap; }
        .fr-rule { position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
          background: linear-gradient(90deg, var(--navy) 25%, var(--blue) 55%, var(--green)); }

        /* Document-type band — green + rupee mark + amount up front, so the page
           reads "financial / accounts" at a glance and stands apart from the navy
           academic printouts that share this same letterhead. */
        .fr-docband-wrap { padding: 20px 40px 0; }
        .fr-docband { display: flex; align-items: center; justify-content: space-between; gap: 16px 20px;
          padding: 15px 18px; border-radius: 10px; flex-wrap: wrap;
          background: linear-gradient(90deg, #eafaf1, #f4fbf7);
          border: 1px solid #bfe6cd; border-left: 5px solid var(--green); }
        .fr-docband-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .fr-docicon { width: 46px; height: 46px; border-radius: 10px; flex: none; background: var(--green); color: #fff;
          display: flex; align-items: center; justify-content: center; }
        .fr-kicker { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--green-ink);
          font-weight: 800; margin: 0 0 2px; }
        .fr-docband h2 { margin: 0; font-size: 26px; letter-spacing: -.01em; color: var(--navy); font-weight: 800; line-height: 1; }
        .fr-college { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--ink-soft); }
        .fr-amount { text-align: right; flex: none; }
        .fr-amount-label { display: block; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint); font-weight: 700; }
        .fr-amount-val { display: block; font-size: 24px; font-weight: 800; color: var(--navy); font-variant-numeric: tabular-nums; line-height: 1.2; }
        .fr-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; background: #e7f6ec; color: var(--green-ink);
          border: 1px solid #a7dcb9; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
          padding: 2px 9px; border-radius: 999px; }
        .fr-metastrip { display: flex; flex-wrap: wrap; gap: 6px 26px; padding: 14px 40px 0; font-size: 12px; color: var(--ink); }
        .fr-metastrip span { font-variant-numeric: tabular-nums; }
        .fr-metastrip b { color: var(--ink-faint); font-weight: 600; margin-right: 6px; text-transform: uppercase; font-size: 10.5px; letter-spacing: .08em; }

        .fr-body { padding: 8px 40px 0; }
        .fr-section { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint);
          font-weight: 700; margin: 20px 0 8px; }

        .fr-sheet table { border-collapse: collapse; width: 100%; }
        .fr-info { font-size: 12.5px; }
        .fr-info td { border: 1px solid var(--line-strong); padding: 8px 10px; vertical-align: top; }
        .fr-info .k { width: 22%; background: var(--label-bg); font-weight: 700; color: var(--navy); white-space: nowrap; }
        .fr-info .v { width: 28%; color: var(--ink); }

        .fr-part { font-size: 12.5px; margin-top: 2px; }
        .fr-part th { background: var(--navy); color: #fff; font-weight: 700; text-align: left; padding: 9px 10px;
          font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
        .fr-part th.num, .fr-part td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .fr-part th.cnt, .fr-part td.cnt { text-align: center; width: 34px; }
        .fr-part td { border: 1px solid var(--line); padding: 9px 10px; color: var(--ink); }
        .fr-part td .muted { color: var(--ink-faint); font-size: 11.5px; display: block; margin-top: 2px; }
        .fr-part tfoot td { border: 1px solid var(--line); font-weight: 700; background: #f1f5f9; }
        .fr-part tfoot tr.grand td { background: #e6f0fb; color: var(--navy); font-size: 14px; }
        .fr-part tfoot .lbl { text-align: right; }

        .fr-split { display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; margin-top: 18px; }
        .fr-words { border: 1px dashed var(--line-strong); border-radius: 8px; padding: 12px 14px; background: #f8fafc; align-self: start; }
        .fr-words .fr-section { margin: 0 0 5px; }
        .fr-words p { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--ink); font-style: italic; }
        .fr-pay { font-size: 12.5px; }
        .fr-pay dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }
        .fr-pay dt { color: var(--ink-faint); }
        .fr-pay dd { margin: 0; text-align: right; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
        .fr-mode { display: inline-flex; align-items: center; gap: 6px; background: var(--label-bg); color: var(--navy);
          border-radius: 6px; padding: 2px 9px; font-size: 11.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
        .fr-pay .bal dd { color: var(--green-ink); }

        .fr-signoff-wrap { position: relative; }
        .fr-signoff { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; padding: 24px 40px 24px; margin-top: 8px; }
        .fr-note { font-size: 11px; color: var(--ink-faint); line-height: 1.6; max-width: 46ch; }
        .fr-note strong { color: var(--ink-soft); }
        .fr-sig { text-align: center; }
        .fr-sig-line { width: 190px; border-top: 1.5px solid var(--line-strong); margin: 40px 0 6px; }
        .fr-sig small { font-size: 11px; color: var(--ink-soft); font-weight: 700; letter-spacing: .04em; }
        .fr-sig .sub { display: block; font-weight: 400; color: var(--ink-faint); letter-spacing: 0; margin-top: 1px; }
        .fr-seal { position: absolute; right: 14px; bottom: 8px; transform: rotate(-11deg); opacity: .92; }

        .fr-foot { position: relative; height: 40px; margin-top: 0; background: var(--navy); overflow: hidden; }
        .fr-foot .top { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--blue), var(--green)); }
        .fr-foot .swoop { position: absolute; right: 0; bottom: 0; width: 120px; height: 30px; background: linear-gradient(95deg, var(--blue), var(--green)); border-top-left-radius: 100% 200%; }
        .fr-foot .addr { position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: #dbe6ef; font-size: 10px; display: flex; align-items: center; gap: 7px; }
        .fr-pin { width: 11px; height: 11px; flex: none; }
        .fr-foot-spacer { display: none; }

        @media (max-width: 640px) {
          .fr-band { padding-left: 150px; }
          .fr-corner { width: 132px; }
          .fr-docband-wrap, .fr-metastrip, .fr-body, .fr-signoff { padding-left: 20px; padding-right: 20px; }
          .fr-split, .fr-signoff { grid-template-columns: 1fr; }
          .fr-amount { text-align: left; }
          .fr-seal { position: static; margin: 6px auto 0; transform: rotate(-6deg); }
          .fr-info .k { width: 42%; white-space: normal; }
          .fr-info, .fr-info tbody, .fr-info tr, .fr-info td { display: block; width: 100% !important; }
          .fr-info tr { margin-bottom: -1px; }
        }

        @media print {
          /* Pin to A4 (210 × 297 mm) with NO page margin — regardless of the
             browser's/printer's default paper size. Zero margin means there's no
             margin box for the browser to inject its own URL/date header/footer
             into, so those disappear; the brand bands run edge-to-edge and page
             margins are provided inside the content instead. */
          @page { size: A4 portrait; margin: 0; }
          html, body { width: 210mm; background: #fff; }
          body * { visibility: hidden !important; }
          .fr-doc-print, .fr-doc-print * { visibility: visible !important; }
          .fr-toolbar { display: none !important; }
          .fr-doc-print { position: absolute; left: 0; top: 0; width: 100%; }
          .fr-sheet { width: 100%; max-width: none; box-shadow: none; }
          /* Header repeats at the top of every page (thead). */
          .fr-sheet thead { display: table-header-group; }
          .fr-sheet tfoot { display: table-footer-group; }
          /* Footer pinned flush to the bottom of EVERY page; the tfoot spacer
             (which repeats per page) reserves its height so content never
             overlaps it. */
          .fr-foot-spacer { display: block; height: 16mm; }
          .fr-foot { position: fixed; left: 0; right: 0; bottom: 0; }
          /* Tighten so a typical receipt fits one A4 page. */
          .fr-docband-wrap { padding-top: 14px; }
          .fr-metastrip { padding-top: 10px; }
          .fr-body { padding-top: 2px; }
          .fr-section { margin: 12px 0 6px; }
          .fr-split { margin-top: 12px; }
          .fr-signoff { padding-top: 14px; padding-bottom: 12px; }
          .fr-sig-line { margin-top: 24px; }
          .fr-info td { padding-top: 6px; padding-bottom: 6px; }
          .fr-part td, .fr-part th { padding-top: 7px; padding-bottom: 7px; }
        }
      `}</style>

      <div className="fr-toolbar">
        {backHref ? (
          <Button variant="outline" asChild>
            <Link href={backHref}>
              <ArrowLeft /> {backLabel}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={() => setPrinting(true)}>
          <Printer /> Print / Download PDF
        </Button>
      </div>

      <div className="fr-doc-print">
        <table className="fr-sheet">
          <thead>
            <tr>
              <td className="fr-cell">
          {/* Letterhead header — repeats at the top of every printed page */}
          <div className="fr-head">
            <div className="fr-band">
              <span className="fr-word">
                <b>CAREER</b>
                <span>LAUNCHPAD</span>
              </span>
              <span className="fr-contact">
                📞 +91 99635 49926
                <br />
                🌐 www.careerlaunchpad.ai
              </span>
            </div>
            <div className="fr-corner">
              <span className="fr-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/letterhead-logo.png" alt="" />
              </span>
              <span className="fr-tag">LEARN · GROW · SUCCEED</span>
            </div>
            <div className="fr-rule" />
          </div>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="fr-cell">
          {/* Document-type band: green + rupee mark + amount, so a reader clocks
              "this is a financial document from us" instantly — distinct from an
              exam/result printout on the same letterhead. */}
          <div className="fr-docband-wrap">
            <div className="fr-docband">
              <div className="fr-docband-left">
                <span className="fr-docicon">
                  <ReceiptIndianRupee className="size-6" />
                </span>
                <div>
                  <p className="fr-kicker">Official Payment Receipt</p>
                  <h2>Fee Receipt</h2>
                  <p className="fr-college">
                    {receipt.courseName}
                    {student.collegeName ? ` · ${student.collegeName}` : ""}
                  </p>
                </div>
              </div>
              <div className="fr-amount">
                <span className="fr-amount-label">Amount paid</span>
                <span className="fr-amount-val">{formatINR(receipt.thisPaymentPaise)}</span>
                {paidInFull && <span className="fr-pill">● Paid in full</span>}
              </div>
            </div>
          </div>
          <div className="fr-metastrip">
            <span>
              <b>Receipt No.</b>
              {receipt.receiptNo}
            </span>
            <span>
              <b>Date</b>
              {fmtDate(receipt.issueDate)}
            </span>
            {receipt.academicYear && (
              <span>
                <b>Academic Year</b>
                {receipt.academicYear}
              </span>
            )}
          </div>

          <div className="fr-body">
            {/* Student identity */}
            <div className="fr-section">Received from</div>
            <table className="fr-info">
              <tbody>
                <tr>
                  <td className="k">Student Name</td>
                  <td className="v">{student.fullName}</td>
                  <td className="k">Roll Number</td>
                  <td className="v">{student.rollNumber || "—"}</td>
                </tr>
                <tr>
                  <td className="k">Registration No.</td>
                  <td className="v">{student.registrationNumber || "—"}</td>
                  <td className="k">APAAR / ABC ID</td>
                  <td className="v">{student.apaarId || "—"}</td>
                </tr>
                <tr>
                  <td className="k">Course</td>
                  <td className="v">{student.course || "—"}</td>
                  <td className="k">Year of Study</td>
                  <td className="v">{student.yearOfStudy || "—"}</td>
                </tr>
                {(student.collegeName || student.collegeAddress) && (
                  <tr>
                    <td className="k">College</td>
                    <td className="v" colSpan={3}>
                      {[student.collegeName, student.collegeAddress].filter(Boolean).join(", ")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Particulars */}
            <div className="fr-section">Particulars</div>
            <table className="fr-part">
              <thead>
                <tr>
                  <th className="cnt">#</th>
                  <th>Description</th>
                  <th className="num">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="cnt">{i + 1}</td>
                    <td>
                      {li.description}
                      {li.note && <span className="muted">{li.note}</span>}
                    </td>
                    <td className="num">{formatINR(li.amountPaise).replace("₹ ", "")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {receipt.concessionPaise > 0 && (
                  <>
                    <tr>
                      <td />
                      <td className="lbl">Sub-total</td>
                      <td className="num">{formatINR(receipt.grossFeePaise).replace("₹ ", "")}</td>
                    </tr>
                    <tr>
                      <td />
                      <td className="lbl">{CONCESSION_LABEL[receipt.concessionType]}</td>
                      <td className="num">− {formatINR(receipt.concessionPaise).replace("₹ ", "")}</td>
                    </tr>
                  </>
                )}
                <tr className="grand">
                  <td />
                  <td className="lbl">Total fee</td>
                  <td className="num">{formatINR(receipt.totalFeePaise)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="fr-split">
              <div className="fr-words">
                <div className="fr-section">Amount in words (this payment)</div>
                <p>{rupeesInWords(receipt.thisPaymentPaise)}</p>
              </div>
              <div className="fr-pay">
                <div className="fr-section">Payment details</div>
                <dl>
                  <dt>Mode</dt>
                  <dd>
                    <span className="fr-mode">{MODE_LABELS[mode]}</span>
                  </dd>
                  <dt>{MODE_REFERENCE_LABEL[mode]}</dt>
                  <dd>{isCash ? "—" : receipt.referenceNo || "—"}</dd>
                  <dt>Payment date</dt>
                  <dd>{fmtDate(receipt.paidOn)}</dd>
                  <dt>Previously paid</dt>
                  <dd>{formatINR(receipt.previouslyPaidPaise)}</dd>
                  <dt>This payment</dt>
                  <dd>{formatINR(receipt.thisPaymentPaise)}</dd>
                  <div className="bal" style={{ display: "contents" }}>
                    <dt>Balance due</dt>
                    <dd>{formatINR(Math.max(0, receipt.balancePaise))}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Sign-off + seal */}
          <div className="fr-signoff-wrap">
            <div className="fr-signoff">
              <p className="fr-note">
                <strong>This is a computer-generated receipt</strong> and is valid without a
                physical signature. Fees once paid are non-refundable except as per policy. For
                queries, contact accounts@careerlaunchpad.ai quoting the receipt number above.
              </p>
              <div className="fr-sig">
                <div className="fr-sig-line" />
                <small>
                  Authorised Signatory
                  <span className="sub">For CareerLaunchpad</span>
                </small>
              </div>
            </div>
            <CompanySeal className="fr-seal" />
          </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="fr-cell">
          {/* Spacer reserves the footer's height at the bottom of every page (it
              lives in tfoot, which repeats per page); the band itself is fixed. */}
          <div className="fr-foot-spacer" />
          {/* Footer band — pinned to the bottom of every printed page */}
          <div className="fr-foot">
            <div className="top" />
            <div className="swoop" />
            <div className="addr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="fr-pin" src="/icons8-google-maps.svg" alt="" />
              Plot 30, Cinema Hall Centre, Yerrabalem Village, Mangalagiri Mandal, Guntur District – 522502
            </div>
          </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
