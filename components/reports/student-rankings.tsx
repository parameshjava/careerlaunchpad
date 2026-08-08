"use client";

/**
 * The ranking table: 1. Paramesh 89%, 2. Rajesh 85%, … with each row expanding
 * to that student's exam-by-exam (or subject-by-subject) detail.
 *
 * It reads the SAME rows the matrix does, so the two can never disagree — a
 * ranking that contradicted the spreadsheet next to it would destroy trust in
 * both. The matrix answers "where is this cohort weak"; this answers "who is
 * where", which is the question you can't answer by scanning a 14-column grid.
 *
 * Decisions that are easy to get wrong:
 *
 *   • ties SHARE a rank, and the next rank skips (1, 2, 2, 4 — standard
 *     competition ranking). Giving two identical averages different positions
 *     would invent a difference that isn't in the data.
 *   • rank is on the average of the percentages a student actually has, so
 *     someone who attempted 2 of 14 exams can outrank someone who attempted all
 *     14. That is a real hazard of ranking averages, so the row states how many
 *     count and flags the ones below the cohort's typical coverage rather than
 *     letting the number pass unqualified.
 *   • students with NO result are listed after the ranked ones, unranked, rather
 *     than as 0% at the bottom — no result is not a bad result.
 *   • expansion is one row at a time in the DOM but many can be open at once;
 *     each detail lives in a <tr> under its student so the table keeps its
 *     semantics (an accordion of <div>s inside a <table> would not).
 */
import { useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sequentialStep } from "@/lib/chart-palette";
import type { MatrixColumn, MatrixRow } from "./student-score-matrix";

type Ranked = MatrixRow & { avg: number | null; counted: number; rank: number | null };

export function StudentRankings({
  rows,
  columns,
  showCollege = false,
  countLabel = "exams",
  itemLabel = "Exam",
}: {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  showCollege?: boolean;
  countLabel?: string;
  /** What one column is, for the detail table's first header. */
  itemLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const ranked = useMemo<Ranked[]>(() => {
    const scored = rows.map((r) => {
      const vals = columns.map((c) => r.values[c.key]).filter((v): v is number => v != null);
      return {
        ...r,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
        counted: vals.length,
      };
    });
    const withResults = scored
      .filter((s) => s.avg != null)
      .sort((a, b) => (b.avg as number) - (a.avg as number));

    let lastAvg: number | null = null;
    let lastRank = 0;
    const out: Ranked[] = withResults.map((s, i) => {
      // Competition ranking: equal averages share a position, and the position
      // after a tie skips.
      const rank = lastAvg != null && s.avg === lastAvg ? lastRank : i + 1;
      lastAvg = s.avg;
      lastRank = rank;
      return { ...s, rank };
    });
    // Unranked tail, alphabetical — they are a list to chase, not a ladder.
    out.push(
      ...scored
        .filter((s) => s.avg == null)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ ...s, rank: null })),
    );
    return out;
  }, [rows, columns]);

  // The median coverage in the cohort — the yardstick for "ranked on very few".
  const typical = useMemo(() => {
    const counts = ranked.filter((r) => r.rank != null).map((r) => r.counted).sort((a, b) => a - b);
    if (!counts.length) return 0;
    return counts[Math.floor(counts.length / 2)];
  }, [ranked]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((r) => `${r.name} ${r.roll ?? ""}`.toLowerCase().includes(q));
  }, [ranked, query]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Rank",
      "Student",
      "Roll number",
      ...(showCollege ? ["College"] : []),
      "Average %",
      `${countLabel} counted`,
    ];
    const body = visible.map((r) => [
      r.rank ?? "unranked",
      r.name,
      r.roll ?? "",
      ...(showCollege ? [r.college ?? ""] : []),
      r.avg == null ? "" : r.avg.toFixed(2),
      r.counted,
    ]);
    const csv = [header, ...body].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rankings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No students have a result in this period.
      </div>
    );
  }

  const rankedCount = ranked.filter((r) => r.rank != null).length;

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
            {rankedCount} ranked
            {ranked.length > rankedCount && ` · ${ranked.length - rankedCount} with no result`}
          </span>
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="max-h-[34rem] overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr className="text-left">
              <th scope="col" className="w-14 px-3 py-2 font-semibold">#</th>
              <th scope="col" className="px-3 py-2 font-semibold">Student</th>
              <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">Average</th>
              {/* Folded into the student cell below sm, so a 320px phone shows
                  every column rather than scrolling the ranking sideways. */}
              <th scope="col" className="hidden w-28 px-3 py-2 text-right font-semibold sm:table-cell">
                Attempted
              </th>
              <th scope="col" className="w-10 px-2 py-2">
                <span className="sr-only">Expand</span>
              </th>
            </tr>
          </thead>
          {visible.map((r) => {
            const isOpen = open.has(r.studentId);
            const got = columns.filter((c) => r.values[c.key] != null);
            return (
              // One tbody per student, so the detail row is grouped with the row
              // it belongs to for assistive tech as well as visually.
              <tbody key={r.studentId} className="border-t">
                <tr
                  className={cn("hover:bg-muted/40 cursor-pointer", isOpen && "bg-muted/40")}
                  onClick={() => toggle(r.studentId)}
                >
                  <td className="px-3 py-2 tabular-nums">
                    {r.rank == null ? (
                      <span className="text-muted-foreground/60">—</span>
                    ) : (
                      <span
                        className={cn(
                          "font-semibold",
                          r.rank <= 3 && "text-primary",
                        )}
                      >
                        {r.rank}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium break-words">{r.name}</span>
                    <span className="text-muted-foreground block text-xs break-words">
                      {r.roll ?? "no roll number"}
                      {showCollege && r.college ? ` · ${r.college}` : ""}
                    </span>
                    <span className="text-muted-foreground block text-xs tabular-nums sm:hidden">
                      {r.counted} of {columns.length} attempted
                      {r.rank != null && typical > 0 && r.counted < typical && (
                        <span className="text-amber-700"> · few counted</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Pill value={r.avg} />
                  </td>
                  <td className="text-muted-foreground hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                    {r.counted} of {columns.length}
                    {r.rank != null && typical > 0 && r.counted < typical && (
                      // Says it out loud rather than letting an average over two
                      // exams sit next to one over fourteen as if they were the
                      // same claim.
                      <span className="block text-[0.65rem] text-amber-700">
                        few counted
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} ${r.name}'s ${countLabel}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(r.studentId);
                      }}
                      className="text-muted-foreground hover:text-foreground p-1"
                    >
                      <ChevronRight
                        className={cn("size-4 transition-transform", isOpen && "rotate-90")}
                      />
                    </button>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="bg-muted/30">
                    {/* Indented and rule-marked, so the breakdown cannot be read as
                        more students — at a glance the detail rows are the same
                        shape as the ranking rows above them. */}
                    <td colSpan={5} className="border-primary/30 py-3 pl-6 pr-3">
                      {got.length === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          No result in this period — nothing to break down.
                        </p>
                      ) : (
                        <div className="border-primary/40 border-l-2 pl-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground text-left">
                                <th scope="col" className="py-1 pr-3 font-medium">{itemLabel}</th>
                                <th scope="col" className="hidden py-1 pr-3 font-medium sm:table-cell">
                                  Score
                                </th>
                                <th scope="col" className="w-20 py-1 text-right font-medium">%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {got.map((c) => (
                                <tr key={c.key} className="border-t">
                                  <td className="py-1.5 pr-3">
                                    <span className="block break-words">{c.label}</span>
                                    {c.sublabel && (
                                      <span className="text-muted-foreground block">{c.sublabel}</span>
                                    )}
                                    <span className="text-muted-foreground block tabular-nums sm:hidden">
                                      {r.notes?.[c.key] ?? "—"}
                                    </span>
                                  </td>
                                  <td className="text-muted-foreground hidden py-1.5 pr-3 tabular-nums sm:table-cell">
                                    {r.notes?.[c.key] ?? "—"}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <Pill value={r.values[c.key]} small />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {r.counted < columns.length && (
                        <p className="text-muted-foreground mt-2 pl-3 text-[0.7rem]">
                          {columns.length - r.counted} of {columns.length} {countLabel} have no
                          result for this student and are not counted in the average.
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      {visible.length === 0 && (
        <p className="text-muted-foreground text-sm">No student matches that search.</p>
      )}

      <p className="text-muted-foreground text-xs">
        Ranked on the mean of the percentages a student has, so equal averages share a position
        and the next one skips. Students with no result in this period are listed last, unranked —
        no result is not a bad result. Open a row for the {countLabel} behind the number.
      </p>
    </div>
  );
}

function Pill({ value, small = false }: { value?: number | null; small?: boolean }) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  const { fill, ink } = sequentialStep(value);
  return (
    <span
      className={cn(
        "inline-block min-w-12 rounded px-2 py-0.5 text-center font-semibold tabular-nums",
        small ? "text-xs" : "text-sm",
      )}
      style={{ background: fill, color: ink }}
    >
      {Math.round(value)}%
    </span>
  );
}
