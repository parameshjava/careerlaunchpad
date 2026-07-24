"use client";

// Shared building blocks for tables — used by both the TanStack `DataTable`
// column defs and any remaining hand-built tables, so sortable headers and
// status pills look and behave the same everywhere.
//
//   • SortHeader  — the ghost-button + ArrowUpDown column header (was copy-pasted
//     across students/columns, exam-columns, roster-table, and reinvented with
//     bespoke state in CollegesManager).
//   • StatusBadge / STATUS_TONES — the one status-pill colour ramp (was the
//     `bg-*-100 text-*-700 dark:bg-*-950 dark:text-*-300` map duplicated in ~6
//     files). Pick a tone; don't hand-write the colour classes.
import type { Column } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SortHeader<TData, TValue>({
  column,
  children,
  className,
}: {
  column: Column<TData, TValue>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      className={cn("-ml-3 h-8", className)}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {children} <ArrowUpDown className="size-3.5" />
    </Button>
  );
}

// The status-pill palette. Keep it to this fixed set of semantic tones so
// statuses read consistently across the app (green = good/live, amber = pending,
// rose = error/closed, etc.).
export const STATUS_TONES = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const;

export type StatusTone = keyof typeof STATUS_TONES;

export function StatusBadge({
  tone,
  className,
  children,
}: {
  tone: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_TONES[tone], className)}>
      {children}
    </Badge>
  );
}
