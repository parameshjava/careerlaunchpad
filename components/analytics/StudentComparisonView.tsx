"use client";

// The student "where do I stand?" view: their own profile compared with their
// college. Two kinds of comparison, all behind one client (recharts) boundary:
//
//   * Distribution charts (skills / primary goal / all goals) plot the COLLEGE's
//     popularity, with the segments the student personally selected highlighted
//     in brand blue and everyone else's in muted grey — so strengths ("blue I
//     share with peers") and gaps ("grey I don't have") read at a glance.
//   * The skill self-assessment overlays the student's own 1–5 ratings against
//     the college average (two series: You vs College avg).
//
// Pie/bar toggle is shared with the dashboard (same localStorage key), so a
// student's choice carries across the app.
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartColumnBig, ChartPie } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AssessmentDatum, CollegeAnalytics, Slice } from "@/lib/analytics-query";
import { BRAND, NEUTRAL, NEUTRAL_MARK, TOOLTIP_STYLE, HOVER_CURSOR } from "@/lib/chart-palette";

type ChartType = "pie" | "bar";
const STORAGE_KEY = "cl-chart-type";

// The student's own data wears the brand hue; the benchmark is a recessive
// neutral. Both from the shared palette module (lib/chart-palette.ts).
const YOU = BRAND;
const PEERS = NEUTRAL;


const NO_FOCUS_RING =
  "[&_svg]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-sector]:outline-none [&_path:focus]:outline-none [&_*:focus]:outline-none";

/** Keep the n most-popular slices, but never drop one the student selected
 * (otherwise their own skill could vanish from "their" comparison).
 *
 * The sort is applied unconditionally and is fully deterministic — most popular
 * first, then alphabetical to break the very common all-values-equal tie. It used
 * to run only when there were more than n slices, so a card with 4 items came back
 * in ref_* catalogue order while a card with 14 came back by popularity: two cards
 * side by side, ordered by different rules, neither of them stated. */
function orderSlices(slices: Slice[], n: number, mine: Set<string>): Slice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const extra = sorted.slice(n).filter((s) => mine.has(s.key));
  return [...head, ...extra];
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex h-[240px] items-center justify-center text-center text-sm">
      {message}
    </div>
  );
}

function ChartTypeToggle({ value, onChange }: { value: ChartType; onChange: (t: ChartType) => void }) {
  const options: { type: ChartType; label: string; Icon: typeof ChartPie }[] = [
    { type: "pie", label: "Pie", Icon: ChartPie },
    { type: "bar", label: "Bar", Icon: ChartColumnBig },
  ];
  return (
    <div className="bg-muted inline-flex items-center rounded-md p-0.5" role="group" aria-label="Chart type">
      {options.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          aria-pressed={value === type}
          onClick={() => onChange(type)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
            value === type
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// Two-tone distribution: college popularity, with the student's own selections
// in brand blue and everyone else's in muted grey.
function DistributionCompare({ data, type, mine }: { data: Slice[]; type: ChartType; mine: Set<string> }) {
  const slices = orderSlices(data, 8, mine);
  const fill = (key: string) => (mine.has(key) ? YOU : PEERS);

  if (type === "bar") {
    // the x-axis labels already give identity, so no legend is needed here
    return (
      <ResponsiveContainer width="100%" height={300} className={NO_FOCUS_RING}>
        <BarChart data={slices} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            interval={0}
            angle={-40}
            textAnchor="end"
            height={78}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis allowDecimals={false} width={28} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <Tooltip cursor={HOVER_CURSOR} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" name="Students" radius={[4, 4, 0, 0]} activeBar={false}>
            {slices.map((s) => (
              <Cell key={s.key} fill={fill(s.key)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div className="w-full shrink-0 sm:w-[210px]">
      <ResponsiveContainer width="100%" height={210} className={NO_FOCUS_RING}>
        <PieChart>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={82}
            innerRadius={44}
            paddingAngle={2}
            stroke="var(--background)"
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={fill(s.key)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 self-center">
        <SliceLegend slices={slices} mine={mine} />
      </div>
    </div>
  );
}

/** Beyond a handful of categories a donut stops being readable here, for a reason
 *  specific to this chart: colour encodes "is this mine?", NOT identity, so every
 *  one of a student's 14 skills is the same blue. No legend can map a row to an arc
 *  when the arcs are indistinguishable, and recharts' built-in Legend made it worse
 *  by centring variable-width labels into a ragged stack (which is what read as
 *  "the order is off" — the order actually matched the arcs).
 *
 *  So above PIE_MAX categories the card draws horizontal bars instead: the label
 *  sits beside its own bar, so identity needs no colour and no legend at all. Long
 *  skill names stay horizontal and readable, which they never were at -40°. */
/** For the small-N donuts: labels beside their own swatch, one per line. */
function SliceLegend({ slices, mine }: { slices: Slice[]; mine: Set<string> }) {
  return (
    // One column beside the chart. Two columns inside a narrow card cut every label
    // to "Arit…" / "Curr…", and a legend whose labels are unreadable is worse than no
    // legend. No rank numbers either — the arcs carry no numbers, so a rank here maps
    // to nothing on the chart and only steals label width.
    <ul className="list-none space-y-1">
      {slices.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-[11px] leading-tight">
          {/* Filled = the student's own pick, hollow = peers only. A shape difference
              rather than a repeated "yours" on every row: the word said nothing that
              the marker and the section key above don't already say, and on a card
              where every row is the student's own it was fourteen identical words.
              Shape also keeps this off colour-alone for CVD readers. */}
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={
              mine.has(s.key)
                ? { background: YOU }
                : { background: "transparent", boxShadow: `inset 0 0 0 2px ${NEUTRAL_MARK}` }
            }
          />
          <span className="min-w-0 flex-1 truncate" title={s.label}>
            {s.label}
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">{s.value}</span>
          <span className="sr-only">{mine.has(s.key) ? "your selection" : "peers only"}</span>
        </li>
      ))}
    </ul>
  );
}

function DistributionCard({
  title,
  data,
  type,
  mine,
  emptyMessage,
}: {
  title: string;
  data: Slice[];
  type: ChartType;
  mine: Set<string>;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">
          {title}{" "}
          <span className="text-muted-foreground text-xs font-normal">(your college)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {data.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <DistributionCompare data={data} type={type} mine={mine} />
        )}
      </CardContent>
    </Card>
  );
}

// You vs College average on the 1–5 self-assessment scale.
type CompareDatum = { key: string; label: string; you: number; college: number };

function AssessmentCompare({ data, type }: { data: CompareDatum[]; type: ChartType }) {
  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={300} className={NO_FOCUS_RING}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            interval={0}
            angle={-40}
            textAnchor="end"
            height={88}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            domain={[0, 5]}
            tickCount={6}
            allowDecimals={false}
            width={28}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip cursor={HOVER_CURSOR} contentStyle={TOOLTIP_STYLE} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="you" name="You" fill={YOU} radius={[4, 4, 0, 0]} activeBar={false} />
          <Bar dataKey="college" name="College avg" fill="#a78bfa" radius={[4, 4, 0, 0]} activeBar={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300} className={NO_FOCUS_RING}>
      <RadarChart data={data} outerRadius="62%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
        <PolarRadiusAxis angle={90} domain={[0, 5]} tickCount={6} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} />
        <Radar name="You" dataKey="you" stroke={YOU} fill={YOU} fillOpacity={0.35} />
        <Radar name="College avg" dataKey="college" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.12} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function AssessmentCard({ data, type }: { data: CompareDatum[]; type: ChartType }) {
  const hasData = data.some((d) => d.you > 0 || d.college > 0);
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">
          Skill self-assessment{" "}
          <span className="text-muted-foreground text-xs font-normal">(you vs college, 1–5)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {!hasData ? (
          <EmptyState message="Complete the self-assessment step to compare your ratings." />
        ) : (
          <AssessmentCompare data={data} type={type} />
        )}
      </CardContent>
    </Card>
  );
}

/** Small legend explaining the two-tone distribution colours. */
function ColorKey() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full" style={{ background: YOU }} /> Your selections
      </span>
      <span className="inline-flex items-center gap-1.5">
        {/* hollow, matching the per-row markers in the card legends */}
        <span
          className="size-2.5 rounded-full"
          style={{ background: "transparent", boxShadow: `inset 0 0 0 2px ${NEUTRAL_MARK}` }}
        />{" "}
        College peers
      </span>
    </div>
  );
}

export function StudentComparisonView({
  self,
  college,
  collegeName,
  collegeStudents,
}: {
  self: CollegeAnalytics;
  college: CollegeAnalytics;
  collegeName: string | null;
  collegeStudents: number;
}) {
  // Pie/bar choice, shared with the dashboard and remembered across visits.
  // Start "pie" on both server and client to avoid a hydration mismatch.
  const [chartType, setChartType] = useState<ChartType>("pie");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "pie" || saved === "bar") setChartType(saved);
  }, []);
  function updateChartType(t: ChartType) {
    setChartType(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode / storage disabled — keep the in-session choice anyway */
    }
  }

  // The student's own selections, used to highlight them inside the college view.
  const mySkills = new Set(self.skills.map((s) => s.key));
  const myPrimary = new Set(self.primaryGoals.map((s) => s.key));
  const myGoals = new Set(self.allGoals.map((s) => s.key));

  // Align You vs College avg on the same (full) set of assessment dimensions.
  const selfByKey = new Map(self.assessment.map((a) => [a.key, a.average]));
  const assessment: CompareDatum[] = college.assessment.map((c) => ({
    key: c.key,
    label: c.label,
    you: selfByKey.get(c.key) ?? 0,
    college: c.average,
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ColorKey />
        <ChartTypeToggle value={chartType} onChange={updateChartType} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DistributionCard
          title="Skills"
          data={college.skills}
          type={chartType}
          mine={mySkills}
          emptyMessage="No skills recorded across your college yet."
        />
        <DistributionCard
          title="Primary career goal"
          data={college.primaryGoals}
          type={chartType}
          mine={myPrimary}
          emptyMessage="No primary goals recorded across your college yet."
        />
        <DistributionCard
          title="Career goals (all)"
          data={college.allGoals}
          type={chartType}
          mine={myGoals}
          emptyMessage="No career goals recorded across your college yet."
        />
        <AssessmentCard data={assessment} type={chartType} />
      </div>

      <p className="text-muted-foreground text-xs">
        Compared against{" "}
        <span className="text-foreground font-medium">{collegeStudents}</span>{" "}
        {collegeStudents === 1 ? "student" : "students"}
        {collegeName ? ` at ${collegeName}` : ""}.
      </p>
    </div>
  );
}
