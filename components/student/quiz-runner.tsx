"use client";

// Chapter-quiz runner. Reuses the shared exam-style <AttemptView> (question-by-
// question + right-side number palette) so an assessment looks and behaves exactly
// like an exam. Adds the quiz specifics: a 30-minute countdown (auto-submit on
// timeout) and a one-warning tab-switch guard (leave once → warning, twice →
// auto-submit). Data via /api/student/quiz-attempts/[id]; grades inline.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttemptView, type AttemptQuestion } from "@/components/exam/attempt-view";

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
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [autoReason, setAutoReason] = useState("");
  const [error, setError] = useState("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);
  const answersRef = useRef(answers);
  const posByQid = useRef<Record<string, number>>({});
  const tabAwayRef = useRef(0);
  const lastLeaveRef = useRef(0); // coalesce blur+visibility from one switch into one strike
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
        setQuestions(qs);
        setAnswers(Object.fromEntries(api.map((q) => [q.questionId, q.selected ?? []])));
        if (qs[0]) setSeen(new Set([qs[0].questionId]));
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

  const persist = useCallback(
    (next: Record<string, string[]>) => {
      const payload = {
        answers: Object.entries(next).map(([qid, option_ids]) => ({
          position: posByQid.current[qid],
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

  function scheduleSave(next: Record<string, string[]>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 700);
  }

  function choose(q: AttemptQuestion, optionId: string) {
    if (result) return;
    setAnswers((prev) => {
      const cur = prev[q.questionId] ?? [];
      const nextSel =
        q.answerType === "single"
          ? [optionId]
          : cur.includes(optionId)
            ? cur.filter((id) => id !== optionId)
            : [...cur, optionId];
      const next = { ...prev, [q.questionId]: nextSel };
      scheduleSave(next);
      return next;
    });
    setSeen((s) => new Set(s).add(q.questionId));
  }

  function clearAnswer(q: AttemptQuestion) {
    if (result) return;
    setAnswers((prev) => {
      const next = { ...prev, [q.questionId]: [] };
      scheduleSave(next);
      return next;
    });
  }

  function goTo(i: number) {
    const q = questions?.[i];
    if (!q) return;
    setIndex(i);
    setSeen((s) => new Set(s).add(q.questionId));
  }

  function toggleMark(qid: string) {
    setMarked((m) => {
      const n = new Set(m);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
  }

  const finalize = useCallback(
    async (reason?: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (reason) setAutoReason(reason);
      setConfirmOpen(false);
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

  // Countdown → auto-submit at zero.
  useEffect(() => {
    if (deadline == null || result) return;
    const tick = () => {
      const rem = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(rem);
      if (rem <= 0) finalize("time");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, result, finalize]);

  // Integrity: leaving the assessment (switching tabs OR windows/apps, or
  // minimising) warns once, then auto-submits. Matches the exam — listen to BOTH
  // window blur and visibilitychange, coalescing the two events one switch fires.
  useEffect(() => {
    if (result) return;
    const registerLeave = () => {
      const now = Date.now();
      if (now - lastLeaveRef.current < 1500) return; // blur + visibility → one strike
      lastLeaveRef.current = now;
      tabAwayRef.current += 1;
      if (tabAwayRef.current >= 2) finalize("tab");
      else setWarnOpen(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") registerLeave();
    };
    window.addEventListener("blur", registerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", registerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [result, finalize]);

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
        <div
          className={`rounded-2xl border p-6 text-center ${
            result.passed
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
          }`}
        >
          <div className="text-3xl font-bold">{result.passed ? "PASS" : "FAIL"}</div>
          <p className="mt-2 text-sm">
            You scored <b>{pct}%</b> ({result.score} / {result.total_marks}) · pass mark {result.pass_pct}%
          </p>
          {autoReason && (
            <p className="mt-2 text-xs font-medium">
              {autoReason === "tab"
                ? "Submitted automatically — you left the assessment tab after a warning."
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

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-4 select-none sm:px-6"
      onCopy={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <AttemptView
        questions={questions}
        index={index}
        answers={answers}
        seen={seen}
        marked={marked}
        collapsed={new Set()}
        timeLeft={timeLeft}
        submitting={submitting}
        confirmOpen={confirmOpen}
        submitLabel="Submit assessment"
        submitTitle="Submit assessment?"
        notice={
          <details className="group mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
              <TriangleAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Stay on this tab — leaving submits your assessment (one warning only). 30-minute limit.
              </span>
              <span className="shrink-0 underline group-open:hidden">Details</span>
              <span className="hidden shrink-0 underline group-open:inline">Less</span>
            </summary>
            <div className="mt-2 leading-relaxed">
              Switching tabs, apps or minimising the window gives <strong>one warning</strong> — the
              next time, your assessment is submitted automatically. You have{" "}
              <strong>30 minutes</strong>; it also auto-submits when time runs out. Copying is disabled.
            </div>
          </details>
        }
        onChoose={choose}
        onGoTo={goTo}
        onClear={clearAnswer}
        onToggleMark={toggleMark}
        onToggleSection={() => {}}
        onToggleCollapseAll={() => {}}
        onOpenConfirm={() => setConfirmOpen(true)}
        onCloseConfirm={() => setConfirmOpen(false)}
        onSubmit={() => finalize()}
      />

      {/* First switch-away warning; the second leave auto-submits. */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Don&apos;t leave the assessment</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <TriangleAlert className="size-5" />
            </span>
            <DialogDescription className="flex-1">
              You switched away from the assessment. This is your{" "}
              <strong className="text-foreground font-medium">only warning</strong> — if you leave again
              (switching tabs or apps, or minimising), your assessment will be submitted automatically.
            </DialogDescription>
          </div>
          <DialogFooter>
            <Button onClick={() => setWarnOpen(false)}>I understand — continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
