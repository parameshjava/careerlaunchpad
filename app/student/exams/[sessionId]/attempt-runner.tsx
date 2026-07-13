"use client";

// The exam runner. On mount it calls start_exam_attempt (SECURITY DEFINER RPC),
// then caches the hydrated paper + answers in localStorage so navigation and
// answering survive brief disconnects. Answers autosave (debounced) via
// save_exam_answer; submit calls submit_exam_attempt. One question per screen
// (mobile-first) with a palette and a hard-stop countdown.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RichContent } from "@/components/exam/RichContent";
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
import { StudentPaperPrint, type SessionPrintMeta } from "./paper-print";

type Option = { id: string; label: string };
export type Question = {
  position: number;
  question_id: string;
  section_id: string;
  kind: string;
  answer_type: "single" | "multi";
  stem: string;
  stem_image_url: string | null;
  passage: { title: string | null; body: string } | null;
  options: Option[];
  selected_option_ids: string[];
};
type Cache = {
  attemptId: string;
  durationMinutes: number;
  deadline: number;
  questions: Question[];
  answers: Record<string, string[]>;
};

export function AttemptRunner({
  sessionId,
  meta,
}: {
  sessionId: string;
  meta: SessionPrintMeta | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const cacheKey = `cl-exam-${sessionId}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Set while the exam hasn't opened / the paper isn't generated yet — the
  // runner keeps polling start_exam_attempt every 5s until it succeeds.
  const [waiting, setWaiting] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [index, setIndex] = useState(0);
  // Palette pagination — 10 numbers per page so 60+ question papers don't bury
  // the question under rows of buttons on phones. Follows the current question.
  const PALETTE_PAGE = 10;
  const [palettePage, setPalettePage] = useState(0);
  useEffect(() => {
    setPalettePage(Math.floor(index / PALETTE_PAGE));
  }, [index]);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Manual submit goes through a confirmation dialog (accidental-tap guard);
  // the deadline auto-submit calls doSubmit directly.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latest answers, readable inside doSubmit without making it depend on `answers`
  // (which would re-create the countdown effect on every keystroke).
  const answersRef = useRef<Record<string, string[]>>({});
  answersRef.current = answers;

  const persist = useCallback(
    (next: Partial<Cache>) => {
      try {
        const prev = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
        localStorage.setItem(cacheKey, JSON.stringify({ ...prev, ...next }));
      } catch {
        /* storage full / unavailable — non-fatal */
      }
    },
    [cacheKey],
  );

  // Start (or resume) the attempt.
  useEffect(() => {
    let cancelled = false;
    // Hydrate from cache first so a flaky network still shows the paper.
    let cached: Cache | null = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) cached = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (cached?.questions?.length) {
      setAttemptId(cached.attemptId);
      setQuestions(cached.questions);
      setAnswers(cached.answers ?? {});
      setDeadline(cached.deadline ?? null);
      setLoading(false);
    }

    let retry: ReturnType<typeof setTimeout>;
    const tryStart = async () => {
      const { data, error: rpcErr } = await supabase.rpc("start_exam_attempt", {
        p_session_id: sessionId,
      });
      if (cancelled) return;
      if (rpcErr) {
        // Not open yet / not opened by staff / paper not generated yet → poll
        // every 5s until it is (server releases from 1 min before the scheduled
        // start, and only once staff have set the sitting to "open").
        if (!cached && /not open(ed)?|no paper/i.test(rpcErr.message)) {
          setWaiting(rpcErr.message);
          setLoading(false);
          retry = setTimeout(tryStart, 5_000);
          return;
        }
        if (!cached) setError(rpcErr.message);
        setLoading(false);
        return;
      }
      setWaiting("");
      const payload = data as {
        attempt_id: string;
        duration_minutes: number;
        ends_at?: string;
        questions: Question[];
      };
      const serverAnswers: Record<string, string[]> = {};
      for (const q of payload.questions) serverAnswers[q.question_id] = q.selected_option_ids ?? [];
      // Server-authoritative deadline (duration clamped to the session close);
      // fall back to the cached value (offline) or a duration-from-now estimate.
      const dl = payload.ends_at
        ? new Date(payload.ends_at).getTime()
        : (cached?.deadline ?? Date.now() + payload.duration_minutes * 60_000);
      setAttemptId(payload.attempt_id);
      setQuestions(payload.questions);
      setAnswers((local) => ({ ...serverAnswers, ...local })); // local edits win over server
      setDeadline(dl);
      setLoading(false);
      persist({
        attemptId: payload.attempt_id,
        durationMinutes: payload.duration_minutes,
        deadline: dl,
        questions: payload.questions,
      });
    };
    tryStart();

    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const doSubmit = useCallback(async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    // Flush any pending debounced saves so a last-second answer (or one changed
    // within the 800ms window before tapping Submit) is persisted BEFORE grading.
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    try {
      await Promise.all(
        Object.entries(answersRef.current).map(([qid, sel]) =>
          supabase.rpc("save_exam_answer", {
            p_attempt_id: attemptId,
            p_question_id: qid,
            p_selected: sel,
          }),
        ),
      );
    } catch {
      /* non-fatal — grading uses whatever persisted */
    }
    const { error: subErr } = await supabase.rpc("submit_exam_attempt", { p_attempt_id: attemptId });
    if (subErr) {
      setError(subErr.message);
      setSubmitting(false);
      return;
    }
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      /* ignore */
    }
    router.push(`/student/exams/${sessionId}/result`);
  }, [attemptId, submitting, supabase, cacheKey, router, sessionId]);

  // Countdown → hard auto-submit at zero.
  useEffect(() => {
    if (deadline == null) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) doSubmit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline, doSubmit]);

  function scheduleSave(questionId: string, selected: string[]) {
    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      supabase
        .rpc("save_exam_answer", {
          p_attempt_id: attemptId,
          p_question_id: questionId,
          p_selected: selected,
        })
        .then(({ error: saveErr }) => {
          // Autosave failures are non-fatal — the answer stays cached and is
          // re-sent on the next change / final submit. Surface quietly.
          if (saveErr) console.warn("autosave failed", saveErr.message);
        });
    }, 800);
  }

  // Persist any answers still sitting in the debounce window, then navigate —
  // moving between questions never leaves an unsaved answer behind.
  const goTo = useCallback(
    (i: number) => {
      for (const qid of Object.keys(saveTimers.current)) {
        clearTimeout(saveTimers.current[qid]);
        supabase
          .rpc("save_exam_answer", {
            p_attempt_id: attemptId,
            p_question_id: qid,
            p_selected: answersRef.current[qid] ?? [],
          })
          .then(({ error: saveErr }) => {
            if (saveErr) console.warn("autosave failed", saveErr.message);
          });
      }
      saveTimers.current = {};
      setIndex(i);
    },
    [attemptId, supabase],
  );

  function choose(q: Question, optionId: string) {
    setAnswers((prev) => {
      const cur = prev[q.question_id] ?? [];
      let next: string[];
      if (q.answer_type === "single") next = [optionId];
      else next = cur.includes(optionId) ? cur.filter((id) => id !== optionId) : [...cur, optionId];
      const updated = { ...prev, [q.question_id]: next };
      persist({ answers: updated });
      scheduleSave(q.question_id, next);
      return updated;
    });
  }

  if (loading) return <p className="text-muted-foreground px-4 py-6 text-sm">Loading exam…</p>;
  if (waiting)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm font-medium">{waiting}</p>
        <p className="text-muted-foreground mt-2 text-xs">
          Checking again every 5 seconds — the paper unlocks 1 minute before the scheduled start.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/student/exams")}>
          Back to my exams
        </Button>
      </div>
    );
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/student/exams")}>
          Back to my exams
        </Button>
      </div>
    );

  const q = questions[index];
  const answered = (qid: string) => (answers[qid]?.length ?? 0) > 0;
  const mm = timeLeft != null ? String(Math.floor(timeLeft / 60)).padStart(2, "0") : "--";
  const ss = timeLeft != null ? String(timeLeft % 60).padStart(2, "0") : "--";
  const lowTime = timeLeft != null && timeLeft <= 60;

  return (
    <>
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 print:hidden">
      {/* Header: progress + timer */}
      <div className="bg-background sticky top-0 z-10 mb-4 flex items-center justify-between gap-4 border-b py-2">
        <span className="text-sm font-medium">
          Question {index + 1} / {questions.length}
        </span>
        <div className="flex items-center gap-3">
          {meta && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          )}
          <span
            className={`tabular-nums text-sm font-semibold ${lowTime ? "text-destructive" : ""}`}
          >
            ⏱ {mm}:{ss}
          </span>
        </div>
      </div>

      {/* Palette — paginated in blocks of 10 with ‹ › arrows */}
      <div className="mb-4 flex items-center gap-1.5">
        <button
          onClick={() => setPalettePage((p) => p - 1)}
          disabled={palettePage === 0}
          aria-label="Previous questions"
          className="bg-muted size-8 shrink-0 rounded text-sm font-medium disabled:opacity-40"
        >
          ‹
        </button>
        <div className="flex flex-1 flex-wrap justify-center gap-1.5">
          {questions
            .slice(palettePage * PALETTE_PAGE, (palettePage + 1) * PALETTE_PAGE)
            .map((qq, offset) => {
              const i = palettePage * PALETTE_PAGE + offset;
              return (
                <button
                  key={qq.question_id}
                  onClick={() => goTo(i)}
                  className={`size-8 rounded text-xs font-medium ${
                    i === index
                      ? "bg-primary text-primary-foreground"
                      : answered(qq.question_id)
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-muted"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
        </div>
        <button
          onClick={() => setPalettePage((p) => p + 1)}
          disabled={(palettePage + 1) * PALETTE_PAGE >= questions.length}
          aria-label="Next questions"
          className="bg-muted size-8 shrink-0 rounded text-sm font-medium disabled:opacity-40"
        >
          ›
        </button>
      </div>

      {/* Question */}
      <Card>
        <CardContent className="grid gap-4 pt-6">
          {q.passage && (
            <div className="bg-muted/40 rounded border-l-4 p-3 text-sm">
              {q.passage.title && <p className="font-semibold">{q.passage.title}</p>}
              <RichContent content={q.passage.body} />
            </div>
          )}
          <div className="font-medium">
            <RichContent content={q.stem} />
          </div>
          {q.stem_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.stem_image_url} alt="" className="max-h-60 rounded" />
          )}
          <div className="grid gap-2">
            {q.options.map((o) => {
              const sel = (answers[q.question_id] ?? []).includes(o.id);
              return (
                <button
                  key={o.id}
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
                  <RichContent content={o.label} inline />
                </button>
              );
            })}
          </div>
          {q.answer_type === "multi" && (
            <p className="text-muted-foreground text-xs">More than one answer may be correct.</p>
          )}
        </CardContent>
      </Card>

      {/* Navigation — Next is disabled (not swapped for Submit) on the last
          question so a habitual tap can't accidentally end the exam. */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Previous
        </Button>
        <div className="flex items-center gap-2">
          {index === questions.length - 1 && (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit exam"}
            </Button>
          )}
          <Button disabled={index === questions.length - 1} onClick={() => goTo(index + 1)}>
            Next
          </Button>
        </div>
      </div>

      {/* Submit confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit exam?</DialogTitle>
            <DialogDescription>
              You have answered {questions.filter((qq) => answered(qq.question_id)).length} of{" "}
              {questions.length} questions. Once submitted, you cannot change your answers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back &amp; review
            </Button>
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={() => {
                setConfirmOpen(false);
                doSubmit();
              }}
            >
              {submitting ? "Submitting…" : "Submit exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    {meta && <StudentPaperPrint meta={meta} questions={questions} />}
    </>
  );
}
