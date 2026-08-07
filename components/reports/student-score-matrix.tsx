"use client";

/**
 * A students × columns matrix — one row per student, one column per thing, a
 * percentage in the cell. A spreadsheet, deliberately: this is the view that
 * answers "who is struggling, and where" at a glance, and no chart does that for
 * 300 students at once.
 *
 * GENERIC over what the columns ARE, so the exam report (columns = sittings) and
 * the assessment report (columns = subjects) share one implementation. Both feed
 * it percentages computed in the database, because in each case the percentage
 * depends on a denominator the browser doesn't have — an exam's total marks
 * (179), or the best-attempt rule for a chapter (180).
 *
 * Spreadsheet affordances that actually matter here:
 *   • sort by any column, including any single exam — "who did worst in the
 *     January mock" is one click, not a re-query;
 *   • the student column is STICKY, because a row is meaningless once its name
 *     has scrolled off;
 *   • a blank cell means "did not sit it", rendered as — and never as 0%, which
 *     would drag every average and libel the student;
 *   • CSV download, so the numbers can go into a real spreadsheet for anything
 *     this page deliberately doesn't do.
 */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sequentialStep } from "@/lib/chart-palette";

type SortKey = "name" | "roll" | "avg" | "sat" | `s:${string}`;

/** One matrix column. `sublabel` carries the date / marks / chapter count. */
export type MatrixColumn = { key: string; label: string; sublabel?: string | null };

/** One student's row, already reduced to a percentage per column key. */
export type MatrixRow = {
  studentId: string;
  name: string;
  roll: string | null;
  college: string | null;
  /** Column key -> percentage. A missing key means "no result", never 0. */
  values: Record<string, number>;
};

export function StudentScoreMatrix({
  rows,
  columns,
  showCollege = false,
  countLabel = "exams",
  satLabel = "Sat",
  footnote,
}: {
  rows: MatrixRow[];
  /** Column order is the caller's, so a column with no results still appears —
   *  "nobody sat it" is a finding, not an absence. */
  columns: MatrixColumn[];
  showCollege?: boolean;
  countLabel?: string;
  satLabel?: string;
  footnote?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("avg");
  const [asc, setAsc] = useState(true);

  const students = useMemo(
    () =>
      rows.map((r) => {
        const vals = columns.map((c) => r.values[c.key]).filter((v): v is number => v != null);
        return {
          ...r,
          // The mean of PERCENTAGES, so a 20-mark quiz counts as much as a
          // 100-mark mock. A marks-weighted mean would let one long exam decide a
          // student's whole average, which is not what "how are they doing" means.
          avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
          sat: vals.length,
        };
      }),
    [rows, columns],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? students.filter((s) => `${s.name} ${s.roll ?? ""}`.toLowerCase().includes(q))
      : students;

    const val = (s: (typeof students)[number]): string | number | null => {
      if (sort === "name") return s.name.toLowerCase();
      if (sort === "roll") return s.roll?.toLowerCase() ?? null;
      if (sort === "avg") return s.avg;
      if (sort === "sat") return s.sat;
      return s.values[sort.slice(2)] ?? null;
    };

    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      // Nulls last in BOTH directions: "didn't sit it" is not a low score, and
      // sorting it to the top of an ascending column would read as one.
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y);
      return asc ? c : -c;
    });
  }, [students, query, sort, asc]);

  function toggle(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      // ASCENDING on a new column, whichever it is. Names read naturally A→Z,
      // and for a score column ascending puts the LOWEST first — which is who
      // needs help, and the reason a staff member opens this table. (A previous
      // version keyed this off the column type and accidentally gave scores
      // highest-first, the opposite of what the comment claimed.)
      setAsc(true);
    }
  }

  function downloadCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Student",
      "Roll number",
      ...(showCollege ? ["College"] : []),
      ...columns.map((c) => `${c.label}${c.sublabel ? ` (${c.sublabel})` : ""}`),
      `${countLabel} counted`,
      "Average %",
    ];
    const body = filtered.map((s) => [
      s.name,
      s.roll ?? "",
      ...(showCollege ? [s.college ?? ""] : []),
      ...columns.map((c) => {
        const v = s.values[c.key];
        return v == null ? "" : v.toFixed(2);
      }),
      s.sat,
      s.avg == null ? "" : s.avg.toFixed(2),
    ]);
    const csv = [header, ...body].map((r) => r.map(esc).join(",")).join("\r\n");
    // ﻿: Excel reads a CSV as the system codepage without a BOM, which
    // mangles every non-ASCII student name.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${countLabel}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (students.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No students have a result in this period.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or roll number…"
          className="w-full sm:w-72"
          aria-label="Search students"
        />
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span>
            {filtered.length} of {students.length} students · {columns.length} {countLabel}
          </span>
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
      </div>

      {/* The table scrolls inside its own box — the PAGE must never scroll
          sideways (CLAUDE.md), and a 20-exam matrix is far wider than a phone. */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <Th sticky sortKey="name" sort={sort} asc={asc} onSort={toggle} className="min-w-44">
                Student
              </Th>
              <Th sortKey="roll" sort={sort} asc={asc} onSort={toggle}>Roll no.</Th>
              {columns.map((c) => (
                <Th key={c.key} sortKey={`s:${c.key}`} sort={sort} asc={asc} onSort={toggle}
                    className="min-w-28">
                  <span className="block max-w-40 truncate" title={c.label}>{c.label}</span>
                  {c.sublabel && (
                    <span className="text-muted-foreground block text-[0.65rem] font-normal">
                      {c.sublabel}
                    </span>
                  )}
                </Th>
              ))}
              <Th sortKey="sat" sort={sort} asc={asc} onSort={toggle}>{satLabel}</Th>
              <Th sortKey="avg" sort={sort} asc={asc} onSort={toggle}>Average</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.studentId} className="hover:bg-muted/40 border-t">
                <td className="bg-background sticky left-0 z-10 px-3 py-2 font-medium whitespace-nowrap">
                  <span className="block max-w-52 truncate" title={s.name}>{s.name}</span>
                  {showCollege && s.college && (
                    <span className="text-muted-foreground block max-w-52 truncate text-[0.65rem]">
                      {s.college}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{s.roll ?? "—"}</td>
                {columns.map((c) => <Cell key={c.key} value={s.values[c.key]} />)}
                <td className="text-muted-foreground px-3 py-2 text-center tabular-nums">{s.sat}</td>
                <Cell value={s.avg ?? undefined} bold />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {footnote && <div className="text-muted-foreground text-xs">{footnote}</div>}
    </div>
  );
}

function Th({
  children, sortKey, sort, asc, onSort, sticky = false, className,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  sort: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  sticky?: boolean;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (asc ? "ascending" : "descending") : "none"}
      className={cn(
        "px-3 py-2 text-left align-bottom font-semibold",
        sticky && "bg-muted/60 sticky left-0 z-20",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="hover:text-primary flex items-center gap-1 text-left"
      >
        <span className="min-w-0">{children}</span>
        {active &&
          (asc ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)}
      </button>
    </th>
  );
}

/** A percentage cell, shaded by the shared sequential ramp. */
function Cell({ value, bold = false }: { value?: number | null; bold?: boolean }) {
  if (value == null) {
    return <td className="text-muted-foreground/50 px-3 py-2 text-center">—</td>;
  }
  const { fill, ink } = sequentialStep(value);
  return (
    <td className="px-1 py-1 text-center">
      <span
        className={cn("inline-block w-full rounded px-2 py-1 tabular-nums", bold && "font-semibold")}
        style={{ background: fill, color: ink }}
      >
        {Math.round(value)}%
      </span>
    </td>
  );
}
