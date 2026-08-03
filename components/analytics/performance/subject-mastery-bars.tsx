"use client";

// FR-3: which subjects am I lacking? Horizontal bars so long subject names stay
// legible on a phone, sorted so the gaps surface first.
//
// Two measures share the axis honestly, because both are percentages: the score
// bar, and a thin coverage track under it (chapters assessed ÷ completed). The gap
// between a long bar and a short track is the point — "you score well on what
// you've attempted, and you've attempted five of six".
//
// Pass marks are per-CHAPTER (chapter_quiz is one row per chapter). There is no
// subject-level pass mark in the schema, and an earlier version of this file
// invented one by averaging: a subject with marks 40/40/80 and scores 45/45/60 got
// an averaged mark of 53 and was painted "below pass" despite passing two chapters
// of three. So a subject is never compared with a mark of its own — what marks it
// "has gaps" is chapters_below_pass, each chapter measured against its own mark.
// The dashed guide line is drawn only when every chapter in view shares one mark;
// otherwise there is no single line to honestly draw, and the legend says so.
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
import { TriangleAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AXIS_TICK, BRAND, GRID_STROKE, HOVER_CURSOR, STATUS, TOOLTIP_STYLE } from "@/lib/chart-palette";
import type { SubjectScore } from "@/lib/student-performance-query";
import { EmptyState, Legend, LegendItem, ScrollBox, pct, pctLabel } from "./shared";

export type SubjectSort = "weakest" | "strongest";

/** A guide line is only honest when every chapter in view shares one pass mark.
 *  Returns that mark, or null with mixed=true when they disagree. */
export function typicalPassMark(subjects: SubjectScore[]): { mark: number | null; mixed: boolean } {
  const rows = subjects.filter((s) => s.pass_pct_min != null && s.pass_pct_max != null);
  if (rows.length === 0) return { mark: null, mixed: false };
  const min = Math.min(...rows.map((s) => s.pass_pct_min));
  const max = Math.max(...rows.map((s) => s.pass_pct_max));
  return min === max ? { mark: min, mixed: false } : { mark: null, mixed: true };
}

/** A subject "has gaps" when some of its chapters are below their own pass mark —
 *  never because its mean fell under an averaged mark. */
const hasGaps = (s: SubjectScore) => s.chapters_below_pass > 0;

function SubjectTable({ subjects }: { subjects: SubjectScore[] }) {
  return (
    <ScrollBox>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Below pass</TableHead>
            <TableHead className="text-right">Pass mark</TableHead>
            <TableHead className="text-right">Coverage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.map((s) => (
            <TableRow key={s.subject_id}>
              <TableCell>{s.subject_name}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(s.score_pct)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {s.chapters_assessed === 0
                  ? "—"
                  : `${s.chapters_below_pass} of ${s.chapters_assessed}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.pass_pct_min === s.pass_pct_max
                  ? `${s.pass_pct_min}%`
                  : `${s.pass_pct_min}–${s.pass_pct_max}%`}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {s.chapters_assessed}/{s.chapters_completed}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollBox>
  );
}

export function SubjectMasteryBars({
  subjects,
  sort,
  table,
  onPick,
  selected,
}: {
  subjects: SubjectScore[];
  sort: SubjectSort;
  table: boolean;
  onPick: (s: SubjectScore) => void;
  selected: string | null;
}) {
  const scored = subjects.filter((s) => s.score_pct != null);
  const rows = [...scored].sort((a, b) =>
    sort === "weakest"
      ? (a.score_pct ?? 0) - (b.score_pct ?? 0)
      : (b.score_pct ?? 0) - (a.score_pct ?? 0),
  );
  const notAssessed = subjects.filter((s) => s.score_pct == null);

  if (table) return <SubjectTable subjects={subjects} />;
  if (rows.length === 0)
    return <EmptyState message="Take a chapter assessment to see your subject scores." />;

  const { mark, mixed } = typicalPassMark(rows);
  const data = rows.map((s) => ({
    ...s,
    coverage:
      s.chapters_completed > 0 ? (s.chapters_assessed / s.chapters_completed) * 100 : 0,
  }));
  const anyGaps = rows.some(hasGaps);

  return (
    <>
      <ScrollBox>
        <div className="min-w-[440px]">
          <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 56)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 8 }}>
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
              <YAxis
                type="category"
                dataKey="subject_name"
                width={116}
                tick={{ ...AXIS_TICK, fontSize: 10.5 }}
              />
              <Tooltip
                cursor={HOVER_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, item) =>
                  name === "coverage"
                    ? [
                        `${item?.payload?.chapters_assessed}/${item?.payload?.chapters_completed} chapters`,
                        "Assessed",
                      ]
                    : [
                        `${pctLabel(v)}${
                          item?.payload?.chapters_below_pass > 0
                            ? ` · ${item.payload.chapters_below_pass} of ${item.payload.chapters_assessed} chapters below pass`
                            : ""
                        }`,
                        "Score",
                      ]
                }
              />
              {mark != null && (
                <ReferenceLine x={mark} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
              )}
              {/* score — 4px rounded data end. Status colour flags a subject that
                  HAS below-pass chapters; it is never a verdict on the mean. */}
              <Bar
                dataKey="score_pct"
                barSize={18}
                radius={[0, 4, 4, 0]}
                onClick={(_, i) => onPick(rows[i])}
                className="cursor-pointer"
              >
                <LabelList
                  dataKey="score_pct"
                  position="right"
                  formatter={pctLabel}
                  className="fill-foreground text-[11px] font-medium"
                />
                {data.map((s) => (
                  <Cell
                    key={s.subject_id}
                    fill={hasGaps(s) ? STATUS.weak : BRAND}
                    fillOpacity={selected && selected !== s.subject_id ? 0.4 : 1}
                  />
                ))}
              </Bar>
              {/* coverage — thin, recessive, 2px clear of the score bar */}
              <Bar dataKey="coverage" barSize={5} radius={[0, 2.5, 2.5, 0]} fill="var(--muted-foreground)" fillOpacity={0.45} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ScrollBox>

      <Legend>
        <LegendItem colour={BRAND} label="Score (mean of your best attempts)" />
        <LegendItem colour="var(--muted-foreground)" label="Coverage (chapters assessed ÷ completed)" />
        {mark != null && (
          <LegendItem colour="var(--muted-foreground)" label={`Pass mark (${mark}%)`} line />
        )}
        {anyGaps && (
          <LegendItem
            colour={STATUS.weak}
            label="Has chapters below their pass mark"
            icon={<TriangleAlert className="size-3" style={{ color: STATUS.weak }} />}
          />
        )}
      </Legend>

      {mixed && (
        <p className="text-muted-foreground mt-2 text-xs">
          No pass-mark line: your chapters use different pass marks, so there is no single line to
          draw. Each bar is still flagged against its own chapters&rsquo; marks — see the table view
          for the exact range.
        </p>
      )}

      {notAssessed.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Not assessed yet: {notAssessed.map((s) => s.subject_name).join(", ")} — no attempts in this
          range, so {notAssessed.length === 1 ? "it has" : "they have"} no score rather than 0%.
        </p>
      )}
    </>
  );
}
