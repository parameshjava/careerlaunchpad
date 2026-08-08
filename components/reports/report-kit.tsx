"use client";

/**
 * The pieces both reports share: the fetch, and the headline tile.
 *
 * Each report reads ONE endpoint per window (see the route headers) so two views
 * can never disagree about the period they are showing. On top of that it reads
 * the PREVIOUS window's tiles only (`?summary=1`), because "41%" answers nothing
 * on its own — "41%, up 3 points on the previous 12 months" is the sentence a
 * staff member can act on. That second read is deliberately the cheap one.
 *
 * Both reads are cached (lib/report-cache.ts) and served stale-while-revalidate:
 * a revisit paints the last copy at once and swaps in the fresh read when it
 * lands. Anything shown from the cache is LABELLED as saved, with its age, until
 * the refresh completes — a stale number presented as current is worse than a
 * spinner.
 */
import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { readReportCache, reportCacheKey, writeReportCache } from "@/lib/report-cache";
import type { ReportRange } from "./report-range";

export function useReportData<T>(endpoint: string, range: ReportRange, userId?: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [prior, setPrior] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** When the copy on screen was saved, or null once it is fresh. */
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const qs = range.qs();
  const priorQs = range.priorQs();

  useEffect(() => {
    let cancelled = false;
    const key = reportCacheKey(userId ?? null, endpoint, qs);
    const hit = readReportCache<T>(key);
    if (hit) {
      // Paint the saved copy first, then revalidate. No spinner over content that
      // is already on screen — the bar says "saved N min ago · refreshing".
      setData(hit.data);
      setSavedAt(hit.at);
      setError("");
    } else {
      setSavedAt(null);
    }
    setLoading(true);
    fetch(`${endpoint}${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // The RPCs RAISE for an unauthorized caller rather than returning empty,
        // so an error here is a real problem and must not read as "no data".
        setError(d.error ? String(d.error) : "");
        if (d.error) {
          // A refused read must not leave a saved copy on screen pretending to be
          // this window's answer.
          setData(null);
          setSavedAt(null);
        } else {
          setData(d as T);
          setSavedAt(null);
          writeReportCache(key, d as T);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [endpoint, qs, userId]);

  useEffect(() => {
    if (!priorQs) {
      setPrior(null);
      return;
    }
    let cancelled = false;
    const key = reportCacheKey(userId ?? null, endpoint, priorQs);
    const hit = readReportCache<{ summary?: Record<string, unknown> }>(key);
    if (hit) setPrior(hit.data?.summary ?? null);
    fetch(`${endpoint}${priorQs}`)
      .then((r) => r.json())
      // A failed comparison must never surface as an error or a zero — it just
      // means no arrow. The main read is what the page is about.
      .then((d) => {
        if (cancelled) return;
        if (d?.error) {
          setPrior(null);
          return;
        }
        setPrior(d.summary ?? null);
        writeReportCache(key, d);
      })
      .catch(() => !cancelled && setPrior(null));
    return () => { cancelled = true; };
  }, [endpoint, priorQs, userId]);

  return { data, prior, loading, error, savedAt };
}

/** One headline number. `delta` is in percentage POINTS, not percent. */
export function Kpi({
  label,
  value,
  hint,
  now,
  then,
  compareLabel,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Current and previous values of the same measure, both as percentages. */
  now?: number | null;
  then?: number | null;
  compareLabel?: string;
}) {
  const delta = now != null && then != null ? Math.round(now - then) : null;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold">{value}</span>
          {delta != null && delta !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                delta > 0 ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {delta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {delta > 0 ? "+" : ""}
              {delta} pts
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">
          {hint}
          {delta != null && compareLabel && (
            <>
              {hint ? " · " : ""}
              {delta === 0 ? "level with" : "vs"} {compareLabel}
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

/** "How these numbers are calculated" — the methodology, out of the way but never gone. */
export function Methodology({ children }: { children: React.ReactNode }) {
  return (
    <details className="bg-muted/30 rounded-lg border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        How these numbers are calculated
      </summary>
      <div className="text-muted-foreground mt-2 space-y-2 text-xs">{children}</div>
    </details>
  );
}
