"use client";

// Chapter-quiz runner. A thin surface over the shared quiz engine + <AttemptView>,
// so an assessment looks and behaves exactly like an exam (question-by-question,
// right-side number palette, 30-minute hard-stop countdown, one-warning tab-switch
// guard). This file is just the assessment's data layer: load the paper, autosave
// answers, and submit — everything interactive lives in useQuizEngine.
// Data via /api/student/quiz-attempts/[id]; grades inline.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttemptView, type AttemptQuestion } from "@/components/exam/attempt-view";
import { useQuizEngine } from "@/components/quiz/use-quiz-engine";
import { LeaveWarningDialog } from "@/components/quiz/leave-warning-dialog";

type ApiQuestion = {
  position: number;
  questionId: string;
  stem: string;
  stemImageUrl: string | null;
  answerType: "single" | "multi";
  options: { id: string; label: string }[];
  selected: string[];
};
type Result = { score: number; total_marks: number; passed: boolean; pass_pct: number };

export function QuizRunner({ attemptId }: { attemptId: string }) {
  const [questions, setQuestions] = useState<AttemptQuestion[] | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [autoReason, setAutoReason] = useState("");
  const [error, setError] = useState("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);
  const answersRef = useRef<Record<string, string[]>>({});
  const posByQid = useRef<Record<string, number>>({});

  const url = `/api/student/quiz-attempts/${attemptId}`;

  // Persist the whole answer set (debounced). The assessment saves all answers in
  // one PATCH rather than per-question, keyed by position.
  const persist = useCallback(
    (next: Record<string, string[]>) => {
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(next).map(([qid, option_ids]) => ({
            position: posByQid.current[qid],
            option_ids,
          })),
        }),
      }).catch(() => {});
    },
    [url],
  );

  // Submit: flush answers, grade, and show the result. Guarded so the timeout, the
  // second leave-strike, and a manual tap can't double-submit.
  const finalize = useCallback(
    async (reason: "manual" | "time" | "tab") => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (reason !== "manual") setAutoReason(reason);
      setError("");
      setSubmitting(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: Object.entries(answersRef.current).map(([qid, option_ids]) => ({
              position: posByQid.current[qid],
              option_ids,
            })),
          }),
        });
        const res = await fetch(`${url}/submit`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Could not submit");
        setResult(json as Result);
      } catch (e) {
        setError((e as Error).message);
        doneRef.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [url],
  );

  const engine = useQuizEngine({
    questions: questions ?? [],
    active: !!questions && !result,
    deadline,
    onAnswerChange: (all) => {
      answersRef.current = all;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(all), 700);
    },
    submit: finalize,
  });
  const { hydrate } = engine;

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
          return;
        }
        const api = (d.questions ?? []) as ApiQuestion[];
        const qs: AttemptQuestion[] = api.map((q) => ({
          position: q.position,
          questionId: q.questionId,
          sectionId: "quiz", // single section — no accordion in the palette
          sectionLabel: null,
          answerType: q.answerType,
          stem: q.stem,
          stemImageUrl: q.stemImageUrl,
          passage: null,
          options: q.options,
        }));
        posByQid.current = Object.fromEntries(qs.map((q) => [q.questionId, q.position]));
        const loaded = Object.fromEntries(api.map((q) => [q.questionId, q.selected ?? []]));
        answersRef.current = loaded;
        setQuestions(qs);
        hydrate({ answers: loaded });
        if (d.startedAt && d.durationMinutes) {
          setDeadline(new Date(d.startedAt).getTime() + d.durationMinutes * 60000);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url, hydrate]);

  if (error && !questions)
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
          {error}
        </p>
        <Button variant="outline" asChild>
          <Link href="/student/quizzes">Back to assessments</Link>
        </Button>
      </div>
    );
  if (questions === null)
    return (
      <p className="text-muted-foreground mx-auto flex max-w-2xl items-center gap-2 px-4 py-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );

  if (result) {
    const pct = result.total_marks > 0 ? Math.round((100 * result.score) / result.total_marks) : 0;
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {autoReason && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {autoReason === "time"
              ? "Time's up — your assessment was submitted automatically."
              : "You left the assessment after a warning — it was submitted automatically."}
          </p>
        )}
        <div className="bg-card rounded-2xl border p-6 text-center shadow-sm">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Your score
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums">
            {result.score}
            <span className="text-muted-foreground text-2xl"> / {result.total_marks}</span>
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums">{pct}%</p>
          <p
            className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${
              result.passed
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
            }`}
          >
            {result.passed ? "Passed" : "Not passed"} · pass mark {result.pass_pct}%
          </p>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link href="/student/quizzes">Back to assessments</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-4 select-none sm:px-6"
      onCopy={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <AttemptView
        questions={questions}
        index={engine.index}
        answers={engine.answers}
        seen={engine.seen}
        marked={engine.marked}
        collapsed={engine.collapsed}
        timeLeft={engine.timeLeft}
        submitting={submitting}
        confirmOpen={engine.confirmOpen}
        submitLabel="Submit assessment"
        submitTitle="Submit assessment?"
        notice={
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Stay on this screen — switching tabs/apps or minimising gives{" "}
              <strong>one warning</strong>, then auto-submits. Copying is disabled.
            </span>
          </div>
        }
        onChoose={engine.onChoose}
        onGoTo={engine.onGoTo}
        onClear={engine.onClear}
        onToggleMark={engine.onToggleMark}
        onToggleSection={engine.onToggleSection}
        onToggleCollapseAll={engine.onToggleCollapseAll}
        onOpenConfirm={engine.onOpenConfirm}
        onCloseConfirm={engine.onCloseConfirm}
        onSubmit={engine.onSubmit}
      />

      {/* First switch-away warning; the second leave auto-submits (see the engine). */}
      <LeaveWarningDialog
        open={engine.warnOpen}
        onOpenChange={engine.setWarnOpen}
        title="Don't leave the assessment"
      >
        You switched away from the assessment. This is your{" "}
        <strong className="text-foreground font-medium">only warning</strong> — if you leave again
        (Alt+Tab, Cmd+Tab, switching apps, or minimising), your assessment will be submitted
        automatically.
      </LeaveWarningDialog>
    </div>
  );
}
