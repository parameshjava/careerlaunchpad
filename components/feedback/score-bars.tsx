"use client";

// Shared read-out for chapter feedback (issue #84), used by the mentor board and the
// staff Feedback tab so the two can never disagree about what a number means.
//
// THE RULES THIS ENCODES (docs/CHAPTER_FEEDBACK_ANALYSIS.md §4.8, §G9)
//   • Top-2-box, never a bare mean — a mean over an ordinal scale with n=6 invites
//     over-reading.
//   • The RAW COUNT always travels with the percentage. "79%" alone is the number
//     that misleads; "79% · 11 of 14" cannot be.
//   • Below 5 responses the result is LABELLED, never withheld (owner decision):
//     one student's feedback is still feedback that needs addressing.
//   • Reaction sits next to learning. A rating cannot separate "enjoyed it" from
//     "learned it"; the chapter's quiz pass rate can.
import { GROUP_LABELS, type ItemGroup, type Score } from "@/lib/feedback-query";
import { Badge } from "@/components/ui/badge";

const GROUPS: ItemGroup[] = ["teaching", "content", "logistics"];

// The bar rows use short labels: "Content & material" truncates to "Content & mat…"
// in the narrow label column at 320px, which reads as a rendering bug.
const BAR_LABELS: Record<string, string> = {
  teaching: "Teaching",
  content: "Content",
  logistics: "Logistics",
};

/** Bar colour tracks severity, not identity — the brand ramp can't say "this is bad". */
function tone(pct: number | null): string {
  if (pct == null) return "bg-muted-foreground/30";
  if (pct >= 70) return "bg-primary";
  if (pct >= 50) return "bg-amber-500";
  return "bg-rose-600";
}

export function LowConfidenceBadge({ n, eligible }: { n: number; eligible: number }) {
  return (
    <Badge
      variant="secondary"
      className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      Low confidence · {n} of {eligible} responded
    </Badge>
  );
}

export function ResponseBadge({
  n,
  eligible,
  pct,
}: {
  n: number;
  eligible: number;
  pct?: number | null;
}) {
  const rate = pct ?? (eligible > 0 ? Math.round((100 * n) / eligible) : null);
  return (
    <Badge variant="secondary">
      {n} of {eligible} responded{rate != null ? ` · ${rate}%` : ""}
    </Badge>
  );
}

export function GroupScores({ scores }: { scores: Record<string, Score> | null }) {
  if (!scores) return null;
  const rows = GROUPS.filter((g) => scores[g]);
  if (rows.length === 0)
    return (
      <p className="text-muted-foreground text-xs">No ratings in this window yet.</p>
    );

  return (
    <div className="grid gap-2">
      {rows.map((g) => {
        const s = scores[g];
        return (
          <div key={g} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[8rem_1fr_auto] sm:gap-3">
            <span className="text-muted-foreground truncate text-xs">{BAR_LABELS[g] ?? GROUP_LABELS[g]}</span>
            <span className="bg-muted h-2 min-w-0 overflow-hidden rounded-full">
              <span
                className={`block h-full rounded-full ${tone(s.pct)}`}
                style={{ width: `${s.pct ?? 0}%` }}
              />
            </span>
            <span className="text-right text-xs font-semibold tabular-nums">
              {s.pct != null ? `${s.pct}%` : "—"}
              <span className="text-muted-foreground font-normal">
                {" "}
                · {s.top2}/{s.rated}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Reaction vs learning, side by side (§G6) — the pairing that makes a rating
 *  actionable. `readyPct` is the self-efficacy item; `passPct` is the quiz. */
export function ReactionVsLearning({
  readyPct,
  readyTop2,
  readyRated,
  passPct,
  attempted,
  eligible,
}: {
  readyPct: number | null;
  readyTop2?: number;
  readyRated?: number;
  passPct: number | null;
  attempted: number;
  eligible: number;
}) {
  // A gap this wide is the finding worth surfacing: they felt ready and weren't.
  const gap = readyPct != null && passPct != null ? readyPct - passPct : null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="bg-muted/40 grid gap-0.5 rounded-lg border p-3">
        <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
          Felt ready to attempt
        </span>
        <span className="text-xl font-bold tabular-nums">
          {readyPct != null ? `${readyPct}%` : "—"}
        </span>
        <span className="text-muted-foreground text-xs">
          {readyRated ? `rated 4–5 · ${readyTop2} of ${readyRated}` : "no ratings yet"}
        </span>
      </div>
      <div className="bg-muted/40 grid gap-0.5 rounded-lg border p-3">
        <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
          Actually passed the quiz
        </span>
        <span
          className={`text-xl font-bold tabular-nums ${
            passPct == null ? "" : passPct < 50 ? "text-rose-600 dark:text-rose-400" : ""
          }`}
        >
          {passPct != null ? `${passPct}%` : "—"}
        </span>
        <span className="text-muted-foreground text-xs">
          {attempted > 0 ? `${attempted} of ${eligible} attempted` : "nobody has attempted it yet"}
        </span>
      </div>
      {gap != null && gap >= 20 && (
        <p className="text-muted-foreground sm:col-span-2 text-xs">
          Students felt {gap} points more ready than the quiz bears out — worth a second look at
          the practice material rather than the teaching.
        </p>
      )}
    </div>
  );
}
