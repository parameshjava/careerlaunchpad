"use client";

/**
 * The college exam report: one date range, six views of the same window —
 * tiles, a trend over time, every exam side by side, subject strength, the score
 * distribution, and the students × exams matrix.
 *
 * The point of the page is that it answers across ALL exams at once. Every view
 * therefore reads from a single response keyed to one range (/api/reports/exams),
 * so two charts can never disagree about which period they are showing.
 *
 * No pass line anywhere: an exam has no pass mark in this schema (see migration
 * 179's header). Charts show averages, spread and shape and let the reader apply
 * their own standard.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND, sequentialStep } from "@/lib/chart-palette";
import { EmptyState, pct, pctLabel } from "@/components/analytics/performance/shared";
import { StudentScoreMatrix, type MatrixColumn, type MatrixRow } from "./student-score-matrix";
import { ReportRangeFields, monthLabel, useReportRange } from "./report-range";
import type {
  BandRow, ExamRow, ReportSummary, StudentExamRow, SubjectRow, TrendPoint,
} from "@/lib/exam-report-query";

type Payload = {
  summary: ReportSummary | null;
  trend: TrendPoint[];
  exams: ExamRow[];
  subjects: SubjectRow[];
  distribution: BandRow[];
  students: StudentExamRow[];
};

export function ExamReport({ college, showCollege }: { college?: string | null; showCollege?: boolean }) {
  const range = useReportRange(college);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/exams${range.qs()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // The RPCs RAISE for an unauthorized caller rather than returning empty,
        // so an error here is a real problem and must not be shown as "no data".
        setError(d.error ? String(d.error) : "");
        setData(d.error ? null : d);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [range.qs]);

  const s = data?.summary ?? null;

  // Only sittings that someone actually sat become matrix columns; the full list
  // (including unsat ones) stays in the per-exam table below, where "0 of 40 sat
  // it" is the finding.
  const matrixExams = useMemo(
    () => (data?.exams ?? []).filter((e) => e.attempts > 0),
    [data?.exams],
  );

  // Pivot the flat (student, sitting) pairs into matrix rows. Done here rather
  // than in the matrix, which is generic over what a column IS so the assessment
  // report can reuse it.
  const matrixColumns: MatrixColumn[] = useMemo(
    () =>
      matrixExams.map((e) => ({
        key: e.session_id,
        label: e.title,
        sublabel: [e.held_on, e.total_marks ? `${e.total_marks} marks` : null]
          .filter(Boolean)
          .join(" · ") || null,
      })),
    [matrixExams],
  );

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
      if (r.pct != null) row.values[r.session_id] = r.pct;
      by.set(r.student_id, row);
    }
    return [...by.values()];
  }, [data?.students]);

  const tiles = [
    { label: "Exams held", value: s?.sittings ?? 0, hint: "sittings in this period" },
    { label: "Students", value: s?.students ?? 0, hint: `${s?.attempts ?? 0} attempts` },
    { label: "Average", value: pct(s?.avg_pct), hint: `median ${pct(s?.median_pct)}` },
    {
      label: "Participation",
      value: s?.assigned ? `${Math.round((100 * (s.attempts ?? 0)) / s.assigned)}%` : "—",
      hint: s?.assigned ? `${s.attempts} of ${s.assigned} assigned` : "nobody assigned",
    },
  ];

  return (
    <div className="space-y-6">
      <ReportRangeFields id="exam" state={range} loading={loading} />

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

      {s?.best_exam && (
        <p className="text-muted-foreground text-sm">
          Strongest: <b className="text-foreground">{s.best_exam}</b> ({pct(s.best_pct)}) · Weakest:{" "}
          <b className="text-foreground">{s.weakest_exam}</b> ({pct(s.weakest_pct)})
        </p>
      )}

      {/* ---- trend ---------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Average score over time</CardTitle>
          <p className="text-muted-foreground text-sm">
            The mean of every attempt&rsquo;s percentage, by the month it was submitted.
          </p>
        </CardHeader>
        <CardContent>
          {(data?.trend ?? []).length === 0 ? (
            <EmptyState message="No attempts in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data!.trend.map((p) => ({ ...p, m: monthLabel(p.month) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tickFormatter={pctLabel} tick={{ fontSize: 12 }} width={44} />
                <Tooltip
                  formatter={(v, n) => (n === "avg_pct" ? [pctLabel(v), "Average"] : [v, String(n)])}
                />
                <Line type="monotone" dataKey="avg_pct" stroke={BRAND} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- exam comparison + distribution -------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Every exam, side by side</CardTitle>
            <p className="text-muted-foreground text-sm">Average percentage per sitting.</p>
          </CardHeader>
          <CardContent>
            {matrixExams.length === 0 ? (
              <EmptyState message="No exam has been sat in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, matrixExams.length * 38)}>
                <BarChart data={matrixExams} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={pctLabel} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="title" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [pctLabel(v), "Average"]} />
                  <Bar dataKey="avg_pct" radius={[0, 4, 4, 0]}>
                    {matrixExams.map((e) => (
                      <RCell key={e.session_id} fill={sequentialStep(e.avg_pct ?? 0).fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score distribution</CardTitle>
            <p className="text-muted-foreground text-sm">
              How many attempts fell in each band — the shape says whether a cohort is
              uniformly weak or split.
            </p>
          </CardHeader>
          <CardContent>
            {(data?.distribution ?? []).every((b) => b.attempts === 0) ? (
              <EmptyState message="No attempts in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data!.distribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="band" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={36} />
                  <Tooltip formatter={(v) => [v, "Attempts"]} />
                  <Bar dataKey="attempts" radius={[4, 4, 0, 0]}>
                    {(data?.distribution ?? []).map((b) => (
                      <RCell key={b.band} fill={sequentialStep(b.lower_pct + 10).fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- subjects ------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Subject strength across all exams</CardTitle>
          <p className="text-muted-foreground text-sm">
            Marks awarded against marks available per subject, pooled over every exam in the
            period — the question a single paper can&rsquo;t answer.
          </p>
        </CardHeader>
        <CardContent>
          {(data?.subjects ?? []).length === 0 ? (
            <EmptyState message="No graded questions in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, (data!.subjects.length) * 38)}>
              <BarChart data={data!.subjects} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={pctLabel} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="subject" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [pctLabel(v), "Average"]} />
                <Bar dataKey="avg_pct" radius={[0, 4, 4, 0]}>
                  {(data?.subjects ?? []).map((r) => (
                    <RCell key={r.subject} fill={sequentialStep(r.avg_pct ?? 0).fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- per-exam table ------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Exam by exam</CardTitle>
          <p className="text-muted-foreground text-sm">
            Includes sittings nobody sat — that is a finding, not an absence.
          </p>
        </CardHeader>
        <CardContent>
          {(data?.exams ?? []).length === 0 ? (
            <EmptyState message="No exams in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-max min-w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left">
                    <th className="px-3 py-2 font-semibold">Exam</th>
                    {showCollege && <th className="px-3 py-2 font-semibold">College</th>}
                    <th className="px-3 py-2 font-semibold">Held</th>
                    <th className="px-3 py-2 font-semibold">Sat</th>
                    <th className="px-3 py-2 font-semibold">Average</th>
                    <th className="px-3 py-2 font-semibold">Range</th>
                    <th className="px-3 py-2 font-semibold">Results</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.exams.map((e) => (
                    <tr key={e.session_id} className="hover:bg-muted/40 border-t">
                      <td className="px-3 py-2">
                        <Link href={`/dashboard/exams/sessions/${e.session_id}`} className="font-medium hover:underline">
                          {e.title}
                        </Link>
                        {e.label && <span className="text-muted-foreground"> · {e.label}</span>}
                      </td>
                      {showCollege && (
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {e.college_name ?? "—"}
                        </td>
                      )}
                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{e.held_on ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {e.attempts}
                        <span className="text-muted-foreground"> / {e.assigned}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{pct(e.avg_pct)}</td>
                      <td className="text-muted-foreground px-3 py-2 tabular-nums whitespace-nowrap">
                        {e.low_pct == null ? "—" : `${pct(e.low_pct)} – ${pct(e.high_pct)}`}
                      </td>
                      <td className="px-3 py-2">
                        {e.results_published ? (
                          <span className="text-xs font-medium text-emerald-700">published</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">not published</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- the matrix ----------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Every student, every exam</CardTitle>
          <p className="text-muted-foreground text-sm">
            Sort by any exam column to see who struggled with it. Download the CSV to work on
            it in a spreadsheet.
          </p>
        </CardHeader>
        <CardContent>
          <StudentScoreMatrix
            rows={matrixRows}
            columns={matrixColumns}
            showCollege={!!showCollege}
            countLabel="exams"
            footnote={
              <p>
                A blank cell means the student didn&rsquo;t sit that exam — it is never counted as
                0%. <b>Average</b> is the mean of their exam percentages, so a short quiz counts
                the same as a long mock. There is no pass mark on an exam anywhere in the
                platform, so no line is drawn — the shading is a gradient, not a verdict.
              </p>
            }
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Percentages are per exam ({"score ÷ that exam's total marks"}), because exams differ in
        total marks and raw marks cannot be compared across them. Only submitted and graded
        attempts count — abandoned ones never do. There is no pass mark on an exam in this
        platform, so nothing here reports a pass rate.
      </p>
    </div>
  );
}
