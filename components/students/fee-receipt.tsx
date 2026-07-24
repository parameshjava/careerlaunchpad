"use client";

// Fee receipt (issue #49) — the printable/downloadable receipt, rendered on the
// shared CareerLaunchpad letterhead via <PrintDocument> (header/footer + A4
// geometry come from there; this file supplies only the receipt body). Printing
// goes through usePrint(), which prints an isolated clone — so it works the same
// on the standalone receipt pages and inside the batch-roster dialog.
//
// It's print furniture on paper, so — like the rest of the print system — it uses
// the fixed print inks (the `--pd-*` vars set by PrintDocument, from
// lib/print-brand.ts) rather than dark-mode theme tokens; paper has no dark mode.
// Data comes in as a typed `FeeReceipt` (lib/fee-receipt.ts); nothing is
// hard-coded here.

import { Printer, ReceiptIndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanySeal } from "@/components/print/company-seal";
import { PrintDocument } from "@/components/print/print-document";
import { PrintToolbar } from "@/components/print/blocks";
import { usePrint } from "@/lib/use-print";
import {
  formatINR,
  MODE_LABELS,
  MODE_REFERENCE_LABEL,
  rupeesInWords,
  type FeeReceipt,
} from "@/lib/fee-receipt";
import { formatDate as fmtDate } from "@/lib/format-date";

export function FeeReceiptView({
  receipt,
  backHref,
  backLabel = "Back",
  onClose,
}: {
  receipt: FeeReceipt;
  backHref?: string;
  backLabel?: string;
  /** When shown in a dialog: render a visible Close button in the toolbar. */
  onClose?: () => void;
}) {
  const { student, mode } = receipt;
  const isCash = mode === "cash";
  const paidInFull = receipt.balancePaise <= 0;
  const { printRef, print } = usePrint();

  return (
    <div>
      <PrintToolbar backHref={backHref} backLabel={backLabel} onClose={onClose}>
        <Button onClick={() => print()}>
          <Printer /> Print / Download PDF
        </Button>
      </PrintToolbar>

      <PrintDocument ref={printRef}>
        <style>{`
        /* Receipt body — inks come from PrintDocument's --pd-* vars; the side
           margins come from the letterhead body cell, so sections carry no
           horizontal padding of their own. */
        .fr-info, .fr-part { width: 100%; border-collapse: collapse; }

        /* Document-type band — green + rupee mark + amount up front, so the page
           reads "financial / accounts" at a glance and stands apart from the navy
           academic printouts that share this same letterhead. */
        .fr-docband-wrap { padding: 4px 0 0; }
        .fr-docband { display: flex; align-items: center; justify-content: space-between; gap: 16px 20px;
          padding: 15px 18px; border-radius: 10px; flex-wrap: wrap;
          background: linear-gradient(90deg, #eafaf1, #f4fbf7);
          border: 1px solid #bfe6cd; border-left: 5px solid var(--pd-green); }
        .fr-docband-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .fr-docicon { width: 46px; height: 46px; border-radius: 10px; flex: none; background: var(--pd-green); color: #fff;
          display: flex; align-items: center; justify-content: center; }
        .fr-kicker { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--pd-green-ink);
          font-weight: 800; margin: 0 0 2px; }
        .fr-docband h2 { margin: 0; font-size: 26px; letter-spacing: -.01em; color: var(--pd-navy); font-weight: 800; line-height: 1; }
        .fr-college { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--pd-ink-soft); }
        .fr-amount { text-align: right; flex: none; }
        .fr-amount-label { display: block; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--pd-ink-faint); font-weight: 700; }
        .fr-amount-val { display: block; font-size: 24px; font-weight: 800; color: var(--pd-navy); font-variant-numeric: tabular-nums; line-height: 1.2; }
        .fr-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; background: #e7f6ec; color: var(--pd-green-ink);
          border: 1px solid #a7dcb9; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
          padding: 2px 9px; border-radius: 999px; }
        .fr-metastrip { display: flex; flex-wrap: wrap; gap: 6px 26px; padding: 14px 0 0; font-size: 12px; color: var(--pd-ink); }
        .fr-metastrip span { font-variant-numeric: tabular-nums; }
        .fr-metastrip b { color: var(--pd-ink-faint); font-weight: 600; margin-right: 6px; text-transform: uppercase; font-size: 10.5px; letter-spacing: .08em; }

        .fr-body { padding: 8px 0 0; }
        .fr-section { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--pd-ink-faint);
          font-weight: 700; margin: 20px 0 8px; }

        .fr-info { font-size: 12.5px; }
        .fr-info td { border: 1px solid var(--pd-line-strong); padding: 8px 10px; vertical-align: top; }
        .fr-info .k { width: 22%; background: var(--pd-label-bg); font-weight: 700; color: var(--pd-navy); white-space: nowrap; }
        .fr-info .v { width: 28%; color: var(--pd-ink); }

        .fr-part { font-size: 12.5px; margin-top: 2px; }
        .fr-part th { background: var(--pd-navy); color: #fff; font-weight: 700; text-align: left; padding: 9px 10px;
          font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
        .fr-part th.num, .fr-part td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .fr-part th.cnt, .fr-part td.cnt { text-align: center; width: 34px; }
        .fr-part td { border: 1px solid var(--pd-line); padding: 9px 10px; color: var(--pd-ink); }
        .fr-part td .muted { color: var(--pd-ink-faint); font-size: 11.5px; display: block; margin-top: 2px; }
        .fr-part tfoot td { border: 1px solid var(--pd-line); font-weight: 700; background: #f1f5f9; }
        .fr-part tfoot tr.grand td { background: #e6f0fb; color: var(--pd-navy); font-size: 14px; }
        .fr-part tfoot .lbl { text-align: right; }

        .fr-split { display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; margin-top: 18px; }
        .fr-words { border: 1px dashed var(--pd-line-strong); border-radius: 8px; padding: 12px 14px; background: #f8fafc; align-self: start; }
        .fr-words .fr-section { margin: 0 0 5px; }
        .fr-words p { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--pd-ink); font-style: italic; }
        .fr-pay { font-size: 12.5px; }
        .fr-pay dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }
        .fr-pay dt { color: var(--pd-ink-faint); }
        .fr-pay dd { margin: 0; text-align: right; font-weight: 700; color: var(--pd-ink); font-variant-numeric: tabular-nums; }
        .fr-mode { display: inline-flex; align-items: center; gap: 6px; background: var(--pd-label-bg); color: var(--pd-navy);
          border-radius: 6px; padding: 2px 9px; font-size: 11.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
        .fr-pay .bal dd { color: var(--pd-green-ink); }
        .fr-acct { border-top: 1px dashed var(--pd-line-strong); margin-top: 12px; padding-top: 8px; }
        .fr-acct .fr-section { margin: 0 0 6px; }

        .fr-signoff-wrap { position: relative; }
        .fr-signoff { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; padding: 24px 0 8px; margin-top: 8px; }
        .fr-note { font-size: 11px; color: var(--pd-ink-faint); line-height: 1.6; max-width: 46ch; }
        .fr-note strong { color: var(--pd-ink-soft); }
        .fr-sig { text-align: center; }
        .fr-sig-line { width: 190px; border-top: 1.5px solid var(--pd-line-strong); margin: 40px 0 6px; }
        .fr-sig small { font-size: 11px; color: var(--pd-ink-soft); font-weight: 700; letter-spacing: .04em; }
        .fr-sig .sub { display: block; font-weight: 400; color: var(--pd-ink-faint); letter-spacing: 0; margin-top: 1px; }
        .fr-seal { position: absolute; right: 14px; bottom: 8px; transform: rotate(-11deg); opacity: .92; }

        @media (max-width: 640px) {
          .fr-split, .fr-signoff { grid-template-columns: 1fr; }
          .fr-amount { text-align: left; }
          .fr-seal { position: static; margin: 6px auto 0; transform: rotate(-6deg); }
          .fr-info .k { width: 42%; white-space: normal; }
          .fr-info, .fr-info tbody, .fr-info tr, .fr-info td { display: block; width: 100% !important; }
          .fr-info tr { margin-bottom: -1px; }
        }

        @media print {
          /* Tighten so a typical receipt fits one A4 page. */
          .fr-metastrip { padding-top: 10px; }
          .fr-body { padding-top: 2px; }
          .fr-section { margin: 12px 0 6px; }
          .fr-split { margin-top: 12px; }
          .fr-signoff { padding-top: 14px; padding-bottom: 4px; }
          .fr-sig-line { margin-top: 24px; }
          .fr-info td { padding-top: 6px; padding-bottom: 6px; }
          .fr-part td, .fr-part th { padding-top: 7px; padding-bottom: 7px; }
        }
        `}</style>

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

          {/* Payment received — this receipt is an acknowledgement of THIS
              payment; the fee-structure breakdown lives elsewhere (course/batch
              + the student's My fees), not on every receipt. */}
          <div className="fr-section">Payment received</div>
          <table className="fr-part">
            <thead>
              <tr>
                <th className="cnt">#</th>
                <th>Description</th>
                <th className="num">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="cnt">1</td>
                <td>
                  Fee payment{receipt.courseName ? ` — ${receipt.courseName}` : ""}
                  {(receipt.batchName || receipt.academicYear) && (
                    <span className="muted">
                      {[receipt.batchName, receipt.academicYear].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="num">{formatINR(receipt.thisPaymentPaise).replace("₹ ", "")}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="grand">
                <td />
                <td className="lbl">Amount received</td>
                <td className="num">{formatINR(receipt.thisPaymentPaise)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="fr-split">
            <div className="fr-words">
              <div className="fr-section">Amount in words</div>
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
              </dl>
              {/* Small account context — not the fee structure, just the standing. */}
              <div className="fr-acct">
                <div className="fr-section">Account status</div>
                <dl>
                  <dt>Total course fee</dt>
                  <dd>{formatINR(receipt.totalFeePaise)}</dd>
                  <dt>Paid to date</dt>
                  <dd>{formatINR(receipt.previouslyPaidPaise + receipt.thisPaymentPaise)}</dd>
                  <div className="bal" style={{ display: "contents" }}>
                    <dt>Balance due</dt>
                    <dd>{formatINR(Math.max(0, receipt.balancePaise))}</dd>
                  </div>
                </dl>
              </div>
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
          <CompanySeal className="fr-seal" centerText={fmtDate(receipt.paidOn)} />
        </div>
      </PrintDocument>
    </div>
  );
}
