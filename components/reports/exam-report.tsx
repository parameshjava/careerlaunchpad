"use client";

/**
 * The college exam report, as four questions rather than a stack of charts:
 *
 *   1 At a glance      — is the cohort doing well, and is it improving?
 *   2 Where the gaps are — which subjects, and how is the cohort spread?
 *   3 Every exam       — which sitting went badly?
 *   4 Every student    — who needs help?
 *
 * Every view reads from a single response keyed to one window (/api/reports/exams),
 * so two charts can never disagree about which period they are showing. The
 * period itself is owned by the workspace, not here, so it survives switching
 * between exams and assessments.
 *
 * No pass line anywhere: an exam has no pass mark in this schema (see migration
 * 179's header). Charts show averages, spread and shape and let the reader apply
 * their own standard.
 *
 * There used to be a "every exam, side by side" bar chart above the exam table.
 * It ranked the same 14 rows the table lists, and the table says strictly more
 * (held date, attempted vs assigned, range, published) — so the table became
 * sortable and the chart went.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND, sequentialStep } from "@/lib/chart-palette";
import { EmptyState, pct, pctLabel } from "@/components/analytics/performance/shared";
import { cn } from "@/lib/utils";
import { StudentScoreMatrix, type MatrixColumn, type MatrixRow } from "./student-score-matrix";
import { StudentRankings } from "./student-rankings";
import { monthLabel, type ReportRange } from "./report-range";
import { Kpi, Methodology, useReportData } from "./report-kit";
import { ReportSection, type SectionDef } from "./report-section";
import type {
  BandRow, ExamRow, ReportSummary, StudentExamRow, SubjectRow, TrendPoint,
} from "@/lib/exam-report-query";

export const EXAM_SECTIONS: SectionDef[] = [
  { id: "at-a-glance", label: "At a glance" },
  { id: "gaps", label: "Where the gaps are" },
  { id: "every-exam", label: "Every exam" },
  { id: "rankings", label: "Rankings" },
  { id: "every-student", label: "Every student" },
];

type Payload = {
  summary: ReportSummary | null;
  trend: TrendPoint[];
  exams: ExamRow[];
  subjects: SubjectRow[];
  distribution: BandRow[];
  students: StudentExamRow[];
};

type ExamSort = "held" | "title" | "attempted" | "avg";

/** 42.00 -> "42", 41.50 -> "41.5" — marks are usually whole and shouldn't look
 *  like currency. */
const trim = (n: number) => String(Math.round(n * 100) / 100);

export function ExamReport({
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
  const { data, prior, loading, error, savedAt } = useReportData<Payload>("/api/reports/exams", range, userId);
  useEffect(() => onStatus?.({ loading, savedAt }), [loading, savedAt, onStatus]);
  const s = data?.summary ?? null;

  // Only sittings someone actually attempted become matrix columns; the full
  // list (including untouched ones) stays in the per-exam table, where
  // "0 of 40 attempted it" is the finding.
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
      if (r.pct != null) {
        row.values[r.session_id] = r.pct;
        // The marks behind the percentage, for the expanded ranking row. Shown
        // as "42 of 60" because a percentage alone hides how much was at stake.
        (row.notes ??= {})[r.session_id] =
          r.score == null
            ? "—"
            : `${trim(r.score)}${r.total_marks == null ? "" : ` of ${trim(r.total_marks)}`} marks`;
      }
      by.set(r.student_id, row);
    }
    return [...by.values()];
  }, [data?.students]);

  // ---- the exam table, sortable (this is what replaced the bar chart) -------
  const [sort, setSort] = useState<ExamSort>("held");
  const [asc, setAsc] = useState(false);
  const sortedExams = useMemo(() => {
    const val = (e: ExamRow): string | number | null => {
      if (sort === "title") return e.title.toLowerCase();
      if (sort === "attempted") return e.attempts;
      if (sort === "avg") return e.avg_pct;
      return e.held_on;
    };
    return [...(data?.exams ?? [])].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      // Nulls last both ways: an exam nobody attempted has no average, and that
      // is not the same as the lowest one.
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y);
      return asc ? c : -c;
    });
  }, [data?.exams, sort, asc]);

  function toggleSort(k: ExamSort) {
    if (sort === k) setAsc((v) => !v);
    else {
      setSort(k);
      // A new column opens ascending, except the date — for "when", newest first
      // is what anyone means.
      setAsc(k !== "held");
    }
  }

  const participation = s?.assigned
    ? `${Math.round((100 * (s.attempts ?? 0)) / s.assigned)}%`
    : "—";
  const priorAvg = (prior?.avg_pct as number | null | undefined) ?? null;

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
          <Kpi label="Exams held" value={s?.sittings ?? 0} hint="in this period" />
          <Kpi
            label="Participation"
            value={participation}
            hint={s?.assigned ? `${s.attempts} of ${s.assigned} assigned` : "nobody assigned"}
          />
          <Kpi label="Students" value={s?.students ?? 0} hint={`${s?.attempts ?? 0} attempts`} />
        </div>

        {s?.best_exam && (
          <p className="text-muted-foreground text-sm">
            Strongest: <b className="text-foreground">{s.best_exam}</b> ({pct(s.best_pct)}) ·
            Weakest: <b className="text-foreground">{s.weakest_exam}</b> ({pct(s.weakest_pct)})
          </p>
        )}

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
      </ReportSection>

      {/* ================= 2 · where the gaps are ========================== */}
      <ReportSection
        id="gaps"
        num={2}
        title="Where the gaps are"
        blurb="Which subjects are weak, and whether the cohort is uniformly weak or split."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Subject strength across all exams</CardTitle>
              <p className="text-muted-foreground text-sm">
                Marks awarded against marks available per subject, pooled over every exam in
                the period — the question a single paper can&rsquo;t answer.
              </p>
            </CardHeader>
            <CardContent>
              {(data?.subjects ?? []).length === 0 ? (
                <EmptyState message="No graded questions in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, data!.subjects.length * 38)}>
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
      </ReportSection>

      {/* ================= 3 · every exam ================================== */}
      <ReportSection
        id="every-exam"
        num={3}
        title="Every exam"
        blurb="Sort by average to rank the sittings, or by attempted to find the ones nobody sat — that is a finding, not an absence."
      >
        <Card>
          <CardContent className="pt-6">
            {(data?.exams ?? []).length === 0 ? (
              <EmptyState message="No exams in this period." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-max min-w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-left">
                      <ExamTh k="title" sort={sort} asc={asc} onSort={toggleSort}>Exam</ExamTh>
                      {showCollege && <th className="px-3 py-2 font-semibold">College</th>}
                      <ExamTh k="held" sort={sort} asc={asc} onSort={toggleSort}>Held</ExamTh>
                      <ExamTh k="attempted" sort={sort} asc={asc} onSort={toggleSort}>Attempted</ExamTh>
                      <ExamTh k="avg" sort={sort} asc={asc} onSort={toggleSort}>Average</ExamTh>
                      <th className="px-3 py-2 font-semibold">Range</th>
                      <th className="px-3 py-2 font-semibold">Results</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExams.map((e) => (
                      <tr key={e.session_id} className="hover:bg-muted/40 border-t">
                        <td className="px-3 py-2">
                          <Link
                            href={`/dashboard/exams/sessions/${e.session_id}`}
                            className="font-medium hover:underline"
                          >
                            {e.title}
                          </Link>
                          {e.label && <span className="text-muted-foreground"> · {e.label}</span>}
                        </td>
                        {showCollege && (
                          <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                            {e.college_name ?? "—"}
                          </td>
                        )}
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {e.held_on ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {e.attempts}
                          <span className="text-muted-foreground"> of {e.assigned}</span>
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
      </ReportSection>

      {/* ================= 4 · rankings ==================================== */}
      <ReportSection
        id="rankings"
        num={4}
        title="Rankings"
        blurb="Every student in order, best first. Open a row for the exam-by-exam scores behind their average."
      >
        <Card>
          <CardContent className="pt-6">
            <StudentRankings
              rows={matrixRows}
              columns={matrixColumns}
              showCollege={!!showCollege}
              countLabel="exams"
              itemLabel="Exam"
            />
          </CardContent>
        </Card>
      </ReportSection>

      {/* ================= 5 · every student =============================== */}
      <ReportSection
        id="every-student"
        num={5}
        title="Every student"
        blurb="Sort by any exam column to see who struggled with it. Download the CSV to work on it in a spreadsheet."
      >
        <Card>
          <CardContent className="pt-6">
            <StudentScoreMatrix
              rows={matrixRows}
              columns={matrixColumns}
              showCollege={!!showCollege}
              countLabel="exams"
              footnote={
                <p>
                  A blank cell means the student didn&rsquo;t attempt that exam — it is never
                  counted as 0%.
                </p>
              }
            />
          </CardContent>
        </Card>
      </ReportSection>

      <Methodology>
        <p>
          Percentages are per exam ({"score ÷ that exam's total marks"}), because exams differ in
          total marks and raw marks cannot be compared across them. Only submitted and graded
          attempts count — abandoned ones never do.
        </p>
        <p>
          A student&rsquo;s <b>Average</b> is the mean of their exam percentages, so a short quiz
          counts the same as a long mock. A marks-weighted mean would let one long paper decide
          their whole average.
        </p>
        <p>
          There is no pass mark on an exam anywhere in this platform, so nothing here reports a
          pass rate and no line is drawn on any chart — the shading is a gradient, not a verdict.
        </p>
        <p>
          <b>vs the previous period</b> compares the same measure over the window of equal length
          immediately before this one. All time has no previous window, so it shows no comparison.
        </p>
      </Methodology>
    </div>
  );
}

function ExamTh({
  k, sort, asc, onSort, children,
}: {
  k: ExamSort;
  sort: ExamSort;
  asc: boolean;
  onSort: (k: ExamSort) => void;
  children: React.ReactNode;
}) {
  const active = sort === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (asc ? "ascending" : "descending") : "none"}
      className="px-3 py-2 font-semibold"
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("hover:text-primary flex items-center gap-1", active && "text-primary")}
      >
        {children}
        {active && (asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}
