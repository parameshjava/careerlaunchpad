"use client";

// Pieces every chart in the performance view shares. Kept in one file so the
// empty-state wording, the chart/table toggle and the percent formatting can't
// drift between the trend, the bars, the drill-down and the mastery grid.
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Matches a media query without breaking hydration (always false on the server,
 *  so the mobile treatment is what renders first — mobile-first in practice). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** recharts types formatter/label values as ValueType (string|number|array), so
 *  coerce before rounding rather than narrowing the parameter to number. */
export const pctLabel = (v: unknown) => `${Math.round(Number(v))}%`;

/** A percent for display, or an em dash — never "0%" for missing data. */
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground bg-muted/40 flex min-h-[120px] items-center justify-center rounded-lg border p-4 text-center text-sm">
      {message}
    </div>
  );
}

/** Every chart ships a table view: it is the relief for the palette's
 *  sub-3:1 contrast slots, and the accessible read of the same numbers. */
export function TableToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onToggle}
      aria-pressed={table}
      title={table ? "Show the chart" : "Show the numbers as a table"}
    >
      {table ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
      <span className="sr-only">{table ? "Show chart" : "View as table"}</span>
    </Button>
  );
}

/** Wide content scrolls inside its own box so the page never scrolls sideways. */
export function ScrollBox({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

/** A legend entry. Identity is never colour-alone — this always carries text,
 *  and status entries carry an icon too. */
export function LegendItem({
  colour,
  label,
  line,
  dashed,
  icon,
}: {
  colour: string;
  label: string;
  line?: boolean;
  dashed?: boolean;
  icon?: ReactNode;
}) {
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {icon}
      <span
        aria-hidden
        className={line ? "h-[3px] w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
        style={
          dashed
            ? { border: `1px dashed ${colour}`, background: "transparent" }
            : { background: colour }
        }
      />
      {label}
    </span>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">{children}</div>;
}

/** Month bucket ("2026-06-01") -> "Jun 26". */
export const monthLabel = (m: string) =>
  new Date(m).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
