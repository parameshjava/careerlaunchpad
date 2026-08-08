"use client";

/**
 * The period control the whole reports page shares, and the query strings built
 * from it.
 *
 * Owned ONCE, by the workspace, and passed into whichever report is showing.
 * It used to live inside each report, which meant switching from Exams to
 * Assessments silently reset the window back to 12 months — the reader's period
 * quietly stopped being the period on screen.
 *
 * Trailing windows rather than an "academic year": no field records academic-year
 * boundaries, so inferring them would be a guess (same reasoning as #73's range
 * filter, kept identical so the views feel the same).
 */
import { useCallback, useMemo, useState } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { RefSelect } from "@/components/ui/ref-select";

const RANGES = [
  { value: "6m", label: "Last 6 months", months: 6 },
  { value: "12m", label: "Last 12 months", months: 12 },
  { value: "24m", label: "Last 2 years", months: 24 },
  { value: "all", label: "All time", months: null },
  { value: "custom", label: "Custom range…", months: null },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return iso(d);
}

/** "Mar 26" — the x-axis label for a monthly trend point. */
export const monthLabel = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

type Window = { from: string | null; to: string | null };

function resolve(range: string, from: string, to: string): Window {
  if (range === "custom") return { from: from || null, to: to || null };
  const months = RANGES.find((r) => r.value === range)?.months ?? null;
  return { from: months == null ? null : monthsAgo(months), to: null };
}

/**
 * The window of the same length immediately before this one, for "vs previous
 * period". Null for All time and for an open-ended custom range: there is no
 * defined "before" to compare against, and inventing one would be a fabricated
 * comparison rather than a missing one.
 */
function previous(w: Window): Window | null {
  if (!w.from) return null;
  const start = new Date(w.from);
  const end = w.to ? new Date(w.to) : new Date();
  const span = end.getTime() - start.getTime();
  if (span <= 0) return null;
  return { from: iso(new Date(start.getTime() - span)), to: w.from };
}

function build(w: Window, college?: string | null, summaryOnly = false): string {
  const p = new URLSearchParams();
  if (w.from) p.set("from", w.from);
  if (w.to) p.set("to", w.to);
  if (college) p.set("college", college);
  if (summaryOnly) p.set("summary", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useReportRange(college?: string | null) {
  const [range, setRange] = useState<string>("12m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const current = useMemo(() => resolve(range, from, to), [range, from, to]);
  const prior = useMemo(() => previous(current), [current]);

  // Stable per (window, college) so a report can use it as its fetch effect's
  // only dependency — it re-reads exactly when the window changes.
  const qs = useCallback(() => build(current, college), [current, college]);
  const priorQs = useCallback(
    () => (prior ? build(prior, college, true) : null),
    [prior, college],
  );

  const label =
    range === "custom"
      ? from || to
        ? `${from || "start"} → ${to || "today"}`
        : "Custom range"
      : (RANGES.find((r) => r.value === range)?.label ?? "");

  return { range, setRange, from, setFrom, to, setTo, qs, priorQs, label, custom: range === "custom" };
}

export type ReportRange = ReturnType<typeof useReportRange>;

/** The period picker itself — rendered in the sticky bar, once per page. */
export function ReportRangeFields({ id, state }: { id: string; state: ReportRange }) {
  const { range, setRange, from, setFrom, to, setTo } = state;
  return (
    <>
      <div className="grid min-w-0 gap-1.5">
        {/* sr-only below sm: the sticky bar is 154px on a phone already, and the
            trigger reads "Last 12 months" on its own. Still a real label for
            screen readers rather than a removed one. */}
        <Label htmlFor={`${id}-range`} className="sr-only text-xs sm:not-sr-only">
          Period
        </Label>
        <RefSelect
          id={`${id}-range`}
          value={range}
          onChange={setRange}
          className="w-full min-w-0 sm:w-44"
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>
      {range === "custom" && (
        // The shared DatePicker, not <input type="date">: the native control
        // renders the browser's own calendar and its own locale order
        // (dd/mm/yyyy here, mm/dd elsewhere), which is exactly the inconsistency
        // docs/STYLE_GUIDE.md → "Dates & times" rules out. Both bounds are
        // clearable, since "everything up to X" and "everything since X" are
        // both legitimate windows.
        <>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${id}-from`} className="text-xs">From</Label>
            <DatePicker
              id={`${id}-from`}
              value={from}
              onChange={setFrom}
              placeholder="Start date"
              clearable
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${id}-to`} className="text-xs">To</Label>
            <DatePicker
              id={`${id}-to`}
              value={to}
              onChange={setTo}
              placeholder="End date"
              clearable
            />
          </div>
        </>
      )}
    </>
  );
}
