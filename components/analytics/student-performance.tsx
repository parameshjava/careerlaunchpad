"use client";

// Student academic-performance view (story #73): the prescriptive study plan up
// top, then the evidence — a monthly score trend, subject strengths/weaknesses,
// and a chapter drill-down. All recharts usage lives behind this one client
// boundary. Self-fetches /api/student/performance/*; every series is a percent so
// there is a single y-axis. Reuses the app's established chart palette + CSS-var
// tooltip theming (components/analytics/AnalyticsView.tsx) for consistency and
// dark-mode; long-label comparisons use horizontal bars. Built to docs/STYLE_GUIDE.md.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Table2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Same categorical palette + tooltip theming the rest of the analytics use.
const PALETTE = [
  "#2563eb", "#7c3aed", "#06b6d4", "#f59e0b", "#10b981", "#ec4899",
  "#6366f1", "#ef4444", "#a855f7", "#14b8a6", "#f97316", "#0ea5e9",
];
const BRAND = "#2563eb";
const WEAK = "#f43f5e"; // rose — a reserved status colour for below-pass, never a series
const PASS_LINE = 40; // platform default pass mark (chapter_quiz.pass_pct); a reference guide
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;

type Summary = {
  overall_pct: number | null;
  pass_rate_pct: number | null;
  chapters_assessed: number;
  chapters_completed: number;
  strongest_subject: string | null;
  strongest_pct: number | null;
  weakest_subject: string | null;
  weakest_pct: number | null;
};
type Subject = {
  subject_id: string;
  subject_name: string;
  score_pct: number | null;
  chapters_assessed: number;
  chapters_completed: number;
};
type Chapter = {
  chapter_id: string;
  chapter_name: string;
  best_pct: number | null;
  first_pct: number | null;
  attempts_used: number;
  passed: boolean | null;
};
type TrendPoint = { month: string; subject_id: string | null; subject_name: string | null; pct: number };
type PlanItem = {
  chapter_id: string;
  chapter_name: string;
  subject_name: string;
  best_pct: number | null;
  attempts_used: number;
  attempts_remaining: number;
  pass_pct: number;
  category: "quick_win" | "not_attempted" | "needs_study";
};

const RANGES: { value: string; label: string; months: number | null }[] = [
  { value: "12m", label: "Last 12 months", months: 12 },
  { value: "6m", label: "Last 6 months", months: 6 },
  { value: "all", label: "All time", months: null },
];

function fromDate(months: number | null): string | null {
  if (months == null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const monthLabel = (m: string) =>
  new Date(m).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground bg-muted/40 flex min-h-[120px] items-center justify-center rounded-lg border p-4 text-center text-sm">
      {message}
    </div>
  );
}

// ---- Snapshot tiles ---------------------------------------------------------
function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`mt-1 text-2xl font-bold tracking-tight ${tone ?? ""}`}>{value}</p>
        {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---- Study plan -------------------------------------------------------------
const CAT: Record<PlanItem["category"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  quick_win: { label: "Quick win", variant: "default" },
  not_attempted: { label: "Not attempted", variant: "outline" },
  needs_study: { label: "Needs study", variant: "secondary" },
};

function StudyPlan({ plan }: { plan: PlanItem[] }) {
  if (plan.length === 0)
    return (
      <EmptyState message="Nothing outstanding — you've passed every completed chapter you've attempted. 🎉" />
    );
  return (
    <ul className="divide-y rounded-md border">
      {plan.slice(0, 12).map((p) => (
        <li key={p.chapter_id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium break-words">{p.chapter_name}</p>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={CAT[p.category].variant}>{CAT[p.category].label}</Badge>
              <span>{p.subject_name}</span>
              <span>
                · {p.best_pct == null ? "not attempted" : `best ${Math.round(p.best_pct)}% (pass ${p.pass_pct}%)`}
              </span>
              <span>· {p.attempts_remaining} attempt{p.attempts_remaining === 1 ? "" : "s"} left</span>
            </div>
          </div>
          {p.attempts_remaining > 0 && (
            <Button size="sm" variant="outline" asChild className="shrink-0">
              <Link href="/student/quizzes">Practise</Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---- Subject strengths/weaknesses (horizontal bars + table fallback) --------
function SubjectBars({
  subjects,
  onPick,
  selected,
}: {
  subjects: Subject[];
  onPick: (s: Subject) => void;
  selected: string | null;
}) {
  const rows = subjects
    .filter((s) => s.score_pct != null)
    .sort((a, b) => (a.score_pct ?? 0) - (b.score_pct ?? 0)); // weakest first — surfaces gaps
  if (rows.length === 0)
    return <EmptyState message="Take a chapter assessment to see your subject scores." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 44)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="subject_name" width={110} tick={AXIS_TICK} />
        <Tooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${Math.round(v)}%`, "Score"]}
        />
        <ReferenceLine x={PASS_LINE} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
        <Bar dataKey="score_pct" radius={[0, 4, 4, 0]} onClick={(_, i) => onPick(rows[i])} className="cursor-pointer">
          <LabelList dataKey="score_pct" position="right" formatter={(v: number) => `${Math.round(v)}%`} className="fill-foreground text-[11px]" />
          {rows.map((s) => (
            <Cell
              key={s.subject_id}
              fill={(s.score_pct ?? 0) < PASS_LINE ? WEAK : BRAND}
              fillOpacity={selected && selected !== s.subject_id ? 0.4 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SubjectTable({ subjects }: { subjects: Subject[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">Subject</th>
            <th className="py-2 pr-3 font-medium">Score</th>
            <th className="py-2 font-medium">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.subject_id} className="border-b last:border-0">
              <td className="py-2 pr-3">{s.subject_name}</td>
              <td className="py-2 pr-3">{s.score_pct == null ? "—" : `${Math.round(s.score_pct)}%`}</td>
              <td className="text-muted-foreground py-2">
                {s.chapters_assessed}/{s.chapters_completed} chapters
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Chapter drill-down -----------------------------------------------------
function ChapterBars({ chapters }: { chapters: Chapter[] }) {
  const rows = chapters.filter((c) => c.best_pct != null);
  if (rows.length === 0)
    return <EmptyState message="No assessed chapters in this subject yet." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 40)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="chapter_name" width={130} tick={AXIS_TICK} />
        <Tooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${Math.round(v)}%`, "Best"]}
        />
        <ReferenceLine x={PASS_LINE} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
        <Bar dataKey="best_pct" radius={[0, 4, 4, 0]}>
          <LabelList dataKey="best_pct" position="right" formatter={(v: number) => `${Math.round(v)}%`} className="fill-foreground text-[11px]" />
          {rows.map((c) => (
            <Cell key={c.chapter_id} fill={(c.best_pct ?? 0) < PASS_LINE ? WEAK : BRAND} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Trend ------------------------------------------------------------------
function TrendChart({ points, bySubject }: { points: TrendPoint[]; bySubject: boolean }) {
  const months = [...new Set(points.map((p) => p.month))].sort();
  if (months.length === 0)
    return <EmptyState message="Your score trend appears here once you've taken assessments." />;

  if (!bySubject) {
    const data = months.map((m) => ({
      month: monthLabel(m),
      pct: points.find((p) => p.month === m && p.subject_id == null)?.pct ?? null,
    }));
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={AXIS_TICK} />
          <YAxis domain={[0, 100]} width={34} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)}%`, "Overall"]} />
          <Line type="monotone" dataKey="pct" stroke={BRAND} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Per-subject series (≤ 6 shown; a legend names each).
  const subjects = [...new Map(points.filter((p) => p.subject_id).map((p) => [p.subject_id!, p.subject_name!])).entries()].slice(0, 6);
  const data = months.map((m) => {
    const row: Record<string, string | number | null> = { month: monthLabel(m) };
    for (const [sid] of subjects) row[sid] = points.find((p) => p.month === m && p.subject_id === sid)?.pct ?? null;
    return row;
  });
  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={AXIS_TICK} />
          <YAxis domain={[0, 100]} width={34} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${Math.round(v)}%`} />
          {subjects.map(([sid], i) => (
            <Line key={sid} type="monotone" dataKey={sid} name={subjects[i][1]} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {subjects.map(([sid, name], i) => (
          <span key={sid} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Root -------------------------------------------------------------------
export function StudentPerformance() {
  const [range, setRange] = useState("12m");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [selected, setSelected] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [trendBySubject, setTrendBySubject] = useState(false);
  const [subjectTable, setSubjectTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const qs = useCallback(() => {
    const from = fromDate(RANGES.find((r) => r.value === range)?.months ?? null);
    return from ? `?from=${from}` : "";
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    const q = qs();
    Promise.all([
      fetch(`/api/student/performance/summary${q}`).then((r) => r.json()),
      fetch(`/api/student/performance/subjects${q}`).then((r) => r.json()),
      fetch(`/api/student/performance/trend${q}${q ? "&" : "?"}group=subject`).then((r) => r.json()),
      fetch(`/api/student/performance/study-plan`).then((r) => r.json()),
    ])
      .then(([s, sub, tr, pl]) => {
        if (cancelled) return;
        if (s.error) setError(s.error);
        setSummary(s.summary ?? null);
        setSubjects(sub.subjects ?? []);
        setTrend(tr.points ?? []);
        setPlan(pl.plan ?? []);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [qs]);

  function pickSubject(s: Subject) {
    if (selected?.subject_id === s.subject_id) {
      setSelected(null);
      return;
    }
    setSelected(s);
    setChapters([]);
    fetch(`/api/student/performance/subjects/${s.subject_id}/chapters${qs()}`)
      .then((r) => r.json())
      .then((d) => setChapters(d.chapters ?? []))
      .catch(() => setChapters([]));
  }

  if (loading)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading your performance…
      </p>
    );
  if (error && !summary)
    return (
      <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
        {error}
      </p>
    );

  const assessed = summary?.chapters_assessed ?? 0;
  if (assessed === 0)
    return (
      <EmptyState message="No assessment scores yet. Once you take a chapter assessment, your performance shows up here." />
    );

  return (
    <div className="space-y-6">
      {/* filter row */}
      <div className="flex items-center justify-end">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-8 w-[11rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* snapshot tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Overall score" value={summary?.overall_pct == null ? "—" : `${Math.round(summary.overall_pct)}%`} />
        <Tile label="Pass rate" value={summary?.pass_rate_pct == null ? "—" : `${Math.round(summary.pass_rate_pct)}%`} sub={`${assessed} of ${summary?.chapters_completed ?? 0} chapters assessed`} />
        <Tile label="Strongest" value={summary?.strongest_subject ?? "—"} sub={summary?.strongest_pct == null ? undefined : `${Math.round(summary.strongest_pct)}%`} tone="text-emerald-600 dark:text-emerald-400 text-lg" />
        <Tile label="Focus on" value={summary?.weakest_subject ?? "—"} sub={summary?.weakest_pct == null ? undefined : `${Math.round(summary.weakest_pct)}%`} tone="text-rose-600 dark:text-rose-400 text-lg" />
      </div>

      {/* study plan (the action the charts justify) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your study plan</CardTitle>
          <p className="text-muted-foreground text-xs">Where the next attempt pays off most — quick wins first.</p>
        </CardHeader>
        <CardContent>
          <StudyPlan plan={plan} />
        </CardContent>
      </Card>

      {/* trend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Score over time</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setTrendBySubject((v) => !v)}>
            {trendBySubject ? "Overall" : "By subject"}
          </Button>
        </CardHeader>
        <CardContent>
          <TrendChart points={trend} bySubject={trendBySubject} />
        </CardContent>
      </Card>

      {/* subjects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Subjects — strengths &amp; gaps</CardTitle>
            <p className="text-muted-foreground text-xs">Weakest first. Tap a subject to see its chapters. Dashed line = pass mark.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSubjectTable((v) => !v)} aria-label="Toggle table view">
            {subjectTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {subjectTable ? (
            <SubjectTable subjects={subjects} />
          ) : (
            <SubjectBars subjects={subjects} onPick={pickSubject} selected={selected?.subject_id ?? null} />
          )}
          {selected && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">{selected.subject_name} — chapters</p>
              <ChapterBars chapters={chapters} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
