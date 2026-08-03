"use client";

// FR-2: am I improving? One y-axis, always a percent.
//
// The per-subject overlay is capped at the palette's validated slot count, and on
// a phone it isn't an overlay at all: five lines in a 340px box can't be traced
// back to a legend, so under 640px each subject gets its own small multiple. The
// desktop chart is the compromise here, not the mobile one.
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AXIS_TICK, BRAND, CATEGORICAL_MAX, GRID_STROKE, TOOLTIP_STYLE, categorical } from "@/lib/chart-palette";
import type { TrendPoint } from "@/lib/student-performance-query";
import { EmptyState, Legend, LegendItem, ScrollBox, monthLabel, pct, pctLabel, useMediaQuery } from "./shared";

type Series = { id: string; name: string; colour: string };

function months(points: TrendPoint[]) {
  return [...new Set(points.map((p) => p.month))].sort();
}

/** Subjects in first-seen order, so a subject keeps its colour as the range
 *  changes. Colour follows the entity, never its rank. */
function subjectSeries(points: TrendPoint[]): Series[] {
  const seen = new Map<string, string>();
  for (const p of points) {
    if (p.subject_id && !seen.has(p.subject_id)) seen.set(p.subject_id, p.subject_name ?? "—");
  }
  return [...seen.entries()]
    .slice(0, CATEGORICAL_MAX)
    .map(([id, name], i) => ({ id, name, colour: categorical(i) }));
}

/** Subjects beyond the palette's validated slot count. The chart cannot colour
 *  them (cycling hues would make two subjects look identical), so they are named
 *  explicitly rather than silently vanishing — and the table view keeps them all,
 *  since a table has no colour budget. */
function allSeries(points: TrendPoint[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const p of points) {
    if (p.subject_id && !seen.has(p.subject_id)) seen.set(p.subject_id, p.subject_name ?? "—");
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

function overflowSeries(points: TrendPoint[]): string[] {
  const seen = new Map<string, string>();
  for (const p of points) {
    if (p.subject_id && !seen.has(p.subject_id)) seen.set(p.subject_id, p.subject_name ?? "—");
  }
  return [...seen.values()].slice(CATEGORICAL_MAX);
}

function rowsFor(points: TrendPoint[], series: { id: string }[]) {
  const index = new Map(points.map((p) => [`${p.month}|${p.subject_id ?? ""}`, Number(p.pct)]));
  return months(points).map((m) => {
    const row: Record<string, string | number | null> = { month: m, label: monthLabel(m) };
    row.overall = index.get(`${m}|`) ?? null;
    for (const s of series) row[s.id] = index.get(`${m}|${s.id}`) ?? null;
    return row;
  });
}

const AXES = (
  <>
    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
    <XAxis dataKey="label" tick={AXIS_TICK} />
    <YAxis domain={[0, 100]} width={42} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
  </>
);

function OverallLine({ rows, passLine }: { rows: Record<string, unknown>[]; passLine: number | null }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
        {AXES}
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [pctLabel(v), "Overall"]} />
        {passLine != null && (
          <ReferenceLine y={passLine} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
        )}
        {/* single series — the card title names it, so no legend */}
        <Line type="monotone" dataKey="overall" stroke={BRAND} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SubjectLines({
  rows,
  series,
  passLine,
}: {
  rows: Record<string, unknown>[];
  series: Series[];
  passLine: number | null;
}) {
  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
          {AXES}
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={pctLabel} />
          {passLine != null && (
            <ReferenceLine y={passLine} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
          )}
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.colour}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <Legend>
        {series.map((s) => (
          <LegendItem key={s.id} colour={s.colour} label={s.name} line />
        ))}
      </Legend>
    </>
  );
}

/** The phone treatment: one panel per subject, shared 0–100 scale, latest value
 *  called out. No legend needed — each panel is titled. */
function SmallMultiples({
  rows,
  series,
}: {
  rows: Record<string, string | number | null>[];
  series: Series[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {series.map((s) => {
        const values = rows.map((r) => r[s.id]).filter((v): v is number => typeof v === "number");
        const latest = values.length > 0 ? values[values.length - 1] : null;
        return (
          <div key={s.id} className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs leading-snug">{s.name}</p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: s.colour }}>
              {pct(latest)}
            </p>
            <ResponsiveContainer width="100%" height={54}>
              <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <YAxis domain={[0, 100]} hide />
                <Line
                  type="monotone"
                  dataKey={s.id}
                  stroke={s.colour}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function TrendTable({
  rows,
  series,
}: {
  rows: Record<string, string | number | null>[];
  series: { id: string; name: string }[];
}) {
  return (
    <ScrollBox>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Overall</TableHead>
            {series.map((s) => (
              <TableHead key={s.id} className="text-right">
                {s.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={String(r.month)}>
              <TableCell>{String(r.label)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.overall as number | null)}</TableCell>
              {series.map((s) => (
                <TableCell key={s.id} className="text-right tabular-nums">
                  {pct(r[s.id] as number | null)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollBox>
  );
}

export function PerformanceTrend({
  points,
  bySubject,
  table,
  passLine,
}: {
  points: TrendPoint[];
  bySubject: boolean;
  table: boolean;
  passLine: number | null;
}) {
  const wide = useMediaQuery("(min-width: 640px)");
  const series = subjectSeries(points);
  const overflow = overflowSeries(points);
  const rows = rowsFor(points, series);

  if (rows.length === 0)
    return <EmptyState message="Your score trend appears here once you've taken assessments." />;

  // The table has no colour budget, so it carries every subject including the ones
  // the chart had to leave out.
  if (table) return <TrendTable rows={rowsFor(points, allSeries(points))} series={allSeries(points)} />;
  if (!bySubject) return <OverallLine rows={rows} passLine={passLine} />;
  if (series.length === 0)
    return <EmptyState message="No per-subject scores in this range yet." />;
  // Under 640px an overlay of several lines is unreadable — facet instead.
  return (
    <>
      {wide ? (
        <SubjectLines rows={rows} series={series} passLine={passLine} />
      ) : (
        <SmallMultiples rows={rows} series={series} />
      )}
      {overflow.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Not shown here: {overflow.join(", ")} — the chart carries {CATEGORICAL_MAX} distinguishable
          colours, and reusing one would make two subjects look identical. Switch to the table view to
          see every subject.
        </p>
      )}
    </>
  );
}
