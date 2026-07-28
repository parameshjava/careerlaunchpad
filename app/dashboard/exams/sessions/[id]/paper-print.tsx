"use client";

// The printable question paper / answer key. Rendered by SessionConsole into a
// hidden wrapper (the on-screen A4 preview is off by default, issue #78) — the
// node stays in the DOM so usePrint can clone it. The Print paper / Print key
// buttons live at the TOP of the console and call print(part), which clones this
// letterhead document into an isolated iframe and stamps the part on its <body>
// so the two halves print as SEPARATE documents (offline conduct: students must
// never receive the key). Passages render once before their question block.
import { forwardRef } from "react";
import { RichContent } from "@/components/exam/RichContent";
import { PrintDocument } from "@/components/print/print-document";
import type { PrintQuestion } from "@/lib/exam-query";

const LETTERS = ["A", "B", "C", "D", "E"];

function correctLetters(q: PrintQuestion): string {
  return q.options
    .map((o, i) => (o.isCorrect ? LETTERS[i] : null))
    .filter(Boolean)
    .join(", ");
}

export type PaperDocumentProps = {
  title: string;
  label: string;
  collegeName?: string | null;
  durationMinutes: number;
  totalMarks: number;
  questions: PrintQuestion[];
};

export const PaperDocument = forwardRef<HTMLDivElement, PaperDocumentProps>(function PaperDocument(
  { title, label, collegeName, durationMinutes, totalMarks, questions },
  ref,
) {
  let lastPassageId: string | null = null;

  return (
    <>
      <PrintDocument ref={ref} docLabel="Question Paper">
        {/* Split-document CSS — a child of PrintDocument so it is cloned into
            the print iframe. print("paper") hides the key; print("key") hides
            the questions. */}
        <style>{`
          .answer-key { page-break-before: always; }
          [data-print-part="paper"] .answer-key { display: none !important; }
          [data-print-part="key"] .paper-body { display: none !important; }
          [data-print-part="key"] .answer-key { page-break-before: auto; }
        `}</style>

        {/* Cover */}
        <div className="mb-6 border-b pb-4">
          {collegeName && <p className="text-center text-lg font-bold">{collegeName}</p>}
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm">{label}</p>
          <p className="mt-1 text-sm">
            Duration: {durationMinutes} minutes &nbsp;·&nbsp; Total marks: {totalMarks} &nbsp;·&nbsp;{" "}
            {questions.length} questions
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Answer all questions. Each question has four options; choose the correct option(s).
          </p>
        </div>

        {/* Questions — hidden when printing the answer key alone */}
        <ol className="paper-body grid gap-5">
          {questions.map((q) => {
            const showPassage = q.passageId && q.passageId !== lastPassageId;
            lastPassageId = q.passageId;
            return (
              <li key={q.position} className="break-inside-avoid">
                {showPassage && (
                  <div className="mb-3 rounded border-l-4 border-gray-300 bg-gray-50 p-3 text-sm">
                    {q.passageTitle && <p className="font-semibold">{q.passageTitle}</p>}
                    <RichContent content={q.passageBody ?? ""} />
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="font-semibold">{q.position + 1}.</span>
                  <div className="flex-1">
                    <div className="font-medium">
                      <RichContent content={q.stem} inline />
                    </div>
                    {q.stemImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.stemImageUrl} alt="" className="my-2 max-h-48" />
                    )}
                    <ol className="mt-2 grid gap-1">
                      {q.options.map((o, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span>({LETTERS[i]})</span>
                          <RichContent content={o.label} inline />
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Answer key */}
        <div className="answer-key mt-8 border-t pt-4">
          <h2 className="mb-2 text-lg font-bold">Answer key &amp; marking scheme</h2>
          <p className="mb-3 text-xs text-gray-600">For invigilator use. Each correct answer = its section&apos;s marks.</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {questions.map((q) => (
              <div key={q.position} className="flex justify-between border-b border-dashed">
                <span>{q.position + 1}.</span>
                <span className="font-medium">{correctLetters(q)}</span>
              </div>
            ))}
          </div>
        </div>
      </PrintDocument>
    </>
  );
});
