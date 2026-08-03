"use client";

// FR-8: the prescriptive half of the performance view — what to do next, ranked,
// with a route to the target.
//
// Two projections sit here on purpose:
//   - the FLOOR (migration 153): clear every below-pass chapter to its pass mark.
//     Honest but pessimistic — on a profile with 25 assessed chapters and 4 below
//     pass it moves the average about one point, which reads as "this is hopeless"
//     to a student who set a 70% target.
//   - the LADDER (migration 154): the ordered route to the target the student
//     actually set. Same rows, same arithmetic, but each rung states what it
//     assumes, so the number is auditable rather than magic.
// The floor shows always; the ladder appears once there is a target to aim at.
import Link from "next/link";
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
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AXIS_TICK, GRID_STROKE, HOVER_CURSOR, STATUS, TOOLTIP_STYLE } from "@/lib/chart-palette";
import type { LadderStep, PlanItem, PlanProjection } from "@/lib/student-performance-query";
import { EmptyState, ScrollBox, pctLabel, useMediaQuery } from "./shared";

const CATEGORY: Record<PlanItem["category"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  quick_win: { label: "Quick win", variant: "default" },
  not_attempted: { label: "Not attempted", variant: "outline" },
  needs_study: { label: "Needs study", variant: "secondary" },
  below_target: { label: "Below your target", variant: "outline" },
};

// One sentence per rung. The copy lives here, not in SQL, so the RPC stays a
// numbers API and the wording can change without a migration.
function rungCopy(step: LadderStep, target: number): { title: string; note: string } {
  switch (step.key) {
    case "today":
      return {
        title: "Where you are today",
        note: `average of your best score on ${step.chapters} assessed chapter${step.chapters === 1 ? "" : "s"}`,
      };
    case "attempt_unassessed":
      return {
        title: `Sit the ${step.chapters} chapter${step.chapters === 1 ? "" : "s"} you haven't attempted`,
        note:
          step.chapters === 0
            ? "nothing outstanding — every completed chapter has an attempt"
            : `assuming you score around your current average (${Math.round(step.assumed_pct ?? 0)}%). This closes your coverage gap; it barely moves the average, because scoring at your average can't raise it.`,
      };
    case "clear_below_pass":
      return {
        title: `Retake the ${step.chapters} chapter${step.chapters === 1 ? "" : "s"} below the pass mark`,
        note:
          step.chapters === 0
            ? "you've passed everything you've attempted"
            : `to ${target}%. This is where nearly all the lift comes from.`,
      };
    case "push_to_target":
      return {
        title: `Push ${step.chapters} more chapter${step.chapters === 1 ? "" : "s"} up`,
        note:
          step.chapters === 0
            ? "not needed — the steps above already get you there"
            : `to ${target}%, starting with the ones closest to it.`,
      };
  }
}

function Ladder({ ladder, target }: { ladder: LadderStep[]; target: number }) {
  const rungs = ladder.filter((s) => s.avg != null);
  if (rungs.length === 0) return null;
  const final = rungs[rungs.length - 1].avg ?? 0;
  const reaches = final >= target;

  // Stacked pair per rung: `carried` is what the previous rung already reached
  // (recessive), `gain` is what this rung adds (solid). Same 0–100 axis as every
  // other chart here, so there is no second scale to reconcile.
  const data = rungs.map((s, i) => {
    const prev = i === 0 ? 0 : (rungs[i - 1].avg ?? 0);
    const avg = s.avg ?? 0;
    const copy = rungCopy(s, target);
    return {
      name: copy.title,
      note: copy.note,
      carried: i === 0 ? 0 : prev,
      gain: i === 0 ? avg : Math.max(0, avg - prev),
      avg,
      delta: i === 0 ? null : Math.round((avg - prev) * 10) / 10,
    };
  });

  // On a phone the step names can't share the chart with the bars — a 210px axis
  // leaves ~130px of plot, which showed 0–30% and nothing useful. Below 640px the
  // axis is dropped and the numbered list underneath carries the labels instead.
  const wide = useMediaQuery("(min-width: 640px)");

  return (
    <div>
      <ScrollBox>
        <div className={wide ? "min-w-[520px]" : ""}>
          <ResponsiveContainer width="100%" height={data.length * (wide ? 62 : 40) + 40}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 24, right: 52, bottom: 4, left: wide ? 8 : 0 }}
            >
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={AXIS_TICK}
                tickFormatter={(v) => `${v}%`}
                orientation="top"
              />
              <YAxis
                type="category"
                dataKey="name"
                width={wide ? 210 : 0}
                tick={wide ? { ...AXIS_TICK, fontSize: 10.5 } : false}
              />
              <Tooltip
                cursor={HOVER_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                formatter={(_v, _n, item) => [`${pctLabel(item?.payload?.avg)}`, "Average"]}
                labelFormatter={(l) => String(l)}
              />
              {/* label sits inside the plot: the x-axis is on top, so a "top"
                  label collides with the tick text */}
              <ReferenceLine
                x={target}
                stroke="var(--cl-cat-3)"
                strokeDasharray="5 3"
                label={{
                  value: `target ${target}%`,
                  position: "insideBottomRight",
                  fontSize: 10,
                  fill: "var(--cl-cat-3)",
                }}
              />
              <Bar dataKey="carried" stackId="a" fill="var(--cl-cat-1)" fillOpacity={0.28} />
              <Bar dataKey="gain" stackId="a" fill="var(--cl-cat-1)" radius={[0, 4, 4, 0]} minPointSize={2}>
                <LabelList
                  dataKey="avg"
                  position="right"
                  formatter={pctLabel}
                  className="fill-foreground text-[11px] font-semibold"
                />
                {data.map((d, i) => (
                  <Cell key={i} fillOpacity={d.gain === 0 ? 0.35 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ScrollBox>

      <ol className="text-muted-foreground mt-3 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-foreground shrink-0 font-medium tabular-nums">
              {d.delta == null ? `${Math.round(d.avg)}%` : `${d.delta >= 0 ? "+" : ""}${d.delta} pts`}
            </span>
            <span>
              <span className="text-foreground">{d.name}</span> — {d.note}
            </span>
          </li>
        ))}
      </ol>

      <p className={`mt-3 text-xs font-medium ${reaches ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        {reaches ? (
          <>Those steps put you at ~{Math.round(final)}% — clear of your {target}% target. ✓</>
        ) : (
          <>
            Even with all of that you land at ~{Math.round(final)}%, {Math.round(target - final)} short of{" "}
            {target}%. You&apos;d need above-target scores, or more chapters to be marked complete.
          </>
        )}{" "}
        <span className="text-muted-foreground italic">Estimate — it assumes the scores named above.</span>
      </p>
    </div>
  );
}

function TargetForm({
  target,
  onTargetChange,
  onApply,
  onClear,
  applied,
}: {
  target: string;
  onTargetChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
  applied: number | null;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <label className="text-xs">
        <span className="text-muted-foreground mb-1 block">Target average</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder="e.g. 70"
            className="h-8 w-24"
            aria-label="Target average percent"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
      </label>
      <Button type="submit" size="sm" className="h-8">
        {applied == null ? "Show me the route" : "Update"}
      </Button>
      {applied != null && (
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClear}>
          Clear
        </Button>
      )}
    </form>
  );
}

/** The pass-mark floor — always shown, so the ladder's optimism has a counterweight. */
function Floor({ projection }: { projection: PlanProjection }) {
  const p = projection;
  if (p.current_avg == null) return null;
  if (p.chapters_to_lift === 0)
    return (
      <p className="text-muted-foreground mt-2 text-xs">
        You&apos;ve passed every assessed chapter — your average is{" "}
        <b className="text-foreground">{Math.round(p.current_avg)}%</b>.
      </p>
    );
  return (
    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
      Just scraping your <b className="text-foreground">{p.chapters_to_lift}</b> pending chapter
      {p.chapters_to_lift === 1 ? "" : "s"} past the pass mark takes you from{" "}
      <b className="text-foreground">{Math.round(p.current_avg)}%</b> to ~
      <b className="text-foreground">{Math.round(p.projected_avg ?? p.current_avg)}%</b> — the floor, not the goal.
    </p>
  );
}

function FocusList({ items, batch }: { items: PlanItem[]; batch: string }) {
  if (items.length === 0)
    return (
      <EmptyState message="Nothing outstanding — you've passed every completed chapter you've attempted. 🎉" />
    );
  return (
    <ul className="divide-y rounded-md border">
      {items.slice(0, 12).map((p) => {
        const stuck = p.attempts_remaining === 0;
        const gapToPass = p.best_pct == null ? null : Math.ceil(p.pass_pct - p.best_pct);
        return (
          <li
            key={p.chapter_id}
            className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium break-words">{p.chapter_name}</p>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={CATEGORY[p.category].variant}>{CATEGORY[p.category].label}</Badge>
                <span>{p.subject_name}</span>
                <span>
                  ·{" "}
                  {p.best_pct == null
                    ? "not attempted yet"
                    : `best ${Math.round(p.best_pct)}% (pass ${p.pass_pct}%)`}
                </span>
                {gapToPass != null && gapToPass > 0 && <span>· {gapToPass} short of passing</span>}
                <span>
                  ·{" "}
                  {stuck
                    ? "no attempts left"
                    : `${p.attempts_remaining} attempt${p.attempts_remaining === 1 ? "" : "s"} left`}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {/* Why this one is worth doing. Unactionable chapters score 0 and say
                  so rather than dangling points the student can't collect. */}
              <span className="text-right text-xs tabular-nums">
                {stuck ? (
                  <span className="text-muted-foreground">no attempts left</span>
                ) : p.points_to_target > 0 ? (
                  <>
                    <b className="block text-sm" style={{ color: "var(--cl-cat-1)" }}>
                      +{p.points_to_target.toFixed(1)}
                    </b>
                    <span className="text-muted-foreground">pts to target</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">closes a coverage gap</span>
                )}
              </span>
              {!stuck && (
                <Button size="sm" variant={p.best_pct == null ? "default" : "outline"} asChild>
                  {/* Deep link — the hub highlights and scrolls to this chapter. */}
                  <Link
                    href={`/student/quizzes?chapter=${p.chapter_id}${batch !== "all" ? `&batch=${batch}` : ""}`}
                  >
                    {p.best_pct == null ? "Start" : "Retake"}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StudyPlan({
  items,
  projection,
  ladder,
  target,
  appliedTarget,
  onTargetChange,
  onApply,
  onClear,
  batch,
}: {
  items: PlanItem[];
  projection: PlanProjection | null;
  ladder: LadderStep[];
  target: string;
  appliedTarget: number | null;
  onTargetChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
  batch: string;
}) {
  const stuckCount = items.filter((i) => i.attempts_remaining === 0).length;
  return (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-md border p-3">
        <TargetForm
          target={target}
          onTargetChange={onTargetChange}
          onApply={onApply}
          onClear={onClear}
          applied={appliedTarget}
        />
        {projection && <Floor projection={projection} />}
        {appliedTarget != null && ladder.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <Ladder ladder={ladder} target={appliedTarget} />
          </div>
        )}
      </div>

      <FocusList items={items} batch={batch} />

      {stuckCount > 0 && (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" style={{ color: STATUS.weak }} />
          {stuckCount} chapter{stuckCount === 1 ? " has" : "s have"} no attempts left, so{" "}
          {stuckCount === 1 ? "it can't" : "they can't"} raise your average. Ask your mentor about the
          class material for {stuckCount === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  );
}
