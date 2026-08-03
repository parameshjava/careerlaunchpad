"use client";

// Reusable attempt-taking view — the question-by-question runner used by BOTH the
// exam sitting and the chapter-quiz assessment (and any future timed MCQ test).
// It is PURELY PRESENTATIONAL: it owns no data layer and no anti-cheat — the parent
// passes normalized questions + answer state + callbacks and drives the timer and
// tab-switch guard itself. Layout: a wide question column + a sticky right-side
// number palette (answered / marked / seen / not-visited), section accordions for
// multi-section papers, and a submit-confirm dialog. Built to docs/STYLE_GUIDE.md.
import { useEffect, useMemo, useRef } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Eraser,
  FileText,
  Flag,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichContent } from "@/components/exam/RichContent";
import {
  describeSourceSummary,
  formatQuestionSource,
  summarizeQuestionSources,
} from "@/lib/question-source";

export type AttemptQuestion = {
  position: number;
  questionId: string;
  /** Group key for the palette; a single-section test uses the same id for all. */
  sectionId: string;
  sectionLabel: string | null;
  answerType: "single" | "multi";
  stem: string;
  stemImageUrl?: string | null;
  passage?: { title: string | null; body: string } | null;
  options: { id: string; label: string }[];
  /** Past paper this question was asked in (issue #87); null for hand-authored ones. */
  source?: string | null;
  sourceYear?: number | null;
};

export function AttemptView({
  questions,
  index,
  answers,
  seen,
  marked,
  collapsed,
  timeLeft,
  submitting,
  confirmOpen,
  submitLabel,
  submitTitle,
  notice,
  onChoose,
  onGoTo,
  onClear,
  onToggleMark,
  onToggleSection,
  onToggleCollapseAll,
  onOpenConfirm,
  onCloseConfirm,
  onSubmit,
}: {
  questions: AttemptQuestion[];
  index: number;
  answers: Record<string, string[]>;
  seen: Set<string>;
  marked: Set<string>;
  collapsed: Set<string>;
  /** Seconds remaining; null hides the timer entirely. */
  timeLeft: number | null;
  submitting: boolean;
  confirmOpen: boolean;
  submitLabel: string;
  submitTitle: string;
  /** Anti-cheat / rules strip rendered above the layout (optional). */
  notice?: React.ReactNode;
  onChoose: (q: AttemptQuestion, optionId: string) => void;
  onGoTo: (i: number) => void;
  onClear: (q: AttemptQuestion) => void;
  onToggleMark: (qid: string) => void;
  onToggleSection: (id: string) => void;
  onToggleCollapseAll: () => void;
  onOpenConfirm: () => void;
  onCloseConfirm: () => void;
  onSubmit: () => void;
}) {
  const currentCellRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  // Keep the active palette cell in view as the student navigates — by scrolling
  // the palette's OWN scroll box, never the page. `scrollIntoView` here walked up
  // to the page scroller: on a phone the palette sits below the question, so on
  // mount it yanked the stem off the screen before the student had read it.
  useEffect(() => {
    const cell = currentCellRef.current;
    const box = paletteRef.current;
    if (!cell || !box) return;
    const c = cell.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (c.top < b.top) box.scrollTop -= b.top - c.top + 8;
    else if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom + 8;
  }, [index]);

  // Paper-level provenance (#87): how much of this paper came from real past
  // papers. Derived from the questions already in hand — no extra prop to thread
  // through, so every caller of AttemptView gets it for free, and it stays hidden
  // when the bank carries no sources (an unsourced paper looks as it always did).
  // Memoised above the early return below: the countdown re-renders this view once
  // a second, and the whole paper would otherwise be re-scanned each tick.
  const provenance = useMemo(() => summarizeQuestionSources(questions), [questions]);

  const q = questions[index];
  if (!q) return null;
  const answered = (qid: string) => (answers[qid]?.length ?? 0) > 0;
  const mm = timeLeft != null ? String(Math.floor(timeLeft / 60)).padStart(2, "0") : "--";
  const ss = timeLeft != null ? String(timeLeft % 60).padStart(2, "0") : "--";
  const lowTime = timeLeft != null && timeLeft <= 60;

  // Palette buckets (priority: marked > answered > seen > not-visited) and bands
  // (contiguous section groups, in paper order).
  const markedCount = questions.filter((qq) => marked.has(qq.questionId)).length;
  const answeredCount = questions.filter(
    (qq) => answered(qq.questionId) && !marked.has(qq.questionId),
  ).length;
  const seenCount = questions.filter(
    (qq) => !answered(qq.questionId) && !marked.has(qq.questionId) && seen.has(qq.questionId),
  ).length;
  const notVisitedCount = questions.length - markedCount - answeredCount - seenCount;

  const bands: { id: string; label: string | null; items: { qq: AttemptQuestion; i: number }[] }[] = [];
  questions.forEach((qq, i) => {
    const last = bands[bands.length - 1];
    if (last && last.id === qq.sectionId) last.items.push({ qq, i });
    else bands.push({ id: qq.sectionId, label: qq.sectionLabel, items: [{ qq, i }] });
  });
  const multiSection = bands.length > 1;
  const currentSubject = bands.find((b) => b.items.some((it) => it.i === index))?.label ?? null;
  const provenanceDetail = describeSourceSummary(provenance);
  const questionSource = formatQuestionSource(q.source, q.sourceYear);

  return (
    <div>
      {/* Sticky header — ONE bar carrying everything that must stay on screen:
          position, subject, and the clock. Screen space above the question is
          scarce (a 720px-tall laptop showed four stacked bands before the stem),
          so nothing else gets a band here — the question's source paper (#87) is
          a label on the Q-number row inside the card.

          NO negative top MARGIN — `-mt` + `sticky top-0` makes the pinned bar
          ride up and lets a strip of scrolling content peek above it (the
          "floating Question N/M" bug).

          The negative top OFFSET is different and necessary: sticky offsets are
          measured from the scrollport inset by the scroll container's padding,
          and this view renders inside ConsoleShell's `<main … py-6 sm:py-8>`
          (ConsoleShell.tsx:242). With plain `top-0` the bar parks 24/32px below
          the visible top and question content scrolls through the gap above it.
          `-top-6 sm:-top-8` cancels that padding so the bar pins flush to the
          top — keep these in step with main's py if it ever changes. */}
      <div className="bg-background sticky -top-6 z-30 mb-3 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b px-4 pt-4 pb-2 shadow-sm sm:-top-8 sm:-mx-6 sm:px-6">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Question {index + 1} / {questions.length}
          {currentSubject && <span className="text-muted-foreground"> · {currentSubject}</span>}
        </span>
        {timeLeft != null && (
          <span className={`text-sm font-semibold tabular-nums ${lowTime ? "text-destructive" : ""}`}>
            ⏱ {mm}:{ss}
          </span>
        )}
      </div>

      {notice}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        {/* Main column — question + actions + navigation. */}
        <div className="min-w-0">
          <Card>
            <CardContent className="grid gap-4 pt-6">
              {q.passage && (
                <div className="bg-muted/40 rounded border-l-4 p-3 text-sm">
                  {q.passage.title && <p className="font-semibold">{q.passage.title}</p>}
                  <RichContent content={q.passage.body} />
                </div>
              )}
              {/* min-w-0: a grid item defaults to min-width:auto, so a wide stem
                  table would stretch the whole card past the viewport instead of
                  scrolling inside its own box. */}
              <div className="flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-2 font-medium">
                <span className="text-primary bg-primary/10 h-fit shrink-0 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums">
                  Q{index + 1}
                </span>
                {/* The source paper (#87) rides the Q-number row — a label on the
                    question itself rather than another full-width band above it.
                    Emerald so it reads as reassurance, not as a warning. When it
                    is present the stem drops to its own full-width line (basis-full),
                    which also gives wide ICET tables the whole card on a phone. */}
                {questionSource && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{questionSource}</span>
                  </span>
                )}
                <div className={`min-w-0 flex-1 ${questionSource ? "basis-full" : ""}`}>
                  <RichContent content={q.stem} />
                </div>
              </div>
              {q.stemImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.stemImageUrl} alt="" className="max-h-60 rounded" />
              )}
              <div className="grid gap-2">
                {q.options.map((o) => {
                  const sel = (answers[q.questionId] ?? []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => onChoose(q, o.id)}
                      className={`flex items-start gap-3 rounded-md border p-3 text-left text-sm transition ${
                        sel ? "border-primary bg-primary/5" : "hover:border-primary/40"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                          sel ? "border-primary bg-primary text-primary-foreground" : ""
                        }`}
                      >
                        {sel ? "✓" : ""}
                      </span>
                      <RichContent content={o.label} inline />
                    </button>
                  );
                })}
              </div>
              {q.answerType === "multi" && (
                <p className="text-muted-foreground text-xs">More than one answer may be correct.</p>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onClear(q)}
                disabled={!answered(q.questionId)}
              >
                <Eraser /> Clear<span className="hidden sm:inline">&nbsp;response</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={marked.has(q.questionId)}
                onClick={() => onToggleMark(q.questionId)}
                className={
                  marked.has(q.questionId)
                    ? "border-violet-400 bg-violet-100 text-violet-700 hover:bg-violet-100 hover:text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-950/50"
                    : ""
                }
              >
                <Flag /> {marked.has(q.questionId) ? "Marked" : "Mark"}
                <span className="hidden sm:inline">&nbsp;for review</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <Button variant="outline" size="sm" disabled={index === 0} onClick={() => onGoTo(index - 1)}>
                Previous
              </Button>
              <Button
                size="sm"
                disabled={index === questions.length - 1}
                onClick={() => onGoTo(index + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* Palette sidebar. */}
        <aside className="mt-6 lg:sticky lg:top-20 lg:mt-0">
          {/* Paper-level provenance (#87). It lives here, not in a band above the
              question: beside the palette on a desktop it uses space that was
              empty, and on a phone it sits below the question where it costs the
              stem no room. The per-question source is in the sticky bar. */}
          {provenance.sourced > 0 && (
            <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <p className="flex items-center gap-1.5 font-medium">
                <FileText className="size-3.5 shrink-0" />
                <span className="tabular-nums">
                  {provenance.sourced} of {provenance.total}
                </span>
                from real past papers
              </p>
              {provenanceDetail && (
                <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                  {provenanceDetail}
                </p>
              )}
            </div>
          )}

          <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="size-3 shrink-0 rounded-sm bg-emerald-500" />
              <span className="font-semibold tabular-nums">{answeredCount}</span>
              <span className="text-muted-foreground">Answered</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="size-3 shrink-0 rounded-sm bg-violet-500" />
              <span className="font-semibold tabular-nums">{markedCount}</span>
              <span className="text-muted-foreground">Marked</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="size-3 shrink-0 rounded-sm border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40" />
              <span className="font-semibold tabular-nums">{seenCount}</span>
              <span className="text-muted-foreground">Seen</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="bg-muted size-3 shrink-0 rounded-sm border" />
              <span className="font-semibold tabular-nums">{notVisitedCount}</span>
              <span className="text-muted-foreground">Left</span>
            </div>
          </div>

          {multiSection && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={onToggleCollapseAll}
                className="text-primary text-xs font-medium hover:underline"
              >
                {collapsed.size >= bands.length ? "Expand all" : "Collapse all"}
              </button>
            </div>
          )}

          <div
            ref={paletteRef}
            className="bg-muted/30 max-h-[22rem] overflow-y-auto rounded-md border p-2 lg:max-h-[calc(100vh-16rem)]"
          >
            {bands.map((band) => {
              const hasCurrent = band.items.some((it) => it.i === index);
              const open = !multiSection || !collapsed.has(band.id) || hasCurrent;
              return (
                <div key={band.id}>
                  {multiSection && band.label && (
                    <button
                      type="button"
                      onClick={() => onToggleSection(band.id)}
                      aria-expanded={open}
                      className="bg-primary/10 text-primary border-primary sticky top-0 z-10 mb-2 flex w-full items-center justify-between gap-2 rounded-sm border-l-4 px-2 py-1.5 text-xs font-bold tracking-wide uppercase backdrop-blur"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ChevronDown
                          className={`size-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
                        />
                        <span className="truncate">{band.label}</span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums">
                        {band.items.filter(({ qq }) => answered(qq.questionId)).length}/{band.items.length}
                      </span>
                    </button>
                  )}
                  {open && (
                    <div className="mb-2 grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1.5">
                      {band.items.map(({ qq, i }) => {
                        const mk = marked.has(qq.questionId);
                        const ans = answered(qq.questionId);
                        const sn = seen.has(qq.questionId);
                        return (
                          <button
                            key={qq.questionId}
                            ref={i === index ? currentCellRef : null}
                            onClick={() => onGoTo(i)}
                            className={`relative flex aspect-square items-center justify-center rounded-md border text-xs font-medium tabular-nums transition ${
                              mk
                                ? "border-violet-500 bg-violet-500 text-white dark:border-violet-600 dark:bg-violet-600"
                                : ans
                                  ? "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600"
                                  : sn
                                    ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                    : "bg-background"
                            } ${i === index ? "ring-primary border-primary ring-2" : ""}`}
                          >
                            {i + 1}
                            {mk ? (
                              <span className="bg-background dark:bg-background absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full text-violet-600">
                                <Flag className="size-2.5" strokeWidth={3} />
                              </span>
                            ) : ans ? (
                              <span className="bg-background dark:bg-background absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full text-emerald-600">
                                <Check className="size-2.5" strokeWidth={3.5} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            onClick={onOpenConfirm}
            disabled={submitting}
            className="mt-3 w-full bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <CheckCircle2 /> {submitting ? "Submitting…" : submitLabel}
          </Button>
        </aside>
      </div>

      {/* Submit confirmation */}
      <Dialog open={confirmOpen} onOpenChange={(o) => (o ? onOpenConfirm() : onCloseConfirm())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{submitTitle}</DialogTitle>
          </DialogHeader>
          {(() => {
            const total = questions.length;
            const attempted = questions.filter((qq) => answered(qq.questionId)).length;
            const unanswered = total - attempted;
            const markedForReview = questions.filter((qq) => marked.has(qq.questionId)).length;
            const allDone = unanswered === 0;
            const pct = total ? Math.round((attempted / total) * 100) : 0;
            const rows = [
              { label: "Attempted", value: attempted, dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
              { label: "Marked for review", value: markedForReview, dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-400" },
              {
                label: "Unanswered",
                value: unanswered,
                dot: "bg-amber-500",
                text: unanswered > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
              },
            ];
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      allDone
                        ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                        : "flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                    }
                  >
                    {allDone ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
                  </span>
                  <p className="min-w-0 flex-1 text-sm">
                    {allDone ? (
                      <>
                        You&apos;ve answered <strong>every question</strong>.
                      </>
                    ) : (
                      <>
                        You still have{" "}
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {unanswered} unanswered
                        </span>
                        {markedForReview > 0 && (
                          <>
                            {" "}
                            and{" "}
                            <span className="font-semibold text-violet-700 dark:text-violet-400">
                              {markedForReview} marked for review
                            </span>
                          </>
                        )}
                        .
                      </>
                    )}
                  </p>
                </div>

                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="bg-muted/50 border-b">
                        <th scope="row" className="px-3 py-2 text-left font-semibold">
                          Total questions
                        </th>
                        <td className="px-3 py-2 text-right text-base font-bold tabular-nums">{total}</td>
                      </tr>
                      {rows.map((r) => (
                        <tr key={r.label} className="border-b last:border-b-0">
                          <th scope="row" className={`px-3 py-2 text-left font-medium ${r.text}`}>
                            <span className="flex items-center gap-2">
                              <span className={`size-2.5 shrink-0 rounded-full ${r.dot}`} />
                              {r.label}
                            </span>
                          </th>
                          <td className={`px-3 py-2 text-right text-base font-bold tabular-nums ${r.text}`}>
                            {r.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className={allDone ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-primary"}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <DialogDescription>
                  Once submitted, you can&apos;t change your answers.
                  {(unanswered > 0 || markedForReview > 0) && " Go back and review them if you're not sure."}
                </DialogDescription>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onCloseConfirm}>
              Go back &amp; review
            </Button>
            <Button disabled={submitting} onClick={onSubmit}>
              {submitting ? "Submitting…" : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
