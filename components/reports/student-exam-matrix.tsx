"use client";

/**
 * The students × exams matrix — one row per student, one column per sitting, the
 * percentage in the cell. A spreadsheet, deliberately: this is the view that
 * answers "who is struggling, and in which exam" at a glance, and no chart does
 * that for 300 students at once.
 *
 * Built from the flat (student, sitting) pairs the RPC returns, because the
 * percentage depends on each exam's own total marks and cannot be recomputed in
 * the browser from marks alone (migration 179).
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
import type { StudentExamRow, ExamRow } from "@/lib/exam-report-query";

type SortKey = "name" | "roll" | "avg" | "sat" | `s:${string}`;

export function StudentExamMatrix({
  rows,
  exams,
  showCollege = false,
}: {
  rows: StudentExamRow[];
  /** Column order comes from the exam list, so a sitting nobody sat still gets a
   *  column — "nobody turned up" is a finding, not an absence. */
  exams: ExamRow[];
  showCollege?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("avg");
  const [asc, setAsc] = useState(true);

  // Pivot: one entry per student, with a percentage per session.
  const students = useMemo(() => {
    const byStudent = new Map<
      string,
      { id: string; name: string; roll: string | null; college: string | null; pcts: Map<string, number> }
    >();
    for (const r of rows) {
      const s = byStudent.get(r.student_id) ?? {
        id: r.student_id,
        name: r.student_name ?? "Unnamed",
        roll: r.roll_number,
        college: r.college_name,
        pcts: new Map<string, number>(),
      };
      if (r.pct != null) s.pcts.set(r.session_id, r.pct);
      byStudent.set(r.student_id, s);
    }
    return [...byStudent.values()].map((s) => {
      const vals = [...s.pcts.values()];
      return {
        ...s,
        // The mean of PERCENTAGES, so a 20-mark quiz counts as much as a
        // 100-mark mock. A marks-weighted mean would let one long exam decide a
        // student's whole average, which is not what "how are they doing" means.
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
        sat: vals.length,
      };
    });
  }, [rows]);

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
      return s.pcts.get(sort.slice(2)) ?? null;
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
      ...exams.map((e) => `${e.title}${e.label ? ` (${e.label})` : ""}${e.held_on ? ` ${e.held_on}` : ""}`),
      "Exams sat",
      "Average %",
    ];
    const body = filtered.map((s) => [
      s.name,
      s.roll ?? "",
      ...(showCollege ? [s.college ?? ""] : []),
      ...exams.map((e) => {
        const v = s.pcts.get(e.session_id);
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
    a.download = `exam-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (students.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No students have sat an exam in this period.
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
            {filtered.length} of {students.length} students · {exams.length} exam
            {exams.length === 1 ? "" : "s"}
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
              {exams.map((e) => (
                <Th key={e.session_id} sortKey={`s:${e.session_id}`} sort={sort} asc={asc} onSort={toggle}
                    className="min-w-28">
                  <span className="block max-w-40 truncate" title={`${e.title}${e.label ? ` — ${e.label}` : ""}`}>
                    {e.title}
                  </span>
                  <span className="text-muted-foreground block text-[0.65rem] font-normal">
                    {e.held_on ?? "—"}
                    {e.total_marks ? ` · ${e.total_marks} marks` : ""}
                  </span>
                </Th>
              ))}
              <Th sortKey="sat" sort={sort} asc={asc} onSort={toggle}>Sat</Th>
              <Th sortKey="avg" sort={sort} asc={asc} onSort={toggle}>Average</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-muted/40 border-t">
                <td className="bg-background sticky left-0 z-10 px-3 py-2 font-medium whitespace-nowrap">
                  <span className="block max-w-52 truncate" title={s.name}>{s.name}</span>
                  {showCollege && s.college && (
                    <span className="text-muted-foreground block max-w-52 truncate text-[0.65rem]">
                      {s.college}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">{s.roll ?? "—"}</td>
                {exams.map((e) => <Cell key={e.session_id} value={s.pcts.get(e.session_id)} />)}
                <td className="text-muted-foreground px-3 py-2 text-center tabular-nums">{s.sat}</td>
                <Cell value={s.avg ?? undefined} bold />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        A blank cell means the student didn&rsquo;t sit that exam — it is never counted as 0%.
        <b> Average</b> is the mean of their exam percentages, so a short quiz counts the same as
        a long mock. There is no pass mark on an exam anywhere in the platform, so no line is
        drawn — the shading is a gradient, not a verdict.
      </p>
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
