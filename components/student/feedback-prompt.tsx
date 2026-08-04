"use client";

// The post-chapter feedback prompt (issue #84), shown at the top of
// /student/quizzes — the moment the student is already here for the chapter's
// assessment, so the ask costs no extra trip.
//
// THREE THINGS THIS COMPONENT IS CAREFUL ABOUT
//   1. It is SKIPPABLE. Nothing about the assessment below depends on it. Coercing a
//      survey produces straightlined answers, so a hard gate would cost us the data
//      we are collecting.
//   2. The visibility promise sits immediately above Submit, not in a footer — the
//      student is told what their trainer will and won't see at the moment they
//      decide what to write.
//   3. "Remind me later" is remembered locally (3 days) rather than server-side.
//      A dismissal is a UI preference, not a fact about the response, and it must
//      never be mistaken for an answer: the request stays open and uncounted, which
//      is what keeps the response rate honest.
//
// Reads/writes /api/student/feedback.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { InfoTooltip } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { ATTENDED_LABELS, type FormItem, type PendingFeedback } from "@/lib/feedback-query";

export type PublishedAction = {
  id: string;
  title: string;
  /** Which batch this action came out of — a student in two batches needs it. */
  batchId: string;
  batchName?: string | null;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  resolutionNote: string | null;
};

const SNOOZE_KEY = "cl-feedback-snooze";
const SNOOZE_DAYS = 3;

/** Requests the student chose to postpone, as { requestId: epochMs }. */
function readSnoozed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

const GROUP_ORDER: Record<string, number> = { teaching: 0, content: 1, logistics: 2, screening: 3 };

/**
 * The form itself, without the queue around it. Exported so the per-chapter
 * "Give feedback" action on a batch's syllabus opens the SAME form as the hub
 * prompt — two implementations of a rating form would drift, and the promise text
 * below the submit button is the last thing that should exist in two versions.
 */
export function FeedbackForm({
  request,
  onSubmitted,
  onCancel,
  cancelLabel = "Remind me later",
}: {
  request: PendingFeedback;
  onSubmitted: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remark, setRemark] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showRemark, setShowRemark] = useState(false);

  // Hydrate from an existing response so the 24h edit window round-trips.
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const [itemId, a] of Object.entries(request.answers ?? {})) {
      if (a.rating != null) seed[itemId] = String(a.rating);
      else if (a.choice != null) seed[itemId] = a.choice;
      else seed[itemId] = "na";
    }
    setAnswers(seed);
    setRemark(request.remark ?? "");
    setContactOk(request.contactOk);
    setError("");
  }, [request.requestId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ordered = [...request.items].sort(
    (a, b) => (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9),
  );
  const ratingItems = ordered.filter((i) => i.type === "rating5");
  const otherItems = ordered.filter((i) => i.type !== "rating5");

  const answeredCount = request.items.filter((i) => answers[i.itemId] != null).length;
  const allAnswered = request.items.filter((i) => i.required).every((i) => answers[i.itemId] != null);

  async function submit() {
    setError("");
    setSaving(true);
    try {
      const payload = request.items
        .map((i) => {
          const v = answers[i.itemId];
          if (v == null) return null;
          if (i.type === "choice") return { item_id: i.itemId, choice: v };
          if (v === "na") return { item_id: i.itemId };
          return { item_id: i.itemId, rating: Number(v) };
        })
        .filter(Boolean);

      const res = await fetch(`/api/student/feedback/${request.requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload, remark, contact_ok: contactOk }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save your feedback");
      onSubmitted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = request.submittedAt ? "Update feedback" : "Submit feedback";
  const progressNote = !allAnswered ? (
    <p className="text-muted-foreground text-xs">
      {answeredCount} of {request.items.length} answered — the rest take a few taps.
    </p>
  ) : null;
  const buttons = (
    <>
      {onCancel && (
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </Button>
      )}
      <Button onClick={submit} disabled={saving || !allAnswered}>
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Saving…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </>
  );

  // The primary action leads and goes full-width on a phone so it is
  // thumb-reachable; the form is never in an overlay, so there is no footer band.
  const actions = (
    <div className="mt-4 grid gap-2">
      <div className="flex flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">{buttons}</div>
      {progressNote}
    </div>
  );

  return (
    <div className="grid min-w-0 gap-4">
      {/* A RATING MATRIX, then the other field types — the split matters.
          The 1-5 items share one column geometry so the eye scans straight down a
          grid and the scale is stated once in the header. The attendance question has
          four word-labels, so leaving it in the matrix would knock every column out
          of alignment; it gets its own field below, the way a matrix and a dropdown
          are separate fields on any well-built survey. */}
      <div className="grid min-w-0 gap-0">
        <div className="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pb-1.5 text-xs min-[360px]:grid">
          <span>Disagree &rarr; agree</span>
          <span className="flex gap-1 justify-self-end">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="w-9 text-center font-medium tabular-nums">
                {n}
              </span>
            ))}
            {ratingItems.some((i) => i.allowNa) && <span className="w-9 text-center">n/a</span>}
          </span>
        </div>

        <div className="grid min-w-0 divide-y border-y">
          {ratingItems.map((item) => (
            <ItemRow
              key={item.itemId}
              item={item}
              value={answers[item.itemId]}
              onPick={(v) => setAnswers((prev) => ({ ...prev, [item.itemId]: v }))}
            />
          ))}
        </div>
        <p className="text-muted-foreground pt-1.5 text-xs min-[360px]:hidden">
          1 = strongly disagree · 5 = strongly agree
        </p>
      </div>

      {otherItems.map((item) => (
        <ItemRow
          key={item.itemId}
          item={item}
          value={answers[item.itemId]}
          onPick={(v) => setAnswers((prev) => ({ ...prev, [item.itemId]: v }))}
        />
      ))}

      {/* Collapsed by default: the ratings are the required part, and an empty
          textarea was costing every student 160px of scrolling to ignore. */}
      {showRemark || remark ? (
        <div className="grid gap-1.5">
          <label htmlFor={`rmk-${request.requestId}`} className="text-sm font-medium">
            Anything you&apos;d like us to know or change?{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            id={`rmk-${request.requestId}`}
            value={remark}
            maxLength={1000}
            rows={3}
            autoFocus={showRemark}
            placeholder="More practice on the tougher sums would help…"
            onChange={(e) => setRemark(e.target.value)}
          />
          <p className="text-muted-foreground text-right text-xs">{remark.length} / 1000</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowRemark(true)}
          className="text-primary justify-self-start text-sm font-medium hover:underline"
        >
          + Add a comment (optional)
        </button>
      )}

      <label className="bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm">
        <Checkbox
          checked={contactOk}
          onCheckedChange={(v) => setContactOk(v === true)}
          className="mt-0.5"
        />
        <span>
          I&apos;m happy for the academic team to contact me about this.
          <span className="text-muted-foreground block text-xs">
            Leave it unchecked and your response stays uncontactable.
          </span>
        </span>
      </label>

      {/* The promise still sits immediately above the submit button — it is just one
          line now, with the full wording a tap away rather than four lines tall. */}
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        <Lock className="text-primary size-3.5 shrink-0" />
        <span>
          Your trainer sees this <span className="text-foreground font-medium">without your name</span>.
        </span>
        <InfoTooltip title="Who sees what">
          Your trainer only ever sees results combined with everyone else&apos;s, and remarks with no
          name attached. The academic team can see your name so they can act on it. Used to improve
          teaching — never for marks.
        </InfoTooltip>
      </p>

      {error && (
        <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {actions}
    </div>
  );
}

export function FeedbackPrompt() {
  const [requests, setRequests] = useState<PendingFeedback[] | null>(null);
  const [published, setPublished] = useState<PublishedAction[]>([]);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  const load = useCallback(() => {
    fetch("/api/student/feedback")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;   // a failed prompt must never break the hub below it
        setRequests(d.requests ?? []);
        setPublished(d.published ?? []);
      })
      .catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    setSnoozed(readSnoozed());
    load();
  }, [load]);

  // One chapter at a time: a stack of six forms reads as a chore, and the queue
  // refills from the server after each submit anyway.
  const cutoff = Date.now() - SNOOZE_DAYS * 86_400_000;
  const queue = (requests ?? []).filter((r) => (snoozed[r.requestId] ?? 0) < cutoff);
  const current = queue[0];

  function snooze(requestId: string) {
    const next = { ...readSnoozed(), [requestId]: Date.now() };
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    setSnoozed(next);
  }

  if (requests === null) return null;   // silent while loading; this is not the page

  return (
    <div className="grid gap-4">
      {done && (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-6 text-sm text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="size-5 shrink-0" />
            <span className="font-medium">Thanks — your feedback is recorded.</span>
            <span className="text-emerald-800/80 dark:text-emerald-300/80">
              You can change it for the next 24 hours.
            </span>
          </CardContent>
        </Card>
      )}

      {current && !done && (
        <Card className="border-primary/40">
          <CardContent className="grid gap-4 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold break-words">
                  How was{" "}
                  <span className="text-primary">{current.chapterName ?? "this chapter"}</span>?
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs break-words">
                  {[
                    current.batchName,
                    current.subjectName,
                    `${current.items.length} questions, about 45 seconds`,
                    current.submittedAt ? "editing your answer" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {queue.length > 1 && (
                <Badge variant="secondary" className="shrink-0">
                  1 of {queue.length}
                </Badge>
              )}
            </div>

            <FeedbackForm
              request={current}
              onSubmitted={() => {
                setDone(true);
                load();   // the next chapter's request queues up behind this one
              }}
              onCancel={() => snooze(current.requestId)}
            />
          </CardContent>
        </Card>
      )}

      {published.length > 0 && <WhatChanged actions={published} />}
    </div>
  );
}

/** "What changed after your feedback" — the published half of the staff action list.
 *  Students who never see a change stop answering, so this is not decoration.
 *
 *  `showBatch` is off on surfaces that are already scoped to one batch, where naming
 *  it on every row is noise; the cross-batch prompt needs it. */
export function WhatChanged({
  actions,
  showBatch = true,
}: {
  actions: PublishedAction[];
  showBatch?: boolean;
}) {
  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <MessageSquare className="text-primary size-4" /> What changed after your feedback
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Actions your academic team took from what students told them.
          </p>
        </div>
        <ul className="grid gap-2">
          {actions.map((a) => (
            <li
              key={a.id}
              className={`bg-muted/40 rounded-md border-l-2 px-3 py-2 text-sm ${
                a.status === "done" ? "border-l-emerald-600" : "border-l-primary"
              }`}
            >
              <p className="break-words">{a.title}</p>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                {showBatch && a.batchName && <span className="break-words">{a.batchName}</span>}
                <Badge variant={a.status === "done" ? "default" : "secondary"}>
                  {a.status === "done"
                    ? "Done"
                    : a.status === "in_progress"
                      ? "In progress"
                      : a.status === "dropped"
                        ? "Not going ahead"
                        : "Open"}
                </Badge>
                {a.resolutionNote && <span className="break-words">{a.resolutionNote}</span>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ONE QUESTION = ONE ROW.
//
// The first cut of this stacked a group heading, the question as a full sentence
// (two lines at 320px), the scale, and a disagree/agree legend — about 145px per
// question, so seven questions ran past 2,300px on a phone. A "45 second" form that
// takes seven screens of scrolling is the form students abandon.
//
// Now the short label sits beside the scale and the full sentence is the accessible
// name, so the row is ~52px and nothing is lost to a screen reader. Below 360px the
// label moves above the scale (there is genuinely no room), which is the only place
// this costs a second line.
function ItemRow({
  item,
  value,
  onPick,
}: {
  item: FormItem;
  value: string | undefined;
  onPick: (v: string) => void;
}) {
  const options =
    item.type === "choice"
      ? (item.choices ?? []).map((c) => ({ v: c, label: ATTENDED_LABELS[c] ?? c }))
      : [1, 2, 3, 4, 5].map((n) => ({ v: String(n), label: String(n) }));

  return (
    <div className="grid min-w-0 gap-1.5 py-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto] min-[360px]:items-center min-[360px]:gap-3">
      <span className="min-w-0 text-sm leading-snug" title={item.prompt}>
        {item.shortLabel ?? item.prompt}
      </span>
      <div
        role="radiogroup"
        aria-label={item.prompt}
        className="flex min-w-0 items-stretch gap-1 justify-self-end"
      >
        {options.map((o) => {
          const on = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${item.prompt} — ${o.label}`}
              onClick={() => onPick(o.v)}
              className={`min-h-11 min-w-9 flex-1 rounded-md border px-1 text-sm font-medium transition-colors min-[360px]:flex-none ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:bg-muted"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        {item.allowNa && (
          <button
            type="button"
            role="radio"
            aria-checked={value === "na"}
            aria-label={`${item.prompt} — not applicable`}
            title="Not applicable"
            onClick={() => onPick("na")}
            className={`min-h-11 w-9 shrink-0 rounded-md border text-xs font-medium transition-colors ${
              value === "na"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:bg-muted"
            }`}
          >
            &ndash;
          </button>
        )}
      </div>
    </div>
  );
}
