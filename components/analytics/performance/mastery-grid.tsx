"use client";

// FR-5: the whole picture in one view — a subject × chapter grid of best scores.
// This was the only RPC in the story's §6 that was never built (migration 154 adds
// student_mastery_grid); O-5 proposed deferring the view and we reversed that,
// because on a phone a grid of 40px cells fits where five bar charts don't.
//
// Deliberately NOT recharts: a CSS grid of buttons is cheaper, keyboard-reachable,
// reflows on narrow screens, and gets native tooltips for free.
//
// Colour is SEQUENTIAL — one hue, low→dark (inverted on the dark surface) — because
// the cell encodes magnitude, not identity. "Not assessed" is neutral, never the
// lowest step, so an unattempted chapter can't be misread as a bad score.
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SEQUENTIAL,
  SEQUENTIAL_LABELS,
  SEQUENTIAL_NONE,
  STATUS,
  sequentialStep,
} from "@/lib/chart-palette";
import type { MasteryCell } from "@/lib/student-performance-query";
import { EmptyState, ScrollBox, pct } from "./shared";

type Row = { id: string; name: string; cells: MasteryCell[] };

/** Group cells into one row per subject, preserving the RPC's syllabus order. */
function toRows(cells: MasteryCell[]): Row[] {
  const rows = new Map<string, Row>();
  for (const c of cells) {
    let row = rows.get(c.subject_id);
    if (!row) {
      row = { id: c.subject_id, name: c.subject_name, cells: [] };
      rows.set(c.subject_id, row);
    }
    row.cells.push(c);
  }
  return [...rows.values()];
}

function Ramp({ anyBelow }: { anyBelow: boolean }) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-x-1 gap-y-2">
        {SEQUENTIAL.map((fill, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="h-3 w-11 rounded-sm" style={{ background: fill }} aria-hidden />
            <span className="text-muted-foreground text-[9.5px] tabular-nums">
              {SEQUENTIAL_LABELS[i]}
            </span>
          </div>
        ))}
        <div className="ml-3 flex flex-col items-center gap-1">
          <span
            className="border-border h-3 w-11 rounded-sm border border-dashed"
            style={{ background: SEQUENTIAL_NONE }}
            aria-hidden
          />
          <span className="text-muted-foreground text-[9.5px]">none</span>
        </div>
      </div>
      {/* The ramp's 40 boundary is a palette step, NOT a pass mark: pass marks are
          per chapter and often differ, so an earlier version's claim that the
          40–55 band "starts at the pass mark" was simply false wherever a quiz
          used anything but 40. Below-pass is flagged per cell instead. */}
      <p className="text-muted-foreground mt-2 text-xs">
        Stronger colour means a higher score; the bands are fixed score ranges, not pass marks.
        Cells with a dashed edge have no attempt yet.
        {anyBelow && (
          <>
            {" "}
            A <span className="font-medium" style={{ color: STATUS.weak }}>coloured underline</span>{" "}
            marks a chapter below <em>its own</em> pass mark.
          </>
        )}
      </p>
    </div>
  );
}

function GridTable({ rows }: { rows: Row[] }) {
  return (
    <ScrollBox>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Chapter</TableHead>
            <TableHead className="text-right">Best</TableHead>
            <TableHead className="text-right">Pass</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.flatMap((r) =>
            r.cells.map((c) => (
              <TableRow key={c.chapter_id}>
                <TableCell className="text-muted-foreground">{r.name}</TableCell>
                <TableCell>{c.chapter_name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.best_pct == null ? "not assessed" : pct(c.best_pct)}
                  {c.best_pct != null && c.best_pct < c.pass_pct && (
                    <span className="text-muted-foreground"> · below pass</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.pass_pct}%</TableCell>
              </TableRow>
            )),
          )}
        </TableBody>
      </Table>
    </ScrollBox>
  );
}

export function MasteryGrid({
  cells,
  table,
  onPickSubject,
}: {
  cells: MasteryCell[];
  table: boolean;
  onPickSubject?: (subjectId: string) => void;
}) {
  const rows = toRows(cells);
  if (rows.length === 0)
    return (
      <EmptyState message="The mastery grid fills in as your mentors mark chapters complete and you attempt them." />
    );
  if (table) return <GridTable rows={rows} />;

  const widest = Math.max(...rows.map((r) => r.cells.length));
  const anyBelow = cells.some((c) => c.best_pct != null && c.best_pct < c.pass_pct);

  return (
    <>
      <ScrollBox>
        {/* Fixed 34px cells, so the grid keeps its shape and scrolls rather than
            squashing chapters into unreadable slivers on a phone. */}
        <div className="min-w-fit">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `minmax(96px, 152px) repeat(${widest}, 34px)` }}
          >
            <span aria-hidden />
            {Array.from({ length: widest }, (_, i) => (
              <span
                key={i}
                className="text-muted-foreground pb-1 text-center text-[9.5px] tabular-nums"
                aria-hidden
              >
                {i + 1}
              </span>
            ))}

            {rows.map((r) => (
              <div key={r.id} className="contents">
                {onPickSubject ? (
                  <button
                    type="button"
                    onClick={() => onPickSubject(r.id)}
                    className="hover:text-foreground focus-visible:ring-ring truncate pr-2 text-left text-[11px] font-medium focus-visible:ring-2 focus-visible:outline-none"
                    title={`${r.name} — open its chapters`}
                  >
                    {r.name}
                  </button>
                ) : (
                  <span className="truncate pr-2 text-[11px] font-medium" title={r.name}>
                    {r.name}
                  </span>
                )}
                {Array.from({ length: widest }, (_, i) => {
                  const c = r.cells[i];
                  if (!c) return <span key={i} aria-hidden />;
                  if (c.best_pct == null)
                    return (
                      <span
                        key={i}
                        title={`${r.name} · ${c.chapter_name} · not assessed`}
                        className="border-border text-muted-foreground flex h-[34px] items-center justify-center rounded-[5px] border border-dashed text-[10px]"
                        style={{ background: SEQUENTIAL_NONE }}
                      >
                        –
                      </span>
                    );
                  const step = sequentialStep(c.best_pct);
                  const failed = c.best_pct < c.pass_pct;
                  return (
                    <span
                      key={i}
                      title={`${r.name} · ${c.chapter_name} · best ${Math.round(c.best_pct)}% (pass ${c.pass_pct}%)${failed ? " · below pass" : ""}`}
                      className="flex h-[34px] items-center justify-center rounded-[5px] text-[10.5px] font-semibold tabular-nums"
                      style={{
                        background: step.fill,
                        color: step.ink,
                        // sequential hue keeps encoding the score; the underline adds
                        // the pass/fail state without stealing a second hue
                        boxShadow: failed ? `inset 0 -3px 0 0 ${STATUS.weak}` : undefined,
                      }}
                    >
                      {Math.round(c.best_pct)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </ScrollBox>
      <Ramp anyBelow={anyBelow} />
    </>
  );
}
