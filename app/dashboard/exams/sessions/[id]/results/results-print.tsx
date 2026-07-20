"use client";

// Enterprise "Statement of Results" sheet for a sitting, embedded in the
// results page: hidden on screen, shown only when printing (the page's Print
// button calls window.print()). Letterhead frame, summary, performance charts
// (static bars — recharts doesn't render inside a hidden print block), the
// ranked results table, and a signature footer.
import { LetterheadFrame } from "@/components/print/letterhead";
import type { RosterEntry, SessionMode, SubjectAvg, SubjectColumn } from "@/lib/exam-query";

const BAR_BLUE = "#1470c9"; // letterhead brand ink — paper has no dark mode

// Single-series horizontal bars with direct value labels; recessive track.
function PrintBars({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number; max: number; valueLabel: string }[];
}) {
  return (
    <div style={{ breakInside: "avoid" }} className="mb-4">
      <div className="mb-1 text-sm font-bold">{title}</div>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td className="w-[30%] py-1 pr-2">{d.label}</td>
              <td className="py-1">
                <div
                  className="relative h-2.5 rounded-sm"
                  style={{
                    background: "#e5e7eb",
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  }}
                >
                  <div
                    className="h-2.5 rounded-sm"
                    style={{
                      width: `${Math.min(100, (d.value / Math.max(1, d.max)) * 100)}%`,
                      background: BAR_BLUE,
                    }}
                  />
                </div>
              </td>
              <td className="w-[16%] py-1 pl-2 text-right tabular-nums">{d.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsPrint({
  collegeName,
  examTitle,
  label,
  mode,
  totalMarks,
  roster,
  subjects,
  subjectMarks,
  subjectAvgs,
  printedOn,
}: {
  collegeName: string | null;
  examTitle: string;
  label: string;
  mode: SessionMode;
  totalMarks: number | null;
  roster: RosterEntry[];
  subjects: SubjectColumn[];
  subjectMarks: Record<string, Record<string, number>>;
  subjectAvgs: SubjectAvg[];
  printedOn: string;
}) {
  const graded = roster
    .filter((r) => r.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number));
  const absent = roster.filter((r) => r.score == null);

  const scores = graded.map((r) => r.score as number);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const highest = scores.length ? Math.max(...scores) : null;
  const pct = (s: number) => (totalMarks ? `${((s / totalMarks) * 100).toFixed(1)}%` : "—");

  // Standard competition ranking (1, 2, 2, 4).
  let rank = 0;
  let prev: number | null = null;
  const ranked = graded.map((r, i) => {
    if (r.score !== prev) { rank = i + 1; prev = r.score as number; }
    return { ...r, rank };
  });

  return (
    <div id="results-print" className="hidden text-black">
      {/* Print-only: the visibility trick hides the screen UI and shows only
          this statement when the results page's Print button fires. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #results-print, #results-print * { visibility: visible !important; }
          #results-print {
            display: block !important;
            position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0;
          }
          .no-print { display: none !important; }
        }
        #results-print table.results-table { border-collapse: collapse; width: 100%; }
        #results-print table.results-table th, #results-print table.results-table td { border: 1px solid #111; padding: 6px 8px; font-size: 13px; }
        #results-print table.results-table th { background: #f0f0f0; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #results-print td.num, #results-print th.num { text-align: center; }
      `}</style>

      <LetterheadFrame docLabel="Statement of Results">
        {/* Document cover — content only; the brand frame is the letterhead */}
        <div className="text-center">
          {collegeName && <div className="text-xl font-bold uppercase tracking-wide">{collegeName}</div>}
          <div className="mt-1 text-sm font-semibold">Statement of Results</div>
        </div>

        {/* Exam meta */}
        <div className="mt-3 flex flex-wrap justify-between gap-y-1 text-sm">
          <div><span className="font-semibold">Examination:</span> {examTitle}</div>
          <div><span className="font-semibold">Sitting:</span> {label}</div>
          <div><span className="font-semibold">Mode:</span> {mode === "online" ? "Online" : "Offline"}</div>
          {totalMarks != null && (
            <div><span className="font-semibold">Maximum marks:</span> {totalMarks}</div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-2 mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><span className="font-semibold">Appeared:</span> {graded.length}</div>
          <div><span className="font-semibold">Total students:</span> {roster.length}</div>
          <div><span className="font-semibold">Average:</span> {avg}</div>
          {highest != null && <div><span className="font-semibold">Highest:</span> {highest}</div>}
        </div>

        {/* Performance chart — subject averages only; a score-distribution
            drilldown degenerates on small rosters and adds nothing here. */}
        {subjectAvgs.length > 0 && (
          <PrintBars
            title="Average score by subject"
            data={subjectAvgs.map((s) => ({
              label: s.subject,
              value: s.avg,
              max: s.max,
              valueLabel: `${s.avg} / ${s.max}`,
            }))}
          />
        )}

        {/* Results table — subject-wise marks + total */}
        <table className="results-table mt-2">
          <thead>
            <tr>
              <th className="num" style={{ width: "7%" }}>Rank</th>
              <th style={{ width: "16%" }}>Roll No.</th>
              <th>Student Name</th>
              {subjects.map((s) => (
                <th key={s.subject} className="num">
                  {s.subject}
                  <div className="text-[10px] font-normal">/{s.max}</div>
                </th>
              ))}
              <th className="num">
                Total
                {totalMarks != null && <div className="text-[10px] font-normal">/{totalMarks}</div>}
              </th>
              {totalMarks != null && <th className="num" style={{ width: "10%" }}>%</th>}
              <th style={{ width: "12%" }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const marks = subjectMarks[r.studentId] ?? {};
              return (
                <tr key={r.studentId}>
                  <td className="num">{r.rank}</td>
                  <td>{r.rollNumber ?? "—"}</td>
                  <td>{r.name ?? r.email ?? "—"}</td>
                  {subjects.map((s) => (
                    <td key={s.subject} className="num">{marks[s.subject] ?? 0}</td>
                  ))}
                  <td className="num font-semibold">{r.score}</td>
                  {totalMarks != null && <td className="num">{pct(r.score as number)}</td>}
                  <td>{r.abortCount > 0 ? `AB (aborted ×${r.abortCount})` : "—"}</td>
                </tr>
              );
            })}
            {absent.map((r) => (
              <tr key={r.studentId}>
                <td className="num">—</td>
                <td>{r.rollNumber ?? "—"}</td>
                <td>{r.name ?? r.email ?? "—"}</td>
                {subjects.map((s) => (
                  <td key={s.subject} className="num">—</td>
                ))}
                <td className="num">—</td>
                {totalMarks != null && <td className="num">—</td>}
                <td>{r.abortCount > 0 ? `AB (aborted ×${r.abortCount})` : "Absent"}</td>
              </tr>
            ))}
            {roster.length === 0 && (
              <tr>
                <td colSpan={5 + subjects.length + (totalMarks != null ? 1 : 0)} style={{ textAlign: "center" }}>
                  No students assigned to this sitting.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="mt-2 text-xs text-black/70">AB (aborted ×N) = the exam was force-closed N time(s) for leaving the window; partial marks shown for questions answered. Absent = did not attempt. Columns show marks obtained per subject.</p>

        {/* Footer */}
        <div className="mt-8 flex items-end justify-between text-sm" style={{ breakInside: "avoid" }}>
          <div>Date of issue: {printedOn}</div>
          <div className="text-center">
            <div className="mt-8 border-t border-black px-6 pt-1">Controller of Examinations</div>
          </div>
        </div>
      </LetterheadFrame>
    </div>
  );
}
