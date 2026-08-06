"use client";

// Cross-batch feedback triage (issue #84, §4.8) — the staff inbox.
//
// WHY THIS SCREEN EXISTS
//   159 computed the trip rules and showed them one batch at a time. A coordinator
//   running a dozen batches will not open twelve Feedback tabs every morning, so
//   trips that nobody looked at were, in effect, trips that never fired. This is the
//   one place that answers "what needs me today?" across every batch the caller may
//   see, and it deliberately shows the queue rather than a dashboard.
//
// THREE RULES IT KEEPS
//   • It never diverges from the batch tab: both read the same SQL helper, so a
//     chapter cannot be "tripped" here and "healthy" there.
//   • Anonymity holds — this is an aggregate view. Names live one click away, on the
//     batch's own Feedback tab, behind feedback.view.identified.
//   • Nothing is hidden for low n (O-2). A single 1-star response earns the same row
//     as fourteen of them; only the "Low confidence" label changes.
//
// Acting on a row means opening the chapter that tripped, because an action item
// without its source is unreviewable six months later — so every row links to the
// batch's Feedback tab, where "Create action" already carries the provenance.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileQuestion,
  ListTodo,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format-date";
import { TRIP_LABELS, type TriageRow } from "@/lib/feedback-query";
import { GroupScores, LowConfidenceBadge, TRIP_TONE } from "@/components/feedback/score-bars";
import { BatchActions } from "@/components/batches/batch-actions";
import { FeedbackFormEditor } from "@/components/feedback/form-editor";
import { DobShortfall } from "@/components/feedback/dob-shortfall";

// Same connected-folder tabs as the batch workspace (docs/STYLE_GUIDE.md → Tabs).
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

export function TriageInbox({
  canView,
  canManageActions,
  canManageForm = false,
  canReviewStudents = false,
}: {
  /** feedback.view.identified — without it the queue tab is not rendered at all,
   *  because the RPC behind it would 403 anyway. */
  canView: boolean;
  canManageActions: boolean;
  /** feedback.form.manage — editing the instrument itself (§F9). */
  canManageForm?: boolean;
  /** student.review — may send the "add your date of birth" note (O-11). */
  canReviewStudents?: boolean;
}) {
  const [rows, setRows] = useState<TriageRow[] | null>(null);
  const [error, setError] = useState("");
  // Off by default: the queue is the question. On, it becomes the full register of
  // every window, which is what you want when checking whether asking is working
  // at all rather than what went wrong.
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback((all: boolean) => {
    setLoading(true);
    fetch(`/api/admin/feedback/triage${all ? "?all=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setError("");
          setRows(d.requests ?? []);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (canView) load(showAll);
  }, [canView, load, showAll]);

  return (
    <Tabs defaultValue={canView ? "attention" : "actions"}>
      <TabsList
        variant="line"
        className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
      >
        {canView && (
          <TabsTrigger value="attention" className={TAB_CLS}>
            <MessageSquareQuote className="size-4" /> Needs attention
          </TabsTrigger>
        )}
        {canManageActions && (
          <TabsTrigger value="actions" className={TAB_CLS}>
            <ListTodo className="size-4" /> Actions
          </TabsTrigger>
        )}
        {canManageForm && (
          <TabsTrigger value="form" className={TAB_CLS}>
            <FileQuestion className="size-4" /> Questions
          </TabsTrigger>
        )}
      </TabsList>

      {canView && (
      <TabsContent value="attention" className="mt-4 min-w-0">
        {error && (
          <p className="text-destructive bg-destructive/10 border-destructive/20 mb-4 rounded-md border px-3 py-2 text-sm">
            {error}
          </p>
        )}
        {/* Above the queue: these students are missing from every rate below it.
            Renders nothing once every enrolled student has a date of birth. */}
        <DobShortfall canAsk={canReviewStudents} />
        {rows === null ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : (
          <Queue
            rows={rows}
            showAll={showAll}
            loading={loading}
            onToggleAll={() => setShowAll((v) => !v)}
            onReload={() => load(showAll)}
          />
        )}
      </TabsContent>
      )}

      {canManageActions && (
        <TabsContent value="actions" className="mt-4 min-w-0">
          {/* null ⇒ every batch the caller may see. */}
          <BatchActions batchId={null} />
        </TabsContent>
      )}

      {canManageForm && (
        <TabsContent value="form" className="mt-4 min-w-0">
          <FeedbackFormEditor />
        </TabsContent>
      )}
    </Tabs>
  );
}

function Queue({
  rows,
  showAll,
  loading,
  onToggleAll,
  onReload,
}: {
  rows: TriageRow[];
  showAll: boolean;
  loading: boolean;
  onToggleAll: () => void;
  onReload: () => void;
}) {
  // Unclaimed counts an auto-proposal as nobody: the queue is about people, and a
  // proposal cron filed at 03:05 is not someone dealing with it.
  const unclaimed = rows.filter((r) => r.trips.length > 0 && r.openClaimedCount === 0).length;
  const remarks = rows.reduce((n, r) => n + r.remarkCount, 0);
  const lowRating = rows.filter((r) => r.trips.includes("low_rating")).length;
  const lowTurnout = rows.filter((r) => r.trips.includes("low_turnout")).length;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Nobody on it" v={String(unclaimed)} n="tripped, no action open" tone={unclaimed > 0 ? "bad" : undefined} />
        <Stat k="Ratings of 1–2" v={String(lowRating)} n="chapters with one or more" tone={lowRating > 0 ? "bad" : undefined} />
        <Stat k="Remarks" v={String(remarks)} n="students who typed something" />
        <Stat k="Low turnout" v={String(lowTurnout)} n="closed under 40%" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onToggleAll} disabled={loading}>
          {showAll ? "Only what tripped" : "Show every window"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onReload} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          {showAll
            ? "No feedback windows anywhere yet. One opens automatically whenever a chapter is marked completed."
            : "Nothing needs attention. Every closed window is inside its thresholds — worth a look at “Show every window” to check people are being asked at all."}
        </p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <RequestCard key={r.requestId} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ row: r }: { row: TriageRow }) {
  const severe = r.trips.includes("low_rating") || r.trips.includes("low_mean");
  const stripe =
    r.openClaimedCount > 0
      ? "border-l-emerald-600"
      : severe
        ? "border-l-rose-600"
        : r.trips.length > 0
          ? "border-l-amber-500"
          : "border-l-muted-foreground/30";

  return (
    <Card className={`border-l-4 ${stripe}`}>
      <CardContent className="grid gap-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold break-words">{r.chapterName ?? "—"}</p>
            <p className="text-muted-foreground text-xs break-words">
              {[r.batchName, r.subjectName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/batches/${r.batchId}#feedback`}>
              Open chapter <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {r.isOpen ? (
            <Badge variant="secondary">Open until {formatDate(r.closesAt)}</Badge>
          ) : (
            <Badge variant="secondary">Closed {formatDate(r.closesAt)}</Badge>
          )}
          <Badge variant="secondary">
            {r.responseCount} of {r.eligibleCount} responded
            {r.responsePct != null ? ` · ${r.responsePct}%` : ""}
          </Badge>
          {r.lowConfidence && r.responseCount > 0 && (
            <LowConfidenceBadge n={r.responseCount} eligible={r.eligibleCount} />
          )}
          {r.trips.map((t) => (
            <Badge key={t} variant="secondary" className={TRIP_TONE[t]}>
              {TRIP_LABELS[t]}
            </Badge>
          ))}
          {r.openClaimedCount > 0 ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              {r.openClaimedCount} action{r.openClaimedCount === 1 ? "" : "s"} being worked
            </Badge>
          ) : (
            r.openActionCount > 0 && (
              <Badge variant="secondary">Action proposed · nobody assigned</Badge>
            )
          )}
        </div>

        {/* Scores stay null while the window is open (O-5), so this renders nothing
            until it closes — the badges above are the whole story until then. */}
        <GroupScores scores={r.groupScores} />

        {r.quizPassPct != null && (
          <p className="text-muted-foreground text-xs">
            Quiz pass rate {r.quizPassPct}% · {r.quizAttempted} attempted
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ k, v, n, tone }: { k: string; v: string; n: string; tone?: "bad" }) {
  return (
    <div className="bg-card grid gap-0.5 rounded-lg border p-3">
      <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">{k}</span>
      <span
        className={`text-xl font-bold tabular-nums ${tone === "bad" ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {v}
      </span>
      <span className="text-muted-foreground text-xs">{n}</span>
    </div>
  );
}
