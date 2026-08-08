"use client";

/**
 * The college chapter-ASSESSMENT report — every student's chapter-quiz results
 * for the college, in the same shape as the exam report:
 *
 *   1 At a glance        — average, pass rate, and whether they are moving
 *   2 Where the gaps are — which subjects, and which chapters to reteach
 *   3 Every student      — who is behind, per subject
 *
 * Sibling of exam-report.tsx and deliberately laid out the same way, but it is
 * NOT the same report:
 *
 *   • a chapter quiz is retakeable, so one score per (student, chapter) means
 *     their BEST submitted attempt — the same number the student sees of
 *     themselves. Averaging the retries would punish practising.
 *   • a chapter quiz HAS a pass mark (chapter_quiz.pass_pct), so pass rate is a
 *     real fact here. The exam report reports none because exams have no pass
 *     mark anywhere in this schema.
 *
 * Matrix columns are SUBJECTS, not individual chapters: a B.Tech cohort has
 * hundreds of chapters and a column per chapter is unreadable. "Which chapter"
 * is answered by the chapters-to-revisit list in section 2.
 */
import { useEffect, useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND, categorical, sequentialStep } from "@/lib/chart-palette";
import { EmptyState, pct, pctLabel } from "@/components/analytics/performance/shared";
import { StudentScoreMatrix, type MatrixColumn, type MatrixRow } from "./student-score-matrix";
import { StudentRankings } from "./student-rankings";
import { monthLabel, type ReportRange } from "./report-range";
import { Kpi, Methodology, useReportData } from "./report-kit";
import { ReportSection, type SectionDef } from "./report-section";
import type {
  AssessmentChapterRow, AssessmentStudentRow, AssessmentSubjectRow,
  AssessmentSummary, AssessmentTrendPoint,
} from "@/lib/assessment-report-query";

export const ASSESSMENT_SECTIONS: SectionDef[] = [
  { id: "at-a-glance", label: "At a glance" },
  { id: "gaps", label: "Where the gaps are" },
  { id: "rankings", label: "Rankings" },
  { id: "every-student", label: "Every student" },
];

type Payload = {
  summary: AssessmentSummary | null;
  trend: AssessmentTrendPoint[];
  subjects: AssessmentSubjectRow[];
  chapters: AssessmentChapterRow[];
  students: AssessmentStudentRow[];
};

export function AssessmentReport({
  range,
  showCollege,
  userId,
  onStatus,
}: {
  range: ReportRange;
  showCollege?: boolean;
  /** Namespaces the cache, so a shared browser never paints one account's
   *  students into another account's page. */
  userId?: string | null;
  /** Reports fetch state up to the sticky bar, which is always on screen. */
  onStatus?: (s: { loading: boolean; savedAt: number | null }) => void;
}) {
  const { data, prior, loading, error, savedAt } = useReportData<Payload>("/api/reports/assessments", range, userId);
  useEffect(() => onStatus?.({ loading, savedAt }), [loading, savedAt, onStatus]);
  const s = data?.summary ?? null;

  // Columns are the subjects that actually have a result, in the API's order
  // (strongest first), so the matrix and the subject chart read the same way.
  const matrixColumns: MatrixColumn[] = useMemo(
    () =>
      (data?.subjects ?? []).map((r) => ({
        key: r.subject_id ?? r.subject,
        label: r.subject,
        sublabel: `${r.chapters} ${r.chapters === 1 ? "chapter" : "chapters"}`,
      })),
    [data?.subjects],
  );

  // Pivot (student, subject) pairs into one row per student.
  const matrixRows: MatrixRow[] = useMemo(() => {
    const by = new Map<string, MatrixRow>();
    for (const r of data?.students ?? []) {
      const row = by.get(r.student_id) ?? {
        studentId: r.student_id,
        name: r.student_name ?? "Unnamed",
        roll: r.roll_number,
        college: r.college_name,
        values: {} as Record<string, number>,
      };
      if (r.avg_pct != null) {
        const key = r.subject_id ?? r.subject;
        row.values[key] = Number(r.avg_pct);
        // There are no marks to quote for a subject (it is an average over the
        // subject's chapters), so the detail is the coverage behind it.
        (row.notes ??= {})[key] =
          `${r.chapters} ${r.chapters === 1 ? "chapter" : "chapters"} · ${r.passed_count} passed`;
      }
      by.set(r.student_id, row);
    }
    return [...by.values()];
  }, [data?.students]);

  // Weakest first — the list exists to say what to reteach.
  const weakest = useMemo(
    () => [...(data?.chapters ?? [])].sort((a, b) => (a.avg_pct ?? 0) - (b.avg_pct ?? 0)),
    [data?.chapters],
  );

  const priorAvg = (prior?.avg_pct as number | null | undefined) ?? null;
  const priorPass = (prior?.pass_rate_pct as number | null | undefined) ?? null;

  return (
    <div className="space-y-10">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* ================= 1 · at a glance ================================== */}
      <ReportSection
        id="at-a-glance"
        num={1}
        title="At a glance"
        blurb="The headline numbers for this window, and whether they are moving."
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            label="Average"
            value={pct(s?.avg_pct)}
            hint={`median ${pct(s?.median_pct)}`}
            now={s?.avg_pct ?? null}
            then={priorAvg}
            compareLabel="the previous period"
          />
          <Kpi
            label="Pass rate"
            value={pct(s?.pass_rate_pct)}
            hint="best attempt vs the chapter's pass mark"
            now={s?.pass_rate_pct ?? null}
            then={priorPass}
            compareLabel="the previous period"
          />
          <Kpi
            label="Chapters covered"
            value={s?.chapters_assessed ?? 0}
            hint={`${data?.subjects?.length ?? 0} subjects`}
          />
          <Kpi
            label="Students assessed"
            value={s?.students ?? 0}
            hint={`${s?.attempts ?? 0} attempts`}
          />
        </div>

        {s?.best_subject && (
          <p className="text-muted-foreground text-sm">
            Strongest: <b className="text-foreground">{s.best_subject}</b> ({pct(s.best_pct)}) ·
            Weakest: <b className="text-foreground">{s.weakest_subject}</b> ({pct(s.weakest_pct)})
          </p>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average and pass rate over time</CardTitle>
            <p className="text-muted-foreground text-sm">
              By the month a chapter was assessed. Two lines because they can move apart — a
              cohort can creep over the pass mark without getting much better.
            </p>
          </CardHeader>
          <CardContent>
            {(data?.trend ?? []).length === 0 ? (
              <EmptyState message="No assessments in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data!.trend.map((p) => ({ ...p, m: monthLabel(p.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickFormatter={pctLabel} tick={{ fontSize: 12 }} width={44} />
                  <Tooltip
                    formatter={(v, n) => [pctLabel(v), n === "avg_pct" ? "Average" : "Pass rate"]}
                  />
                  <Line type="monotone" dataKey="avg_pct" stroke={BRAND} strokeWidth={2} dot />
                  <Line
                    type="monotone"
                    dataKey="pass_rate_pct"
                    stroke={categorical(3)}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </ReportSection>

      {/* ================= 2 · where the gaps are ========================== */}
      <ReportSection
        id="gaps"
        num={2}
        title="Where the gaps are"
        blurb="Which subjects are weak, and which chapters to reteach first."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Subject strength</CardTitle>
              <p className="text-muted-foreground text-sm">
                Average of every student&rsquo;s best attempt, pooled across the subject&rsquo;s
                chapters.
              </p>
            </CardHeader>
            <CardContent>
              {(data?.subjects ?? []).length === 0 ? (
                <EmptyState message="No assessments in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, data!.subjects.length * 38)}>
                  <BarChart data={data!.subjects} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={pctLabel} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="subject" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [pctLabel(v), "Average"]} />
                    <Bar dataKey="avg_pct" radius={[0, 4, 4, 0]}>
                      {data!.subjects.map((r) => (
                        <RCell key={r.subject} fill={sequentialStep(Number(r.avg_pct ?? 0)).fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Chapters to revisit</CardTitle>
              <p className="text-muted-foreground text-sm">
                Weakest first, with how many students are still below the pass mark.
              </p>
            </CardHeader>
            <CardContent>
              {weakest.length === 0 ? (
                <EmptyState message="No chapters assessed in this period." />
              ) : (
                <div className="max-h-[26rem] overflow-auto rounded-lg border">
                  <table className="w-max min-w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-semibold">Chapter</th>
                        <th className="px-3 py-2 font-semibold">Average</th>
                        <th className="px-3 py-2 font-semibold">Below pass</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weakest.map((c) => (
                        <tr key={c.chapter_id} className="hover:bg-muted/40 border-t">
                          <td className="px-3 py-2">
                            <span className="block max-w-56 font-medium break-words" title={c.chapter}>
                              {c.chapter}
                            </span>
                            <span className="text-muted-foreground block max-w-56 text-xs break-words">
                              {c.subject}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{pct(c.avg_pct)}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {c.below_pass}
                            <span className="text-muted-foreground"> of {c.students}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ReportSection>

      {/* ================= 3 · rankings ==================================== */}
      <ReportSection
        id="rankings"
        num={3}
        title="Rankings"
        blurb="Every student in order, best first. Open a row for the subject-by-subject scores behind their average."
      >
        <Card>
          <CardContent className="pt-6">
            <StudentRankings
              rows={matrixRows}
              columns={matrixColumns}
              showCollege={!!showCollege}
              countLabel="subjects"
              itemLabel="Subject"
            />
          </CardContent>
        </Card>
      </ReportSection>

      {/* ================= 4 · every student =============================== */}
      <ReportSection
        id="every-student"
        num={4}
        title="Every student"
        blurb="Sort by any subject column to see who is behind in it. Download the CSV to work on it in a spreadsheet."
      >
        <Card>
          <CardContent className="pt-6">
            <StudentScoreMatrix
              rows={matrixRows}
              columns={matrixColumns}
              showCollege={!!showCollege}
              countLabel="subjects"
              footnote={
                <p>
                  A blank cell means the student hasn&rsquo;t attempted any chapter in that
                  subject — it is never counted as 0%.
                </p>
              }
            />
          </CardContent>
        </Card>
      </ReportSection>

      <Methodology>
        <p>
          One score per student per chapter: their <b>highest submitted attempt</b>. Attempts in
          progress never count, and a retry that improves on an earlier try replaces it rather
          than being averaged with it — practising should not cost a student their number.
        </p>
        <p>
          A cell in the student table is the average of their best attempts across that
          subject&rsquo;s chapters, and a student&rsquo;s <b>Average</b> is the mean of those
          subject figures.
        </p>
        <p>
          <b>Pass rate</b> is that best attempt measured against the chapter&rsquo;s own pass
          mark. It can be reported here, and is deliberately absent from the exam report, because
          an exam has no pass mark anywhere in this platform.
        </p>
        <p>
          <b>vs the previous period</b> compares the same measure over the window of equal length
          immediately before this one. All time has no previous window, so it shows no comparison.
        </p>
      </Methodology>
    </div>
  );
}
