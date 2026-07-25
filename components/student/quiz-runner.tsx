"use client";

// Chapter-quiz runner: loads the attempt's questions, tracks answers, autosaves
// (debounced), and submits for an immediate score. Time-bound (default 30 min,
// auto-submit on timeout) and integrity-guarded: leaving the tab auto-submits the
// attempt, so students take it responsibly. Reads/writes /api/student/quiz-attempts/[id].
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, TimerReset, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RichContent } from "@/components/exam/RichContent";

type Question = {
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
  const [questions, setQuestions] = useState<Question[] | null>(null);
  // answers keyed by question position → selected option ids
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [autoReason, setAutoReason] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false); // guards against double / re-entrant submit
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const url = `/api/student/quiz-attempts/${attemptId}`;

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
        const qs = (d.questions ?? []) as Question[];
        setQuestions(qs);
        setAnswers(Object.fromEntries(qs.map((q) => [q.position, q.selected ?? []])));
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
  }, [url]);

  const save = useCallback(
    (next: Record<number, string[]>) => {
      const payload = {
        answers: Object.entries(next).map(([position, option_ids]) => ({
          position: Number(position),
          option_ids,
        })),
      };
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [url],
  );

  function choose(q: Question, optionId: string) {
    if (result) return;
    setAnswers((prev) => {
      const cur = prev[q.position] ?? [];
      const nextSel =
        q.answerType === "single"
          ? [optionId]
          : cur.includes(optionId)
            ? cur.filter((id) => id !== optionId)
            : [...cur, optionId];
      const next = { ...prev, [q.position]: nextSel };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 700);
      return next;
    });
  }

  // Single finalize path used by the Submit button, the timer, and the tab-switch
  // guard. doneRef makes it idempotent; reads answersRef so it's stable.
  const finalize = useCallback(
    async (reason?: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (reason) setAutoReason(reason);
      setError("");
      setSubmitting(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: Object.entries(answersRef.current).map(([position, option_ids]) => ({
              position: Number(position),
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
        doneRef.current = false; // allow a retry on failure
      } finally {
        setSubmitting(false);
      }
    },
    [url],
  );

  // Countdown → auto-submit when time runs out.
  useEffect(() => {
    if (deadline == null || result) return;
    const tick = () => {
      const rem = deadline - Date.now();
      setRemaining(rem);
      if (rem <= 0) finalize("time");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, result, finalize]);

  // Integrity guard: leaving the tab (switch / minimize) auto-submits the attempt.
  useEffect(() => {
    if (result) return;
    const onHide = () => {
      if (document.hidden) finalize("tab");
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [result, finalize]);

  if (error && !questions)
    return (
      <div className="space-y-4">
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
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );

  if (result) {
    const pct = result.total_marks > 0 ? Math.round((100 * result.score) / result.total_marks) : 0;
    return (
      <div className="space-y-6">
        <div
          className={`rounded-2xl border p-6 text-center ${
            result.passed
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
          }`}
        >
          <div className="text-3xl font-bold">{result.passed ? "PASS" : "FAIL"}</div>
          <p className="mt-2 text-sm">
            You scored <b>{pct}%</b> ({result.score} / {result.total_marks}) · pass mark{" "}
            {result.pass_pct}%
          </p>
          {autoReason && (
            <p className="mt-2 text-xs font-medium">
              {autoReason === "tab"
                ? "Submitted automatically because you left the assessment tab."
                : "Submitted automatically — the 30-minute time limit ran out."}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/student/quizzes">Back to assessments</Link>
        </Button>
      </div>
    );
  }

  const answeredCount = Object.values(answers).filter((a) => a.length > 0).length;

  const secs = remaining == null ? null : Math.max(0, Math.floor(remaining / 1000));
  const clock = secs == null ? null : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const lowTime = secs != null && secs <= 60;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">Assessment</h1>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {answeredCount}/{questions.length} answered
          </span>
          {clock && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-semibold tabular-nums ${
                lowTime
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                  : "text-foreground"
              }`}
            >
              <TimerReset className="size-4" /> {clock}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          Stay on this tab — <b>switching tabs or leaving submits your assessment automatically</b>.
          You have 30 minutes; it auto-submits when time runs out.
        </span>
      </div>

      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {questions.map((q, i) => (
        <Card key={q.questionId}>
          <CardContent className="grid gap-3 pt-6">
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0 text-sm font-medium">Q{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <RichContent content={q.stem} />
                {q.stemImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.stemImageUrl} alt="" className="mt-2 max-h-64 max-w-full rounded-md border" />
                )}
                {q.answerType === "multi" && (
                  <p className="text-muted-foreground mt-1 text-xs">Select all that apply.</p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              {q.options.map((o) => {
                const sel = (answers[q.position] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => choose(q, o.id)}
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
                    <RichContent content={o.label} inline className="flex-1" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={() => finalize()} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Submitting…
            </>
          ) : (
            "Submit assessment"
          )}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/student/quizzes">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
