"use client";

// Consolidated "Statement of Results" for one exam across all its batches: a
// college letterhead, a ranked table (all candidates from every sitting), a
// summary, and a signature footer. Rendered as a visible A4 preview and printed
// via usePrint(); save as PDF from the browser.
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintDocument } from "@/components/print/print-document";
import { PrintToolbar, SignatureLine, ComputerGeneratedNote } from "@/components/print/blocks";
import { usePrint } from "@/lib/use-print";
import type { SubjectColumn } from "@/lib/exam-query";

type Row = {
  key: string;
  name: string;
  rollNumber: string | null;
  batch: string;
  score: number | null;
  subjects: Record<string, number>;
};

const PASS_PCT = 40; // standard pass mark

export function ConsolidatedResults({
  collegeName,
  examTitle,
  totalMarks,
  batchCount,
  subjects,
  rows,
  printedOn,
}: {
  collegeName: string;
  examTitle: string;
  totalMarks: number;
  batchCount: number;
  subjects: SubjectColumn[];
  rows: Row[];
  printedOn: string;
}) {
  const { printRef, print } = usePrint();

  const appeared = rows
    .filter((r) => r.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number));
  const absent = rows.filter((r) => r.score == null);

  const hasMax = totalMarks > 0;
  const pct = (s: number) => (s / totalMarks) * 100;
  const scores = appeared.map((r) => r.score as number);
  const avgPct = hasMax && scores.length
    ? (scores.reduce((a, b) => a + pct(b), 0) / scores.length).toFixed(1) + "%"
    : "—";
  const topPct = hasMax && scores.length ? pct(Math.max(...scores)).toFixed(1) + "%" : "—";
  const passed = hasMax ? appeared.filter((r) => pct(r.score as number) >= PASS_PCT).length : 0;

  // Standard competition ranking (1, 2, 2, 4).
  let rank = 0;
  let prev: number | null = null;
  const ranked = appeared.map((r, i) => {
    if (r.score !== prev) { rank = i + 1; prev = r.score as number; }
    return { ...r, rank };
  });

  const cols = 5 + subjects.length + (hasMax ? 2 : 0);

  return (
    <>
      <PrintToolbar>
        <p className="text-muted-foreground text-sm">Use your browser&apos;s print dialog to save as PDF.</p>
        <Button onClick={() => print()}>
          <Printer /> Print
        </Button>
      </PrintToolbar>

      <PrintDocument ref={printRef} docLabel="Consolidated Statement of Results" orientation="landscape">
        <style>{`
          .results-table { border-collapse: collapse; width: 100%; }
          .results-table th, .results-table td { border: 1px solid #111; padding: 5px 8px; font-size: 12.5px; }
          .results-table th { background: #f0f0f0; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .results-table td.num, .results-table th.num { text-align: center; }
        `}</style>

        {/* Document cover — content only; the brand frame is the letterhead */}
        <div className="text-center">
          {collegeName && <div className="text-xl font-bold uppercase tracking-wide">{collegeName}</div>}
          <div className="mt-1 text-sm font-semibold">Consolidated Statement of Results</div>
        </div>

        <div className="mt-3 flex flex-wrap justify-between gap-y-1 text-sm">
          <div><span className="font-semibold">Examination:</span> {examTitle}</div>
          <div><span className="font-semibold">Batches:</span> {batchCount}</div>
          {hasMax && <div><span className="font-semibold">Maximum marks:</span> {totalMarks}</div>}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><span className="font-semibold">Appeared:</span> {appeared.length}</div>
          <div><span className="font-semibold">Total students:</span> {rows.length}</div>
          {hasMax && <div><span className="font-semibold">Average:</span> {avgPct}</div>}
          {hasMax && <div><span className="font-semibold">Highest:</span> {topPct}</div>}
          {hasMax && <div><span className="font-semibold">Passed (≥{PASS_PCT}%):</span> {passed} / {appeared.length}</div>}
        </div>

        <div className="overflow-x-auto">
        <table className="results-table pd-repeat-head mt-4">
          <thead>
            <tr>
              <th className="num" style={{ width: "7%" }}>Rank</th>
              <th style={{ width: "18%" }}>Roll No.</th>
              <th>Student Name</th>
              <th style={{ width: "16%" }}>Batch</th>
              {subjects.map((s) => (
                <th key={s.subject} className="num">
                  {s.subject}
                  <div className="text-[10px] font-normal">/{s.max}</div>
                </th>
              ))}
              <th className="num" style={{ width: "9%" }}>
                Total
                {hasMax && <div className="text-[10px] font-normal">/{totalMarks}</div>}
              </th>
              {hasMax && <th className="num" style={{ width: "8%" }}>%</th>}
              {hasMax && <th className="num" style={{ width: "9%" }}>Result</th>}
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const p = hasMax ? pct(r.score as number) : null;
              return (
                <tr key={r.key}>
                  <td className="num">{r.rank}</td>
                  <td>{r.rollNumber ?? "—"}</td>
                  <td>{r.name}</td>
                  <td>{r.batch}</td>
                  {subjects.map((s) => (
                    <td key={s.subject} className="num">{r.subjects[s.subject] ?? 0}</td>
                  ))}
                  <td className="num font-semibold">{r.score}</td>
                  {hasMax && <td className="num">{p!.toFixed(1)}%</td>}
                  {hasMax && (
                    <td className="num" style={{ color: p! >= PASS_PCT ? "#047857" : "#b91c1c", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                      {p! >= PASS_PCT ? "PASS" : "FAIL"}
                    </td>
                  )}
                </tr>
              );
            })}
            {absent.map((r) => (
              <tr key={r.key}>
                <td className="num">—</td>
                <td>{r.rollNumber ?? "—"}</td>
                <td>{r.name}</td>
                <td>{r.batch}</td>
                {subjects.map((s) => (
                  <td key={s.subject} className="num">—</td>
                ))}
                <td className="num">AB</td>
                {hasMax && <td className="num">—</td>}
                {hasMax && <td className="num">—</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols} style={{ textAlign: "center" }}>
                  No students have been assigned to any sitting of this exam yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <p className="mt-2 text-xs text-black/70">AB = Absent / not attempted. Ranking is across all batches by marks obtained.</p>

        <div className="mt-12 flex items-end justify-between text-sm">
          <div>Date of issue: {printedOn}</div>
          <SignatureLine label="Controller of Examinations" />
        </div>

        <ComputerGeneratedNote className="mt-6 border-t border-gray-300 pt-2 text-center">
          This is a computer-generated consolidated statement of results.
        </ComputerGeneratedNote>
      </PrintDocument>
    </>
  );
}
