"use client";

// A trainer's own trend across their successive chapters (issue #84 §4.8 "Trend").
//
// THE ONE RULE THIS ENCODES
//   Trend means a trainer against THEMSELVES, chapter after chapter, and nothing
//   else. Never against another trainer, never a league table, never a number that
//   could be lifted into a review (§F2, §F10 — the literature on this is unambiguous:
//   ratings tied to consequences produce grade inflation, not better teaching). This
//   component is therefore rendered only on /mentor, from the mentor's own rows, and
//   it has no shape that can hold a second person's series.
//
// It is computed from the chapters ALREADY on screen rather than a new endpoint: the
// sparkline and the cards below it must never disagree, and the cheapest way to
// guarantee that is one source of numbers.
//
// Open windows are excluded (no scores until close, O-5) and so are closed windows
// with nothing in them — a gap in the line is more honest than a zero, which would
// read as "the teaching scored nothing" instead of "nobody answered".
import { GROUP_LABELS, type MentorFeedback, type Score } from "@/lib/feedback-query";

type Point = {
  requestId: string;
  chapterName: string | null;
  pct: number;
  top2: number;
  rated: number;
};

/** Two points is the minimum that can show a direction; one is just a number the
 *  card below already shows. */
const MIN_POINTS = 2;

export function ChapterTrend({ chapters }: { chapters: MentorFeedback[] }) {
  // One series per subject: pace and clarity are not comparable across subjects, and
  // a single mixed line would invite exactly that comparison.
  const bySubject = new Map<string, { name: string | null; points: Point[] }>();

  // Oldest first — a trend reads left to right, and the board is newest-first.
  const ordered = [...chapters].sort((a, b) => a.openedAt.localeCompare(b.openedAt));

  for (const c of ordered) {
    if (c.isOpen || c.responseCount === 0) continue;
    const teaching: Score | undefined = c.groupScores?.teaching;
    if (!teaching || teaching.pct == null || teaching.rated === 0) continue;
    const entry = bySubject.get(c.subjectId) ?? { name: c.subjectName, points: [] };
    entry.points.push({
      requestId: c.requestId,
      chapterName: c.chapterName,
      pct: teaching.pct,
      top2: teaching.top2,
      rated: teaching.rated,
    });
    bySubject.set(c.subjectId, entry);
  }

  const series = [...bySubject.entries()].filter(([, s]) => s.points.length >= MIN_POINTS);
  if (series.length === 0) return null;

  return (
    <div className="grid gap-3">
      {series.map(([subjectId, s]) => (
        <Series key={subjectId} name={s.name} points={s.points} />
      ))}
    </div>
  );
}

function Series({ name, points }: { name: string | null; points: Point[] }) {
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.pct - first.pct;

  return (
    <div className="bg-card grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium break-words">
          {name ?? "Your chapters"}
          <span className="text-muted-foreground font-normal">
            {" "}
            · {GROUP_LABELS.teaching.toLowerCase()}, chapter by chapter
          </span>
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${
            Math.abs(delta) < 5
              ? "text-muted-foreground"
              : delta > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {delta}
          {" pts across "}
          {points.length} chapters
        </span>
      </div>

      {/* Bars rather than a line chart: at 320px a 6-point line is unreadable, and
          each bar can carry its own raw count, which a line cannot. */}
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
        {points.map((p) => (
          <div key={p.requestId} className="grid min-w-[3.25rem] flex-1 gap-1">
            <span className="bg-muted flex h-16 items-end overflow-hidden rounded">
              <span
                className={`block w-full rounded-t ${
                  p.pct >= 70 ? "bg-primary" : p.pct >= 50 ? "bg-amber-500" : "bg-rose-600"
                }`}
                // Floor at 4% so a genuine 0 is still a visible mark, not an empty
                // slot that reads as missing data.
                style={{ height: `${Math.max(p.pct, 4)}%` }}
                title={`${p.chapterName ?? "Chapter"}: ${p.pct}% · ${p.top2} of ${p.rated} rated 4–5`}
              />
            </span>
            <span className="text-center text-[10px] font-semibold tabular-nums">{p.pct}%</span>
            <span
              className="text-muted-foreground truncate text-center text-[10px]"
              title={p.chapterName ?? ""}
            >
              {p.chapterName ?? "—"}
            </span>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Your own chapters over time — never a comparison with another trainer.
      </p>
    </div>
  );
}
