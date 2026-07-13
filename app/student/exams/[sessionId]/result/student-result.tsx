"use client";

// The student's own result, fetched via get_exam_result (SECURITY DEFINER RPC,
// gated on results_published). Shows the score and a per-question breakdown with
// the correct answer revealed and the student's choice marked.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandBlock, InfoCell, InfoTable, PrintFrame } from "../../print-brand";
import type { SessionPrintMeta } from "../paper-print";

type ResultOption = { id: string; label: string; is_correct: boolean };
type ResultQuestion = {
  position: number;
  stem: string;
  explanation: string | null;
  awarded_marks: number | null;
  max_marks: number | null;
  subject: string | null;
  selected_option_ids: string[];
  options: ResultOption[];
};
type Result =
  | { published: false }
  | { published: true; score: number; status: string; questions: ResultQuestion[] };

export function StudentResult({
  sessionId,
  meta,
  studentName,
  rollNumber,
  collegeName,
  printedOn,
}: {
  sessionId: string;
  meta: SessionPrintMeta | null;
  studentName: string;
  rollNumber: string;
  collegeName: string;
  printedOn: string;
}) {
  const supabase = createClient();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .rpc("get_exam_result", { p_session_id: sessionId })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) setError(rpcErr.message);
        else setResult(data as Result);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (error)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/student/exams">Back to my exams</Link>
        </Button>
      </div>
    );

  if (!result) return <p className="text-muted-foreground px-4 py-6 text-sm">Loading…</p>;

  if (!result.published)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm">Your exam has been submitted. Results aren&apos;t published yet.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/student/exams">Back to my exams</Link>
        </Button>
      </div>
    );

  const total = result.questions.reduce((sum, q) => sum + (q.awarded_marks ?? 0), 0);
  const correctCount = result.questions.filter((q) => (q.awarded_marks ?? 0) > 0).length;
  // Per-question max_marks can be null in the RPC result; fall back to the exam's
  // total marks (meta.total_marks). If every question carries equal marks (the
  // usual MCQ case) we can also recover a per-question max for the section table.
  const maxFromQuestions = result.questions.reduce((sum, q) => sum + (q.max_marks ?? 0), 0);
  const maxTotal = maxFromQuestions > 0 ? maxFromQuestions : (meta?.total_marks ?? 0);
  const nQ = result.questions.length;
  const perQuestionMax =
    maxFromQuestions > 0 || !meta?.total_marks || nQ === 0 || !Number.isInteger(meta.total_marks / nQ)
      ? null
      : meta.total_marks / nQ;
  const qMax = (q: ResultQuestion) => q.max_marks ?? perQuestionMax ?? 0;
  const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : null;
  const grade =
    percentage == null ? "—"
    : percentage >= 90 ? "A+"
    : percentage >= 80 ? "A"
    : percentage >= 70 ? "B+"
    : percentage >= 60 ? "B"
    : percentage >= 50 ? "C"
    : percentage >= 40 ? "D"
    : "E";
  const passed = percentage != null && percentage >= 40; // standard 40% pass mark
  const resultLabel = percentage == null ? "—" : passed ? "PASS" : "FAIL";

  // Group by section subject (questions arrive in position order and sections
  // are contiguous, so a Map keyed by subject keeps paper order).
  const sections = new Map<string, ResultQuestion[]>();
  for (const q of result.questions) {
    const key = q.subject ?? "Questions";
    const list = sections.get(key);
    if (list) list.push(q);
    else sections.set(key, [q]);
  }

  return (
    <div id="result-print" className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #result-print, #result-print * { visibility: visible !important; }
          #result-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Button variant="outline" asChild>
          <Link href="/student/exams">
            <ArrowLeft /> Back
          </Link>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      <PrintFrame docLabel="Result">
      {/* Branded print cover — an official "Statement of Marks" (hidden on screen). */}
      <div className="print-chrome">
        <BrandBlock
          collegeName={collegeName || undefined}
          title={meta?.exam_title ?? "Assessment Test"}
          subline={
            meta
              ? `${meta.sections.map((s) => s.subject).join(", ")} | Multiple Choice Pattern`
              : "Result"
          }
        />
        <div className="mb-3 text-center text-sm font-bold uppercase tracking-widest text-gray-900">
          Statement of Marks
        </div>
        <InfoTable>
          <tr>
            <InfoCell label="Student Name" value={studentName} />
            <InfoCell label="Roll Number" value={rollNumber || "—"} />
          </tr>
          <tr>
            <InfoCell label="Examination" value={meta?.exam_title ?? "—"} />
            <InfoCell label="Sitting" value={meta?.label ?? "—"} />
          </tr>
          <tr>
            <InfoCell label="Total Questions" value={String(result.questions.length)} />
            <InfoCell label="Duration" value={meta ? `${meta.duration_minutes} minutes` : "—"} />
          </tr>
        </InfoTable>

        {/* Result summary band */}
        <table
          className="mb-4 w-full border-collapse text-center"
          style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
        >
          <tbody>
            <tr>
              {[
                ["Marks Obtained", `${total}${maxTotal > 0 ? ` / ${maxTotal}` : ""}`],
                ["Percentage", percentage != null ? `${percentage.toFixed(1)}%` : "—"],
                ["Correct", `${correctCount} / ${result.questions.length}`],
                ["Grade", grade],
              ].map(([lbl, val]) => (
                <td key={lbl} className="border border-gray-400 px-2 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">{lbl}</div>
                  <div className="text-lg font-bold text-gray-900">{val}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* Result verdict (standard 40% pass mark) */}
        <div className="mb-4 text-center">
          <span className="text-sm font-semibold text-gray-900">Result: </span>
          <span
            className="text-base font-bold"
            style={{ color: passed ? "#047857" : "#b91c1c", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            {resultLabel}
          </span>
          {percentage != null && (
            <span className="ml-2 text-xs text-gray-600">(Pass mark: 40%)</span>
          )}
        </div>

        {/* Section-wise performance */}
        {sections.size > 1 && (
          <>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-900">
              Section-wise Performance
            </div>
            <table className="mb-4 w-full border-collapse text-sm">
              <thead>
                <tr style={{ backgroundColor: "#f0f0f0", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                  <th className="border border-gray-400 px-2 py-1 text-left">Subject</th>
                  <th className="border border-gray-400 px-2 py-1">Questions</th>
                  <th className="border border-gray-400 px-2 py-1">Correct</th>
                  <th className="border border-gray-400 px-2 py-1">Marks</th>
                  <th className="border border-gray-400 px-2 py-1">Max</th>
                  <th className="border border-gray-400 px-2 py-1">%</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(sections, ([subject, qs]) => {
                  const sc = qs.reduce((s, q) => s + (q.awarded_marks ?? 0), 0);
                  const sm = qs.reduce((s, q) => s + qMax(q), 0);
                  const cc = qs.filter((q) => (q.awarded_marks ?? 0) > 0).length;
                  return (
                    <tr key={subject}>
                      <td className="border border-gray-400 px-2 py-1">{subject}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">{qs.length}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">{cc}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">{sc}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">{sm > 0 ? sm : "—"}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">
                        {sm > 0 ? `${((sc / sm) * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <div className="mb-2 border-t border-gray-300 pt-2 text-sm font-bold uppercase tracking-wide text-gray-900">
          Detailed Answer Key
        </div>
      </div>

      <header className="no-print mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Your result</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Score {total}
          {maxTotal > 0 ? ` / ${maxTotal}` : ""} · {correctCount} / {result.questions.length}{" "}
          correct
        </p>
      </header>

      {/* Subject-wise breakdown */}
      {sections.size > 1 && (
        <Card className="no-print mb-6">
          <CardContent className="grid gap-2 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide">Section-wise score</p>
            {Array.from(sections, ([subject, qs]) => {
              const secScore = qs.reduce((s, q) => s + (q.awarded_marks ?? 0), 0);
              const secMax = qs.reduce((s, q) => s + qMax(q), 0);
              const secCorrect = qs.filter((q) => (q.awarded_marks ?? 0) > 0).length;
              return (
                <div key={subject} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{subject}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {secCorrect} / {qs.length} correct · {secScore}
                    {secMax > 0 ? ` / ${secMax}` : ""} marks
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {Array.from(sections, ([subject, qs]) => (
        <section key={subject} className="mb-6">
          {sections.size > 1 && (
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{subject}</h2>
          )}
          <ol className="grid gap-4">
            {qs.map((q) => {
          const got = (q.awarded_marks ?? 0) > 0;
          return (
            <li key={q.position} className="break-inside-avoid">
              <Card>
                <CardContent className="grid gap-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">
                      <span className="mr-1">{q.position + 1}.</span>
                      <RichContent content={q.stem} inline />
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${got ? "text-emerald-600" : "text-destructive"}`}>
                      {got ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                  <ul className="grid gap-1">
                    {q.options.map((o) => {
                      const chosen = q.selected_option_ids.includes(o.id);
                      const cls = o.is_correct
                        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
                        : chosen
                          ? "border-rose-300 bg-rose-50 dark:bg-rose-950/40"
                          : "";
                      return (
                        <li key={o.id} className={`flex items-center gap-2 rounded border p-2 text-sm ${cls}`}>
                          <RichContent content={o.label} inline />
                          {o.is_correct && <span className="text-xs text-emerald-700">✓ correct</span>}
                          {chosen && !o.is_correct && <span className="text-xs text-rose-700">your choice</span>}
                          {chosen && o.is_correct && <span className="text-xs text-emerald-700">your choice</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && (
                    <div className="bg-muted/50 text-muted-foreground rounded border p-3 text-sm">
                      <p className="text-foreground mb-1 text-xs font-semibold">Explanation</p>
                      <RichContent content={q.explanation} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
            })}
          </ol>
        </section>
      ))}

      <div className="print-chrome mt-6 border-t border-gray-300 pt-2 text-center text-[10px] text-gray-600">
        Date of issue: {printedOn} · This is a computer-generated statement of marks and does not require a signature.
      </div>

      </PrintFrame>
    </div>
  );
}
