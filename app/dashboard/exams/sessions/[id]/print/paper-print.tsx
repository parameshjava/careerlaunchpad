"use client";

// The printable paper. A no-print toolbar offers "Print / Save as PDF"; the
// @media print rules hide the console chrome (visibility trick) so only the
// paper prints. Passages render once before their question block; the answer key
// is on its own page.
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
import type { PrintQuestion } from "@/lib/exam-query";

const LETTERS = ["A", "B", "C", "D", "E"];

function correctLetters(q: PrintQuestion): string {
  return q.options
    .map((o, i) => (o.isCorrect ? LETTERS[i] : null))
    .filter(Boolean)
    .join(", ");
}

export function PaperPrint({
  title,
  label,
  durationMinutes,
  totalMarks,
  questions,
}: {
  title: string;
  label: string;
  durationMinutes: number;
  totalMarks: number;
  questions: PrintQuestion[];
}) {
  let lastPassageId: string | null = null;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #exam-print, #exam-print * { visibility: visible !important; }
          #exam-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
          .answer-key { page-break-before: always; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Use your browser&apos;s print dialog to save as PDF.</p>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>

      <div id="exam-print" className="mx-auto max-w-3xl text-black">
        {/* Cover */}
        <div className="mb-6 border-b pb-4">
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

        {/* Questions */}
        <ol className="grid gap-5">
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
      </div>
    </>
  );
}
