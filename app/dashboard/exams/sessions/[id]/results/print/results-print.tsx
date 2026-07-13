"use client";

// Enterprise "Statement of Results" sheet for a sitting. Clean letterhead, a
// ranked results table, and a signature footer, all print-optimized. The admin
// saves it as a PDF from the browser's print dialog.
import { Button } from "@/components/ui/button";
import type { RosterEntry, SessionMode, SubjectColumn } from "@/lib/exam-query";

export function ResultsPrint({
  collegeName,
  examTitle,
  label,
  mode,
  totalMarks,
  roster,
  subjects,
  subjectMarks,
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
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #results-print, #results-print * { visibility: visible !important; }
          #results-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
          @page { margin: 16mm; }
        }
        #results-print table { border-collapse: collapse; width: 100%; }
        #results-print th, #results-print td { border: 1px solid #111; padding: 6px 8px; font-size: 13px; }
        #results-print th { background: #f0f0f0; text-align: left; }
        #results-print td.num, #results-print th.num { text-align: center; }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Use your browser&apos;s print dialog to save as PDF.</p>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>

      <div id="results-print" className="mx-auto max-w-3xl text-black">
        {/* Letterhead */}
        <div className="border-b-2 border-black pb-3 text-center">
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
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><span className="font-semibold">Appeared:</span> {graded.length}</div>
          <div><span className="font-semibold">Total students:</span> {roster.length}</div>
          <div><span className="font-semibold">Average:</span> {avg}{totalMarks && highest != null ? "" : ""}</div>
          {highest != null && <div><span className="font-semibold">Highest:</span> {highest}</div>}
        </div>

        {/* Results table — subject-wise marks + total */}
        <table className="mt-4">
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
                <td className="num">AB</td>
                {totalMarks != null && <td className="num">—</td>}
              </tr>
            ))}
            {roster.length === 0 && (
              <tr>
                <td colSpan={4 + subjects.length + (totalMarks != null ? 1 : 0)} style={{ textAlign: "center" }}>
                  No students assigned to this sitting.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="mt-2 text-xs text-black/70">AB = Absent / not attempted. Columns show marks obtained per subject.</p>

        {/* Footer */}
        <div className="mt-12 flex items-end justify-between text-sm">
          <div>Date of issue: {printedOn}</div>
          <div className="text-center">
            <div className="mt-8 border-t border-black px-6 pt-1">Controller of Examinations</div>
          </div>
        </div>
      </div>
    </>
  );
}
