"use client";

// FR-1 snapshot: four headline numbers, deliberately not charts.
//
// The tiles used to state four facts and imply no direction. The movement number
// comes from the trend buckets we already fetch — last month in range minus the
// first — so it needs nothing new from the database and the label can name both
// months, which keeps it auditable rather than a mystery delta.
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { PerfSummary, TrendPoint } from "@/lib/student-performance-query";
import { monthLabel, pct } from "./shared";

const BAND = "text-emerald-600 dark:text-emerald-400";
const WEAK_BAND = "text-rose-600 dark:text-rose-400";

/** The overall monthly series, oldest first. */
function overallSeries(trend: TrendPoint[]) {
  return trend
    .filter((p) => p.subject_id == null)
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** A 26px sparkline of the same series the trend chart plots. Not a chart in its
 *  own right — it exists to give the headline number a shape. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 132;
  const H = 26;
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - (v / 100) * (H - 8);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      className="mt-2 max-w-[132px]"
      aria-hidden
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--cl-cat-1)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill="var(--cl-cat-1)" />
    </svg>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
  small,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  small?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`mt-1 font-bold tracking-tight ${small ? "text-lg" : "text-2xl"} ${tone ?? ""}`}
        >
          {value}
        </p>
        {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

export function SnapshotTiles({
  summary,
  trend,
}: {
  summary: PerfSummary | null;
  trend: TrendPoint[];
}) {
  const series = overallSeries(trend);
  const values = series.map((p) => Number(p.pct));
  const assessed = summary?.chapters_assessed ?? 0;
  const completed = summary?.chapters_completed ?? 0;
  const coverage = completed > 0 ? (assessed / completed) * 100 : null;

  // Movement across the selected range. Needs two buckets to mean anything; with
  // one month of attempts we say so instead of inventing a zero.
  const delta = values.length >= 2 ? Math.round(values[values.length - 1] - values[0]) : null;
  const deltaLabel =
    values.length >= 2
      ? `${monthLabel(series[0].month)} → ${monthLabel(series[series.length - 1].month)}`
      : "one month of attempts so far";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Overall score" value={pct(summary?.overall_pct)}>
        <p className="text-muted-foreground mt-1 text-xs">
          {delta != null && (
            <span className={`inline-flex items-center gap-1 font-semibold ${delta >= 0 ? BAND : WEAK_BAND}`}>
              {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {delta >= 0 ? "+" : ""}
              {delta} pts
            </span>
          )}{" "}
          {deltaLabel}
        </p>
        <Sparkline values={values} />
      </Tile>

      <Tile
        label="Pass rate"
        value={pct(summary?.pass_rate_pct)}
        sub={assessed > 0 ? `${assessed} assessed chapter${assessed === 1 ? "" : "s"}` : undefined}
      />

      <Tile
        label="Coverage"
        value={`${assessed} / ${completed}`}
        sub={coverage == null ? undefined : `${Math.round(coverage)}% of completed chapters assessed`}
      >
        {coverage != null && (
          <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{ width: `${coverage}%`, background: "var(--cl-cat-1)" }}
            />
          </div>
        )}
      </Tile>

      <Tile
        label="Focus on"
        value={summary?.weakest_subject ?? "—"}
        small
        tone={WEAK_BAND}
        sub={summary?.weakest_pct == null ? undefined : `${Math.round(summary.weakest_pct)}%`}
      >
        {summary?.strongest_subject && (
          <p className={`mt-2 text-xs ${BAND}`}>
            Strongest: {summary.strongest_subject}
            {summary.strongest_pct != null && ` ${Math.round(summary.strongest_pct)}%`}
          </p>
        )}
      </Tile>
    </div>
  );
}
