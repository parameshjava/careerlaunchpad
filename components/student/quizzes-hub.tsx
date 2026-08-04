"use client";

// Student assessments hub: enrolled batches → the chapters whose quiz is unlocked
// (chapter completed + questions authored), each with attempts used/remaining and
// best score. "Take assessment" starts (or resumes) an attempt and routes to the
// runner. Reads /api/student/quizzes; starts via /api/student/quizzes/attempts.
//
// Deep link: ?chapter=<chapter_id> highlights that chapter's row and scrolls it
// into view, so the study plan on /student/insights can point at one specific
// assessment instead of dropping the student on the hub to hunt for it.
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Quiz = {
  chapter_id: string;
  chapter_name: string | null;
  subject_id: string;
  subject_name: string | null;
  attempts_used: number;
  attempts_remaining: number;
  best_pct: number | null;
  best_passed: boolean | null;
  question_count: number;
  available: boolean;
  resume_attempt_id: string | null;
};
type BatchQuizzes = { batchId: string; batchName: string; quizzes: Quiz[] };

export function QuizzesHub() {
  const router = useRouter();
  // The chapter the student arrived here for, if any (see the deep-link note above).
  const focusChapter = useSearchParams().get("chapter");
  const focusRef = useRef<HTMLLIElement | null>(null);
  const [batches, setBatches] = useState<BatchQuizzes[] | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  // A new take opens the instructions popup first; resume goes straight in.
  const [pending, setPending] = useState<{ batchId: string; quiz: Quiz } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/quizzes")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setBatches(d.batches ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scroll to the deep-linked row once the batches have loaded. Not smooth for
  // prefers-reduced-motion, and centred so the row isn't tucked under the navbar.
  useEffect(() => {
    if (!batches || !focusChapter || !focusRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    focusRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [batches, focusChapter]);

  function start(batchId: string, q: Quiz) {
    setError("");
    // Resume goes straight into the existing attempt (its timer is already running);
    // a fresh take shows the instructions popup first, then creates the attempt.
    if (q.resume_attempt_id) {
      router.push(`/student/quizzes/${q.resume_attempt_id}`);
      return;
    }
    setPending({ batchId, quiz: q });
  }

  async function beginNew() {
    if (!pending) return;
    setError("");
    setStarting(pending.quiz.chapter_id);
    try {
      const res = await fetch("/api/student/quizzes/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: pending.batchId, chapter_id: pending.quiz.chapter_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not start the assessment");
      router.push(`/student/quizzes/${json.attempt_id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(null);
      setPending(null);
    }
  }

  if (error && !batches)
    return (
      <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
        {error}
      </p>
    );
  if (batches === null)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );

  const withQuizzes = batches.filter((b) => b.quizzes.length > 0);
  if (withQuizzes.length === 0)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No assessments are unlocked yet. They appear here as your mentors complete chapters.
      </p>
    );

  return (
    <div className="grid gap-6">
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {withQuizzes.map((b) => (
        <Card key={b.batchId}>
          {/* The batch has to be unmistakable, not just a heading: a student in two
              batches sees the same chapter names under both, so an eyebrow labels
              what the grouping IS, and the count says how much is under it. */}
          <CardHeader className="gap-1">
            <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              Batch
            </p>
            <CardTitle className="text-base break-words">
              {b.batchName}
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                {b.quizzes.length} available
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {b.quizzes.map((q) => {
                const used = q.attempts_used;
                const canTake = q.available && (q.attempts_remaining > 0 || !!q.resume_attempt_id);
                const label = q.resume_attempt_id
                  ? "Resume"
                  : used > 0
                    ? "Retake"
                    : "Take assessment";
                const focused = q.chapter_id === focusChapter;
                return (
                  <li
                    key={q.chapter_id}
                    ref={focused ? focusRef : undefined}
                    className={`flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between${
                      focused ? " bg-primary/5 ring-primary/40 ring-2 ring-inset" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{q.chapter_name ?? "—"}</p>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span>{q.subject_name ?? ""}</span>
                        <span>· {used}/3 attempts</span>
                        {q.best_pct != null && (
                          <Badge variant={q.best_passed ? "default" : "secondary"}>
                            Best {Math.round(q.best_pct)}% · {q.best_passed ? "Pass" : "Fail"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {canTake ? (
                        <Button
                          size="sm"
                          disabled={starting === q.chapter_id}
                          onClick={() => start(b.batchId, q)}
                        >
                          {starting === q.chapter_id ? (
                            <>
                              <Loader2 className="size-4 animate-spin" /> Starting…
                            </>
                          ) : (
                            label
                          )}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {!q.available
                            ? "Not available yet"
                            : "No attempts left"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      {/* Pre-start instructions — shown before a fresh attempt (not on resume).
          Exam-style security warning; the timer only starts once they hit Start. */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.quiz.chapter_name ?? "Assessment"}</DialogTitle>
            <DialogDescription>
              {pending?.quiz.subject_name} · {Math.min(pending?.quiz.question_count ?? 0, 30)} questions
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="size-8 shrink-0" />
            <p className="text-xs leading-relaxed">
              Once you start, <strong>leaving this tab or window</strong> — switching tabs/apps or
              minimising — gives <strong>one warning</strong>; the next time your assessment is
              submitted automatically. You have <strong>30 minutes</strong>, and it also auto-submits
              when time runs out. Copying is disabled. You cannot pause once started.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={!!starting}>
              Cancel
            </Button>
            <Button onClick={beginNew} disabled={!!starting}>
              {starting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Starting…
                </>
              ) : (
                "Start assessment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
