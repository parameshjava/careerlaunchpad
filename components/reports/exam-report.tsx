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
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefSelect } from "@/components/ui/ref-select";
import { BRAND, NEUTRAL_MARK, sequentialStep } from "@/lib/chart-palette";
import { EmptyState, pct, pctLabel } from "@/components/analytics/performance/shared";
import { StudentExamMatrix } from "./student-exam-matrix";
import type {
  BandRow, ExamRow, ReportSummary, StudentExamRow, SubjectRow, TrendPoint,
} from "@/lib/exam-report-query";

// Trailing windows rather than an "academic year": no field records academic-year
// boundaries, so inferring them would be a guess (the same reasoning as #73's
// range filter, kept identical so the two views feel the same).
const RANGES = [
  { value: "6m", label: "Last 6 months", months: 6 },
  { value: "12m", label: "Last 12 months", months: 12 },
  { value: "24m", label: "Last 2 years", months: 24 },
  { value: "all", label: "All time", months: null },
  { value: "custom", label: "Custom range…", months: null },
] as const;

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

type Payload = {
  summary: ReportSummary | null;
  trend: TrendPoint[];
  exams: ExamRow[];
  subjects: SubjectRow[];
  distribution: BandRow[];
  students: StudentExamRow[];
};

export function ExamReport({ college, showCollege }: { college?: string | null; showCollege?: boolean }) {
  const [range, setRange] = useState<string>("12m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (range === "custom") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    } else {
      const months = RANGES.find((r) => r.value === range)?.months ?? null;
      if (months != null) p.set("from", monthsAgo(months));
    }
    if (college) p.set("college", college);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [range, from, to, college]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/exams${qs()}`)
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
  }, [qs]);

  const s = data?.summary ?? null;

  // Only sittings that someone actually sat become matrix columns; the full list
  // (including unsat ones) stays in the per-exam table below, where "0 of 40 sat
  // it" is the finding.
  const matrixExams = useMemo(
    () => (data?.exams ?? []).filter((e) => e.attempts > 0),
    [data?.exams],
  );

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
      {/* ---- range ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="report-range">Period</Label>
          <RefSelect
            id="report-range"
            value={range}
            onChange={setRange}
            className="w-full min-w-0 sm:w-48"
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
        {range === "custom" && (
          <>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="report-from">From</Label>
              <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="report-to">To</Label>
              <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        {loading && <Loader2 className="text-muted-foreground mb-2 size-4 animate-spin" aria-label="Loading" />}
      </div>

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
          <StudentExamMatrix
            rows={data?.students ?? []}
            exams={matrixExams}
            showCollege={!!showCollege}
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
