"use client";

// FR-4: which chapters drag this subject down — and, on the improvement view, is
// retaking actually working?
//
// Three things this fixes from the first pass:
//   - unattempted chapters are no longer filtered out. The RPC returns them with a
//     null score because they are the coverage gap; dropping them hid the easiest
//     points on the board. They render as a labelled "not assessed" row, never 0%.
//   - below-pass bars carry an icon and the words "below pass", so status is not
//     communicated by colour alone.
//   - first_pct has been coming back from the RPC since migration 147 and nothing
//     drew it. The improvement view is a floating range bar from the first attempt
//     to the best — the "momentum nudge" FR-8 asked for, with no new query.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TriangleAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AXIS_TICK, BRAND, GRID_STROKE, HOVER_CURSOR, STATUS, TOOLTIP_STYLE } from "@/lib/chart-palette";
import type { ChapterScore } from "@/lib/student-performance-query";
import { EmptyState, Legend, LegendItem, ScrollBox, pct, pctLabel } from "./shared";

export type ChapterView = "best" | "improvement";

const below = (c: ChapterScore) => c.best_pct != null && c.best_pct < c.pass_pct;

/** The guide line: the mark most of these chapters use (they can differ). */
function typicalMark(chapters: ChapterScore[]) {
  const counts = new Map<number, number>();
  for (const c of chapters) counts.set(c.pass_pct, (counts.get(c.pass_pct) ?? 0) + 1);
  if (counts.size === 0) return { mark: null as number | null, mixed: false };
  const mark = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return { mark, mixed: counts.size > 1 };
}

function BestBars({ rows }: { rows: ChapterScore[] }) {
  const { mark, mixed } = typicalMark(rows);
  const anyBelow = rows.some(below);
  return (
    <>
      <ScrollBox>
        <div className="min-w-[460px]">
          <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 38)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 108, bottom: 4, left: 8 }}>
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
              <YAxis
                type="category"
                dataKey="chapter_name"
                width={132}
                tick={{ ...AXIS_TICK, fontSize: 10.5 }}
              />
              <Tooltip
                cursor={HOVER_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, _n, item) => [
                  `${pctLabel(v)} (pass ${item?.payload?.pass_pct}%)`,
                  "Best",
                ]}
              />
              {mark != null && (
                <ReferenceLine x={mark} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
              )}
              <Bar dataKey="best_pct" barSize={17} radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="best_pct"
                  position="right"
                  className="fill-foreground text-[11px] font-medium"
                  formatter={(v: unknown) => (v == null ? "not assessed" : pctLabel(v))}
                />
                {rows.map((c) => (
                  <Cell key={c.chapter_id} fill={below(c) ? STATUS.weak : BRAND} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ScrollBox>
      <Legend>
        <LegendItem colour={BRAND} label="At or above pass" />
        {anyBelow && (
          <LegendItem
            colour={STATUS.weak}
            label="Below pass"
            icon={<TriangleAlert className="size-3" style={{ color: STATUS.weak }} />}
          />
        )}
        {mark != null && (
          <LegendItem
            colour="var(--muted-foreground)"
            label={mixed ? `Typical pass mark (${mark}%) — these chapters vary` : `Pass mark (${mark}%)`}
            line
          />
        )}
      </Legend>
    </>
  );
}

/** First attempt → best, as a floating range bar. A transparent base carries the
 *  bar out to the first score; the solid segment is the gain. */
function ImprovementBars({ rows }: { rows: ChapterScore[] }) {
  const withTwo = rows.filter((c) => c.first_pct != null && c.best_pct != null);
  if (withTwo.length === 0)
    return (
      <EmptyState message="Your improvement shows here once you've retaken a chapter — it compares your first attempt with your best." />
    );

  const data = [...withTwo]
    .map((c) => ({
      ...c,
      base: c.first_pct ?? 0,
      gain: Math.max(0, (c.best_pct ?? 0) - (c.first_pct ?? 0)),
    }))
    .sort((a, b) => b.gain - a.gain);
  const gains = data.map((d) => d.gain);
  const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;

  return (
    <>
      <ScrollBox>
        <div className="min-w-[460px]">
          <ResponsiveContainer width="100%" height={Math.max(140, data.length * 38)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 104, bottom: 4, left: 8 }}>
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
              <YAxis
                type="category"
                dataKey="chapter_name"
                width={132}
                tick={{ ...AXIS_TICK, fontSize: 10.5 }}
              />
              <Tooltip
                cursor={HOVER_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                formatter={(_v, _n, item) => [
                  `${Math.round(item?.payload?.first_pct ?? 0)}% → ${Math.round(item?.payload?.best_pct ?? 0)}%`,
                  `${item?.payload?.attempts_used} attempts`,
                ]}
              />
              {/* invisible run-up to the first attempt */}
              <Bar dataKey="base" stackId="r" fill="transparent" barSize={11} />
              <Bar dataKey="gain" stackId="r" barSize={11} radius={4} minPointSize={3} fill={BRAND}>
                <LabelList
                  dataKey="gain"
                  position="right"
                  className="text-[11px] font-medium"
                  formatter={(v: unknown) =>
                    Number(v) > 0 ? `+${Math.round(Number(v))} pts` : "no gain yet"
                  }
                />
                {data.map((d) => (
                  <Cell key={d.chapter_id} fillOpacity={d.gain === 0 ? 0.4 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ScrollBox>
      <Legend>
        <LegendItem colour={BRAND} label="First attempt → best attempt" />
        <LegendItem
          colour="var(--cl-status-good)"
          label={`Your retakes are worth +${avgGain.toFixed(1)} points on average`}
        />
      </Legend>
    </>
  );
}

function ChapterTable({ rows }: { rows: ChapterScore[] }) {
  return (
    <ScrollBox>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chapter</TableHead>
            <TableHead className="text-right">First</TableHead>
            <TableHead className="text-right">Best</TableHead>
            <TableHead className="text-right">Pass</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.chapter_id}>
              <TableCell>{c.chapter_name}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(c.first_pct)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.best_pct == null ? "not assessed" : pct(c.best_pct)}
                {below(c) && <span className="text-muted-foreground"> · below pass</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.pass_pct}%</TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {c.attempts_used}/3
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollBox>
  );
}

export function ChapterDrilldown({
  chapters,
  view,
  table,
}: {
  chapters: ChapterScore[];
  view: ChapterView;
  table: boolean;
}) {
  if (chapters.length === 0)
    return <EmptyState message="This subject has no completed chapters in the selected range." />;
  if (table) return <ChapterTable rows={chapters} />;

  const assessed = chapters.filter((c) => c.best_pct != null);
  const pending = chapters.filter((c) => c.best_pct == null);

  if (view === "improvement") return <ImprovementBars rows={assessed} />;
  if (assessed.length === 0)
    return (
      <>
        <EmptyState message="No assessed chapters in this subject yet — the ones below are waiting for a first attempt." />
        <PendingList pending={pending} />
      </>
    );

  // weakest first: the gap is the point of this chart
  const sorted = [...assessed].sort((a, b) => (a.best_pct ?? 0) - (b.best_pct ?? 0));
  return (
    <>
      <BestBars rows={sorted} />
      <PendingList pending={pending} />
    </>
  );
}

/** Completed-but-unattempted chapters — surfaced as coverage (O-8), not as zeros.
 *  Split by whether an attempt is actually still possible: a chapter with no score
 *  in this range but all 3 attempts spent is NOT an easy point, and calling it one
 *  sends the student at a quiz the server will refuse. */
function PendingList({ pending }: { pending: ChapterScore[] }) {
  if (pending.length === 0) return null;
  const open = pending.filter((c) => c.attempts_remaining > 0);
  const spent = pending.filter((c) => c.attempts_remaining === 0);
  return (
    <div className="border-border/70 mt-3 space-y-2 rounded-md border border-dashed p-3">
      {open.length > 0 && (
        <div>
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">Not assessed yet</span> — {open.length}{" "}
            chapter{open.length === 1 ? "" : "s"} with no attempt. These have no score rather than 0%,
            and they&apos;re the easiest points available:
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {open.map((c) => (
              <li key={c.chapter_id} className="text-muted-foreground text-xs">
                {c.chapter_name}
                <span className="text-muted-foreground/70">
                  {" "}
                  · {c.attempts_remaining} attempt{c.attempts_remaining === 1 ? "" : "s"} available
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {spent.length > 0 && (
        <p className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">No score in this range</span> — {spent.length}{" "}
          chapter{spent.length === 1 ? "" : "s"} ({spent.map((c) => c.chapter_name).join(", ")}){" "}
          {spent.length === 1 ? "has" : "have"} used all 3 attempts, just not inside the selected
          dates. Widen the range to see those scores; they can&apos;t be retaken.
        </p>
      )}
    </div>
  );
}
