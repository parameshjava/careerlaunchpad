"use client";

/**
 * The college chapter-ASSESSMENT report — every student's chapter-quiz results
 * for the college, across all subjects at once.
 *
 * Sibling of exam-report.tsx and deliberately shaped the same way (one range, one
 * response, the same matrix component), but it is NOT the same report:
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
 * is answered by the weakest-chapters table above it.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND, categorical, sequentialStep } from "@/lib/chart-palette";
import { EmptyState, pct, pctLabel } from "@/components/analytics/performance/shared";
import { StudentScoreMatrix, type MatrixColumn, type MatrixRow } from "./student-score-matrix";
import { ReportRangeFields, monthLabel, useReportRange } from "./report-range";
import type {
  AssessmentChapterRow, AssessmentStudentRow, AssessmentSubjectRow,
  AssessmentSummary, AssessmentTrendPoint,
} from "@/lib/assessment-report-query";

type Payload = {
  summary: AssessmentSummary | null;
  trend: AssessmentTrendPoint[];
  subjects: AssessmentSubjectRow[];
  chapters: AssessmentChapterRow[];
  students: AssessmentStudentRow[];
};

export function AssessmentReport({
  college,
  showCollege,
}: {
  college?: string | null;
  showCollege?: boolean;
}) {
  const range = useReportRange(college);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/assessments${range.qs()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // The RPCs RAISE for an unauthorized caller rather than returning empty,
        // so an error here is a real problem and must not read as "no data".
        setError(d.error ? String(d.error) : "");
        setData(d.error ? null : d);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [range.qs]);

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
      if (r.avg_pct != null) row.values[r.subject_id ?? r.subject] = Number(r.avg_pct);
      by.set(r.student_id, row);
    }
    return [...by.values()];
  }, [data?.students]);

  const tiles = [
    { label: "Students assessed", value: s?.students ?? 0, hint: `${s?.attempts ?? 0} attempts` },
    {
      label: "Chapters covered",
      value: s?.chapters_assessed ?? 0,
      hint: `${data?.subjects?.length ?? 0} subjects`,
    },
    { label: "Average", value: pct(s?.avg_pct), hint: `median ${pct(s?.median_pct)}` },
    {
      label: "Pass rate",
      value: pct(s?.pass_rate_pct),
      hint: "best attempt vs the chapter's pass mark",
    },
  ];

  // Weakest first — the list exists to say what to reteach.
  const weakest = useMemo(
    () => [...(data?.chapters ?? [])].sort((a, b) => (a.avg_pct ?? 0) - (b.avg_pct ?? 0)),
    [data?.chapters],
  );

  return (
    <div className="space-y-6">
      <ReportRangeFields id="assess" state={range} loading={loading} />

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* ---- tiles ---------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-6">
              <div className="text-2xl font-semibold">{t.value}</div>
              <p className="mt-0.5 text-sm font-medium">{t.label}</p>
              <p className="text-muted-foreground text-xs">{t.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {s?.best_subject && (
        <p className="text-muted-foreground text-sm">
          Strongest: <b className="text-foreground">{s.best_subject}</b> ({pct(s.best_pct)}) ·
          Weakest: <b className="text-foreground">{s.weakest_subject}</b> ({pct(s.weakest_pct)})
        </p>
      )}

      {/* ---- trend ---------------------------------------------------------- */}
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

      {/* ---- subjects + weakest chapters ------------------------------------ */}
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
                  <thead className="bg-muted/60 sticky top-0">
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
                          <span className="block max-w-56 truncate font-medium" title={c.chapter}>
                            {c.chapter}
                          </span>
                          <span className="text-muted-foreground block max-w-56 truncate text-xs">
                            {c.subject}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{pct(c.avg_pct)}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {c.below_pass}
                          <span className="text-muted-foreground"> / {c.students}</span>
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

      {/* ---- the matrix ----------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Every student, every subject</CardTitle>
          <p className="text-muted-foreground text-sm">
            Sort by any subject column to see who is behind in it. Download the CSV to work on
            it in a spreadsheet.
          </p>
        </CardHeader>
        <CardContent>
          <StudentScoreMatrix
            rows={matrixRows}
            columns={matrixColumns}
            showCollege={!!showCollege}
            countLabel="subjects"
            footnote={
              <p>
                A blank cell means the student hasn&rsquo;t attempted any chapter in that subject
                — it is never counted as 0%. Each cell is the average of their <b>best</b>{" "}
                attempt per chapter, so retrying a quiz until it clicks improves the number
                rather than dragging it down.
              </p>
            }
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        One score per student per chapter: their highest submitted attempt. Attempts in progress
        never count. Pass rate is that best attempt measured against the chapter&rsquo;s own pass
        mark, which is why it can be reported here and is deliberately absent from the exam
        report.
      </p>
    </div>
  );
}
