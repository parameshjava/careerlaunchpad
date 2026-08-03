"use client";

// The student's own result, fetched via get_exam_result (SECURITY DEFINER RPC,
// gated on results_published). Shows the score and a per-question breakdown with
// the correct answer revealed and the student's choice marked.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
import {
  BrandBlock,
  ComputerGeneratedNote,
  InfoCell,
  InfoTable,
  PrintToolbar,
} from "@/components/print/blocks";
import { PrintDocument } from "@/components/print/print-document";
import { usePrint } from "@/lib/use-print";
import {
  EXAM_PASS_PCT,
  examGrade,
  examPassed,
  examPercentage,
  examVerdict,
} from "@/lib/exam-grading";
import {
  describeSourceSummary,
  formatQuestionSource,
  summarizeQuestionSources,
} from "@/lib/question-source";
import type { SessionPrintMeta } from "../paper-print";

type ResultOption = { id: string; label: string; is_correct: boolean };
type ResultQuestion = {
  position: number;
  stem: string;
  explanation: string | null;
  awarded_marks: number | null;
  max_marks: number | null;
  subject: string | null;
  // Past paper the question was asked in (#87); null for hand-authored questions.
  source: string | null;
  source_year: number | null;
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
  // The two Print buttons each save one half as its own PDF: print("result")
  // and print("key") stamp data-print-part on the printed clone, and the split
  // CSS in <PrintDocument> hides the other half.
  const { printRef, print } = usePrint();

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
  // Grading rules live in lib/exam-grading.ts so this page and the results email
  // (issue #77) state the same figures — see that module's header.
  const percentage = examPercentage(total, maxTotal);
  const grade = examGrade(percentage);
  const passed = examPassed(percentage);
  const resultLabel = examVerdict(percentage);

  // Past-paper provenance (#87): stated once on the statement of marks, then per
  // question in the answer key so a student can go back to the original paper.
  const provenance = summarizeQuestionSources(
    result.questions.map((q) => ({ source: q.source, sourceYear: q.source_year })),
  );
  const provenanceDetail = describeSourceSummary(provenance);

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
    <div className="px-4 py-6 sm:px-6">
      <PrintToolbar backHref="/student/exams">
        <Button onClick={() => print("result")}>
          <Printer /> Print result
        </Button>
        <Button onClick={() => print("key")}>
          <Printer /> Print answer key
        </Button>
      </PrintToolbar>

      <PrintDocument ref={printRef} docLabel="Result" className="text-black">
        <style>{`
          /* Split prints: each button saves only its half as its own PDF. */
          [data-print-part="result"] .pd-answer-key { display: none !important; }
          [data-print-part="key"] .pd-statement { display: none !important; }
        `}</style>
      {/* ── Statement of Marks (its own PDF via "Print result") ── */}
      <div className="pd-statement">
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
          {provenance.sourced > 0 && (
            <tr>
              <InfoCell
                label="Past-paper Questions"
                value={`${provenance.sourced} of ${provenance.total}`}
              />
              <InfoCell label="Papers" value={provenanceDetail ?? "—"} />
            </tr>
          )}
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

        {/* Result verdict (pass mark from lib/exam-grading.ts) */}
        <div className="mb-4 text-center">
          <span className="text-sm font-semibold text-gray-900">Result: </span>
          <span
            className="text-base font-bold"
            style={{ color: passed ? "#047857" : "#b91c1c", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            {resultLabel}
          </span>
          {percentage != null && (
            <span className="ml-2 text-xs text-gray-600">(Pass mark: {EXAM_PASS_PCT}%)</span>
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

      </div>

      {/* ── Detailed Answer Key (its own PDF via "Print answer key") ── */}
      <div className="pd-answer-key mt-6">
      {/* Branded cover so the answer key stands alone as a document. */}
      <div>
        <BrandBlock
          collegeName={collegeName || undefined}
          title={meta?.exam_title ?? "Assessment Test"}
          subline={
            meta
              ? `${meta.sections.map((s) => s.subject).join(", ")} | Multiple Choice Pattern`
              : "Answer Key"
          }
        />
        <InfoTable>
          <tr>
            <InfoCell label="Student Name" value={studentName} />
            <InfoCell label="Roll Number" value={rollNumber || "—"} />
          </tr>
          <tr>
            <InfoCell label="Examination" value={meta?.exam_title ?? "—"} />
            <InfoCell label="Sitting" value={meta?.label ?? "—"} />
          </tr>
        </InfoTable>
        <div className="mb-2 border-t border-gray-300 pt-2 text-sm font-bold uppercase tracking-wide text-gray-900">
          Detailed Answer Key
        </div>
      </div>

      {Array.from(sections, ([subject, qs]) => (
        <section key={subject} className="mb-6">
          {sections.size > 1 && (
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{subject}</h2>
          )}
          <ol className="grid gap-4">
            {qs.map((q) => {
          const got = (q.awarded_marks ?? 0) > 0;
          const askedIn = formatQuestionSource(q.source, q.source_year);
          return (
            <li key={q.position} className="break-inside-avoid">
              {/* Fixed print colours (no shadcn Card / theme tokens): this renders
                  on the white letterhead sheet, and paper has no dark mode. */}
              <div className="grid gap-3 rounded-lg border border-gray-300 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium text-gray-900">
                    <span className="mr-1">{q.position + 1}.</span>
                    <RichContent content={q.stem} inline />
                    {/* Where the question was originally asked (#87) — the cue for
                        revising straight from the source paper. */}
                    {askedIn && (
                      <span className="mt-1 block text-xs font-normal text-gray-600">
                        Asked in {askedIn}
                      </span>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${got ? "text-emerald-700" : "text-rose-700"}`}>
                    {got ? "Correct" : "Incorrect"}
                  </span>
                </div>
                <ul className="grid gap-1">
                  {q.options.map((o) => {
                    const chosen = q.selected_option_ids.includes(o.id);
                    const cls = o.is_correct
                      ? "border-emerald-300 bg-emerald-50"
                      : chosen
                        ? "border-rose-300 bg-rose-50"
                        : "border-gray-200";
                    return (
                      <li key={o.id} className={`flex items-center gap-2 rounded border p-2 text-sm text-gray-900 ${cls}`}>
                        <RichContent content={o.label} inline />
                        {o.is_correct && <span className="text-xs text-emerald-700">✓ correct</span>}
                        {chosen && !o.is_correct && <span className="text-xs text-rose-700">your choice</span>}
                        {chosen && o.is_correct && <span className="text-xs text-emerald-700">your choice</span>}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation && (
                  <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    <p className="mb-1 text-xs font-semibold text-gray-900">Explanation</p>
                    <RichContent content={q.explanation} />
                  </div>
                )}
              </div>
            </li>
          );
            })}
          </ol>
        </section>
      ))}
      </div>

      <ComputerGeneratedNote
        issuedOn={printedOn}
        className="mt-6 border-t border-gray-300 pt-2 text-center"
      />
      </PrintDocument>
    </div>
  );
}
