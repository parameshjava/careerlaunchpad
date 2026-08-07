"use client";

/**
 * The period control both reports share, and the query string they build from it.
 *
 * Shared rather than copied because the two reports sit behind tabs on one page:
 * if their windows ever drifted apart, switching tabs would silently change the
 * period under the reader, and two views of "the same cohort" would not be
 * comparable.
 *
 * Trailing windows rather than an "academic year": no field records academic-year
 * boundaries, so inferring them would be a guess (same reasoning as #73's range
 * filter, kept identical so the views feel the same).
 */
import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefSelect } from "@/components/ui/ref-select";

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

/** "Mar 26" — the x-axis label for a monthly trend point. */
export const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

export function useReportRange(college?: string | null) {
  const [range, setRange] = useState<string>("12m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Stable per (range, from, to, college) so it can be a fetch effect's only
  // dependency — the report re-reads exactly when the window changes.
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

  return { range, setRange, from, setFrom, to, setTo, qs };
}

export type ReportRange = ReturnType<typeof useReportRange>;

export function ReportRangeFields({
  id,
  state,
  loading,
}: {
  /** Prefixes the field ids, so two mounted reports keep distinct labels. */
  id: string;
  state: ReportRange;
  loading?: boolean;
}) {
  const { range, setRange, from, setFrom, to, setTo } = state;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${id}-range`}>Period</Label>
        <RefSelect
          id={`${id}-range`}
          value={range}
          onChange={setRange}
          className="w-full min-w-0 sm:w-48"
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>
      {range === "custom" && (
        <>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input id={`${id}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${id}-to`}>To</Label>
            <Input id={`${id}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </>
      )}
      {loading && (
        <Loader2 className="text-muted-foreground mb-2 size-4 animate-spin" aria-label="Loading" />
      )}
    </div>
  );
}
