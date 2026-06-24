"use client";

// All recharts usage lives behind this one client boundary. It renders the
// charts the insights dashboard needs (preview-requirements): distribution of
// skills, primary career goal, and all career goals — each switchable between a
// donut (pie) and a vertical bar chart via a single toggle (remembered in
// localStorage) — plus the student skill-assessment (radar, or coloured bars on
// the same 1–5 scale). All four sit in one responsive row (stacking on mobile).
//
// On the console the three distribution charts are clickable: `onSelect` fires
// with the clicked segment so the parent can filter the students table below.
// `mode` only tweaks copy: "aggregate" = a college's students, "self" = one
// student's own profile (no click-to-filter there).
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

export type ChartFilterType = "skill" | "primaryGoal" | "goal";
export type ChartFilter = { type: ChartFilterType; key: string; label: string };

type ChartType = "pie" | "bar";
const STORAGE_KEY = "cl-chart-type";

// Categorical palette — led by the brand blue + violet, then spread across the
// hue wheel so adjacent bars/slices stay clearly distinguishable (the theme's
// --chart-* tokens are all blue/violet, which read as "the same colour" with
// many categories). Wraps for charts with more series than colours.
const PALETTE = [
  "#2563eb", // brand blue
  "#7c3aed", // brand violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#6366f1", // indigo
  "#ef4444", // red
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f97316", // orange
  "#0ea5e9", // sky
];

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

// Strip the blue focus ring browsers paint on the clicked SVG bar/slice.
const NO_FOCUS_RING =
  "[&_svg]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-bar-rectangle]:outline-none [&_.recharts-sector]:outline-none [&_path:focus]:outline-none [&_*:focus]:outline-none";
const CLICKABLE = "[&_.recharts-bar-rectangle]:cursor-pointer [&_.recharts-sector]:cursor-pointer";

/** Keep the n biggest slices; fold the rest into a single "Other" slice so a
 * chart with many categories stays legible. */
function topN(slices: Slice[], n: number): Slice[] {
  if (slices.length <= n) return slices;
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((sum, s) => sum + s.value, 0);
  return rest > 0 ? [...head, { key: "__other", label: "Other", value: rest }] : head;
}

// recharts hands click payloads back in a few shapes; pull out our {key,label}.
type RcEntry = { key?: string; label?: string; payload?: { key?: string; label?: string } };
function segmentOf(entry: RcEntry): { key: string; label: string } | null {
  const p = entry?.payload ?? entry;
  if (!p || typeof p.key !== "string" || p.key === "__other" || typeof p.label !== "string") {
    return null;
  }
  return { key: p.key, label: p.label };
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

function DistributionChart({
  data,
  type,
  activeKey,
  onSegment,
}: {
  data: Slice[];
  type: ChartType;
  activeKey?: string;
  onSegment?: (key: string, label: string) => void;
}) {
  const slices = topN(data, 8);
  const dim = (key: string) => (activeKey && activeKey !== key ? 0.3 : 1);
  // recharts types Bar/Pie onClick with their own event shapes; we read the
  // datum defensively in segmentOf, so cast to satisfy both call sites.
  const handle = (
    onSegment
      ? (entry: RcEntry) => {
          const seg = segmentOf(entry);
          if (seg) onSegment(seg.key, seg.label);
        }
      : undefined
  ) as never;
  const wrapperClass = cn(NO_FOCUS_RING, onSegment && CLICKABLE);

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={300} className={wrapperClass}>
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
          <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} activeBar={false} onClick={handle}>
            {slices.map((s, i) => (
              <Cell key={s.key} fill={PALETTE[i % PALETTE.length]} fillOpacity={dim(s.key)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300} className={wrapperClass}>
      <PieChart>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Pie
          data={slices}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="45%"
          outerRadius={80}
          innerRadius={42}
          paddingAngle={2}
          stroke="var(--background)"
          onClick={handle}
        >
          {slices.map((s, i) => (
            <Cell key={s.key} fill={PALETTE[i % PALETTE.length]} fillOpacity={dim(s.key)} />
          ))}
        </Pie>
        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DistributionCard({
  title,
  data,
  type,
  filterType,
  active,
  onSelect,
  emptyMessage,
}: {
  title: string;
  data: Slice[];
  type: ChartType;
  filterType: ChartFilterType;
  active: ChartFilter | null;
  onSelect?: (f: ChartFilter) => void;
  emptyMessage: string;
}) {
  const activeKey = active && active.type === filterType ? active.key : undefined;
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {data.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <DistributionChart
            data={data}
            type={type}
            activeKey={activeKey}
            onSegment={onSelect ? (key, label) => onSelect({ type: filterType, key, label }) : undefined}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Skill self-assessment: a radar ("shape" view) by default, or — when the user
// picks Bar — one distinctly-coloured bar per dimension on the 1–5 scale.
function AssessmentChart({ data, type, name }: { data: AssessmentDatum[]; type: ChartType; name: string }) {
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
          <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="average" name={name} radius={[4, 4, 0, 0]} activeBar={false}>
            {data.map((d, i) => (
              <Cell key={d.key} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
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
        <Radar name={name} dataKey="average" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.45} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function AssessmentCard({ data, type, self }: { data: AssessmentDatum[]; type: ChartType; self: boolean }) {
  const hasData = data.some((a) => a.responses > 0);
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">
          Skill self-assessment{" "}
          <span className="text-muted-foreground text-xs font-normal">
            ({self ? "you" : "college avg"}, 1–5)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {!hasData ? (
          <EmptyState
            message={
              self
                ? "Complete the self-assessment step to see your ratings."
                : "No self-assessment responses yet."
            }
          />
        ) : (
          <AssessmentChart data={data} type={type} name={self ? "My rating" : "Average rating"} />
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsView({
  data,
  mode,
  active = null,
  onSelect,
}: {
  data: CollegeAnalytics;
  mode: "aggregate" | "self";
  /** Currently-applied chart filter (drives active-segment dimming). */
  active?: ChartFilter | null;
  /** When set, the distribution charts become clickable filters. */
  onSelect?: (f: ChartFilter) => void;
}) {
  const self = mode === "self";

  // Pie/bar is the user's choice (preview-requirements), remembered across
  // visits. Start as "pie" on both server and client to avoid a hydration
  // mismatch, then adopt the saved preference after mount.
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ChartTypeToggle value={chartType} onChange={updateChartType} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DistributionCard
          title="Skills"
          data={data.skills}
          type={chartType}
          filterType="skill"
          active={active}
          onSelect={onSelect}
          emptyMessage={self ? "You haven't added any skills yet." : "No skills recorded yet."}
        />
        <DistributionCard
          title="Primary career goal"
          data={data.primaryGoals}
          type={chartType}
          filterType="primaryGoal"
          active={active}
          onSelect={onSelect}
          emptyMessage={self ? "No primary goal selected yet." : "No primary goals recorded yet."}
        />
        <DistributionCard
          title="Career goals (all)"
          data={data.allGoals}
          type={chartType}
          filterType="goal"
          active={active}
          onSelect={onSelect}
          emptyMessage={self ? "No career goals selected yet." : "No career goals recorded yet."}
        />
        <AssessmentCard data={data.assessment} type={chartType} self={self} />
      </div>
    </div>
  );
}
