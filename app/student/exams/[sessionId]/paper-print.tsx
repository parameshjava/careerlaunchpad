"use client";

// Printable student question paper, matching the CareerLaunchpad assessment
// docx template: branded header, fill-in info table (name / roll number),
// instructions, "Question Paper Pattern" table, then sections with ☐ A–D
// checkbox options. No answer key — this is the student-facing paper.
// Renders its content on the shared letterhead (<PrintDocument>). Currently not
// mounted anywhere (the live attempt UI is print:hidden); kept for the exported
// SessionPrintMeta type and for future wiring. To print it, a caller would wrap
// it with usePrint()/PrintToolbar — this component provides no print trigger itself.
import { RichContent } from "@/components/exam/RichContent";
import { BrandBlock, InfoCell, InfoTable } from "@/components/print/blocks";
import { PrintDocument } from "@/components/print/print-document";
import type { Question } from "./attempt-runner";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export type PrintSectionMeta = {
  subject: string;
  num_questions: number;
  marks_per_question: number;
  pct_easy: number;
  pct_medium: number;
  pct_hard: number;
  pct_very_hard: number;
};
export type SessionPrintMeta = {
  session_id: string;
  label: string;
  opens_at: string | null;
  exam_title: string;
  duration_minutes: number;
  negative_mark_per_wrong: number;
  total_questions: number;
  total_marks: number;
  sections: PrintSectionMeta[];
};

function difficultySplit(s: PrintSectionMeta): string {
  const parts: string[] = [];
  const add = (pct: number, name: string) => {
    if (pct > 0) parts.push(`${Math.round((pct * s.num_questions) / 100)} ${name}`);
  };
  add(s.pct_easy, "Easy");
  add(s.pct_medium, "Medium");
  add(s.pct_hard, "Difficult");
  add(s.pct_very_hard, "Very difficult");
  return parts.join(" + ") || "—";
}

export function StudentPaperPrint({
  meta,
  questions,
}: {
  meta: SessionPrintMeta;
  questions: Question[];
}) {
  const multiCount = questions.filter((q) => q.answer_type === "multi").length;
  const marksSet = new Set(meta.sections.map((s) => s.marks_per_question));
  const marksLabel =
    marksSet.size === 1
      ? `${[...marksSet][0]} mark${[...marksSet][0] === 1 ? "" : "s"} per question`
      : `${meta.total_marks} marks total`;
  const negative = Number(meta.negative_mark_per_wrong) > 0;

  // Question ranges per section: questions arrive in position order with
  // contiguous sections, in the same order as meta.sections (paper generation
  // follows section position).
  let start = 1;
  const ranges = meta.sections.map((s) => {
    const r = `${start}-${start + s.num_questions - 1}`;
    start += s.num_questions;
    return r;
  });

  // Group the actual questions by section for the body.
  const groups: { sectionId: string; questions: Question[] }[] = [];
  for (const q of questions) {
    const last = groups[groups.length - 1];
    if (last && last.sectionId === q.section_id) last.questions.push(q);
    else groups.push({ sectionId: q.section_id, questions: [q] });
  }

  let lastPassageKey: string | null = null;

  return (
    <PrintDocument docLabel="Question Paper" className="text-black">
      <BrandBlock
        title={meta.exam_title}
        subline={`${meta.sections.map((s) => s.subject).join(", ")} | Multiple Choice Pattern`}
      />

      {/* Info table — 4-column grid (label, value, label, value) */}
      <InfoTable>
        <tr>
          <InfoCell label="Student Name" value="" />
          <InfoCell label="Roll Number" value="" />
        </tr>
        <tr>
          <InfoCell label="Duration" value={`${meta.duration_minutes} minutes`} />
          <InfoCell label="Total Questions" value={String(meta.total_questions)} />
        </tr>
        <tr>
          <InfoCell label="Marks" value={marksLabel} />
          <InfoCell
            label="Negative Marks"
            value={negative ? `Yes (−${meta.negative_mark_per_wrong} per wrong answer)` : "No"}
          />
        </tr>
        <tr>
          <InfoCell
            label="Question Type"
            value={multiCount > 0 ? "Single-answer and select-all-that-apply" : "Single-answer"}
          />
          {multiCount > 0 ? (
            <InfoCell label="Multi-select Questions" value={`${multiCount} only`} />
          ) : (
            <InfoCell label="" value="" />
          )}
        </tr>
      </InfoTable>

      {/* Instructions */}
      <div className="mb-4">
        <h2 className="mb-1 text-sm font-bold">Instructions for Students</h2>
        <ol className="list-decimal pl-5 text-xs leading-relaxed">
          <li>Write your name and hall ticket/ID clearly before starting the test.</li>
          <li>
            Answer all {meta.total_questions} questions.{" "}
            {marksSet.size === 1 ? `Each question carries ${[...marksSet][0]} mark${[...marksSet][0] === 1 ? "" : "s"}.` : ""}{" "}
            {negative
              ? `Wrong answers carry ${meta.negative_mark_per_wrong} negative mark(s).`
              : "There is no negative marking."}
          </li>
          <li>
            Tick inside the checkbox against your chosen answer. For single-answer questions, tick
            only one option: A, B, C, or D.
          </li>
          {multiCount > 0 && (
            <li>
              For questions marked &ldquo;Select all that apply&rdquo;, more than one option may be
              correct. Tick every correct option. Full marks are awarded only when all correct
              options are selected and no wrong option is selected.
            </li>
          )}
          <li>
            Use the question paper space for quick working wherever needed. Do not use mobile
            phones, calculators, or external material unless specifically permitted by the
            invigilator.
          </li>
        </ol>
      </div>

      {/* Question paper pattern */}
      <div className="mb-6">
        <h2 className="mb-1 text-sm font-bold">Question Paper Pattern</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-400 px-2 py-1 text-left">Section</th>
              <th className="border border-gray-400 px-2 py-1 text-left">Question Range</th>
              <th className="border border-gray-400 px-2 py-1 text-left">Count</th>
              <th className="border border-gray-400 px-2 py-1 text-left">Difficulty Split</th>
            </tr>
          </thead>
          <tbody>
            {meta.sections.map((s, i) => (
              <tr key={i}>
                <td className="border border-gray-400 px-2 py-1">{s.subject}</td>
                <td className="border border-gray-400 px-2 py-1">{ranges[i]}</td>
                <td className="border border-gray-400 px-2 py-1">{s.num_questions}</td>
                <td className="border border-gray-400 px-2 py-1">{difficultySplit(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sections + questions */}
      {groups.map((g, gi) => (
        <div key={g.sectionId} className="mb-4">
          <h2 className="mb-2 border-b border-gray-400 pb-1 text-sm font-bold">
            {meta.sections[gi]?.subject ?? `Section ${gi + 1}`}
          </h2>
          <div className="grid gap-3">
            {g.questions.map((q) => {
              const passageKey = q.passage ? `${g.sectionId}:${q.passage.body}` : null;
              const showPassage = passageKey != null && passageKey !== lastPassageKey;
              if (passageKey != null) lastPassageKey = passageKey;
              return (
                <div key={q.question_id} className="break-inside-avoid text-sm">
                  {showPassage && q.passage && (
                    <div className="mb-2 border-l-4 border-gray-400 bg-gray-50 p-2 text-xs">
                      {q.passage.title && <p className="font-semibold">{q.passage.title}</p>}
                      <RichContent content={q.passage.body} />
                    </div>
                  )}
                  <div className="font-medium">
                    <span className="font-bold">Q{q.position + 1}. </span>
                    <RichContent content={q.stem} inline />
                    {q.answer_type === "multi" && (
                      <span className="text-xs font-semibold"> [Select all that apply]</span>
                    )}
                  </div>
                  {q.stem_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.stem_image_url} alt="" className="my-1 max-h-40" />
                  )}
                  <ul className="mt-1 grid gap-0.5 pl-4">
                    {q.options.map((o, i) => (
                      <li key={o.id} className="text-sm">
                        <span className="mr-1">☐</span>
                        <span className="mr-1">{LETTERS[i]}.</span>
                        <RichContent content={o.label} inline />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </PrintDocument>
  );
}
