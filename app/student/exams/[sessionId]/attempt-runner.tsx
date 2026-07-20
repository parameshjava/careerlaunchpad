"use client";

// The exam runner. On mount it calls start_exam_attempt (SECURITY DEFINER RPC),
// then caches the hydrated paper + answers in localStorage so navigation and
// answering survive brief disconnects. Answers autosave (debounced) via
// save_exam_answer; submit calls submit_exam_attempt. One question per screen
// (mobile-first) with a palette and a hard-stop countdown.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert, Printer } from "lucide-react";
import { NoTabSwitch } from "../no-tab-switch";
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

  // Anti-cheat: leaving the exam window (Alt+Tab / Cmd+Tab / app-switch /
  // minimise) fires window `blur` / `visibilitychange` — the only signal a web
  // page gets (the OS switch itself can't be blocked). First leave → warning;
  // second → auto-submit + no resume. A single switch fires BOTH events, so we
  // coalesce them within a short window (lastLeaveRef).
  const [strikes, setStrikes] = useState(0);
  const [warnOpen, setWarnOpen] = useState(false);
  const [closedForSwitch, setClosedForSwitch] = useState(false);
  const strikesRef = useRef(0);
  strikesRef.current = strikes;
  const lastLeaveRef = useRef(0);
  const suppressLeaveRef = useRef(false); // true briefly around window.print()

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

  const doSubmit = useCallback(async ({ redirect = true }: { redirect?: boolean } = {}) => {
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
    if (redirect) router.push(`/student/exams/${sessionId}/result`);
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

  // Anti-cheat: detect the student leaving the exam window. Active only while an
  // attempt is live. First leave warns; the second submits as-is and shows the
  // closed screen — start_exam_attempt won't re-hand a non-in_progress attempt,
  // so it can't be resumed.
  useEffect(() => {
    if (!attemptId || closedForSwitch) return;
    const registerLeave = () => {
      if (suppressLeaveRef.current) return;
      const now = Date.now();
      if (now - lastLeaveRef.current < 1500) return; // one switch fires blur+visibility → one strike
      lastLeaveRef.current = now;
      const n = strikesRef.current + 1;
      setStrikes(n);
      if (n >= 2) {
        setClosedForSwitch(true);
        doSubmit({ redirect: false });
      } else {
        setWarnOpen(true);
      }
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
  }, [attemptId, closedForSwitch, doSubmit]);

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

  if (closedForSwitch)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-destructive text-base font-semibold">Exam closed</p>
        <p className="text-muted-foreground mt-2 text-sm">
          You left the exam window after a warning. Your answers have been submitted
          automatically and this attempt cannot be resumed.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/student/exams")}>
          Back to my exams
        </Button>
      </div>
    );
  if (loading) return <p className="text-muted-foreground px-4 py-6 text-sm">Loading exam…</p>;
  const opensAtDate = meta?.opens_at ? new Date(meta.opens_at) : null;
  const opensInFuture = !!opensAtDate && opensAtDate.getTime() > Date.now();
  if (waiting)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
        {/* Fidget-spinner: 5 violet lobes + metallic bearings, spinning. */}
        <svg
          viewBox="0 0 100 100"
          className="size-20 animate-spin motion-reduce:animate-none"
          style={{ animationDuration: "0.9s" }}
          role="img"
          aria-label="Waiting for the exam to open"
        >
          <defs>
            <radialGradient id="cl-bearing" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="45%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#475569" />
            </radialGradient>
          </defs>
          {/* Body: central hub + 5 lobes, overlapping so they read as one piece. */}
          <g fill="#a78bfa">
            <circle cx="50" cy="22" r="15" />
            <circle cx="76.6" cy="41.4" r="15" />
            <circle cx="66.5" cy="72.7" r="15" />
            <circle cx="33.5" cy="72.7" r="15" />
            <circle cx="23.4" cy="41.4" r="15" />
            <circle cx="50" cy="50" r="20" />
          </g>
          {/* Metallic bearings on each lobe + the hub. */}
          <g fill="url(#cl-bearing)">
            <circle cx="50" cy="22" r="8" />
            <circle cx="76.6" cy="41.4" r="8" />
            <circle cx="66.5" cy="72.7" r="8" />
            <circle cx="33.5" cy="72.7" r="8" />
            <circle cx="23.4" cy="41.4" r="8" />
            <circle cx="50" cy="50" r="10" />
          </g>
          <circle cx="50" cy="50" r="4" fill="#a78bfa" />
        </svg>
        <p className="mt-6 text-base font-semibold">
          {opensInFuture
            ? `Exam will begin at ${opensAtDate!.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}`
            : "Your exam is being prepared"}
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Please wait — the question paper will open automatically. This screen updates
          every few seconds.
        </p>
        <div className="mt-4 flex max-w-sm items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <NoTabSwitch className="size-20 shrink-0" />
          <p className="text-xs leading-relaxed">
            Once the exam begins, moving away from this screen — switching tabs or apps,
            Alt+Tab / Cmd+Tab, or minimising — will submit your exam, for security reasons.
          </p>
        </div>
        <Button className="mt-6" variant="outline" onClick={() => router.push("/student/exams")}>
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
    <div
      className="mx-auto max-w-2xl px-4 py-4 select-none sm:px-6 print:hidden"
      // Copy disabled: block the copy/cut/context-menu events and non-selectable
      // text (select-none) so Ctrl/Cmd+C has nothing to lift.
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header: progress + timer */}
      <div className="bg-background sticky top-0 z-10 mb-4 flex items-center justify-between gap-4 border-b py-2">
        <span className="text-sm font-medium">
          Question {index + 1} / {questions.length}
        </span>
        <div className="flex items-center gap-3">
          {meta && (
            <Button
              size="sm"
              onClick={() => {
                // The OS print dialog blurs the window — don't count it as leaving.
                suppressLeaveRef.current = true;
                window.print();
                setTimeout(() => {
                  suppressLeaveRef.current = false;
                }, 2000);
              }}
            >
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

      {/* Anti-cheat notice — kept visible for the whole exam. */}
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>Stay on this screen.</strong> Pressing Alt+Tab or Cmd+Tab, switching
        apps, or minimising the window will close your exam. You get{" "}
        <strong>one warning</strong> — the next time, your exam is submitted
        automatically and <strong>cannot be resumed</strong>. Copying is disabled.
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit exam?</DialogTitle>
          </DialogHeader>
          {(() => {
            const answeredCount = questions.filter((qq) => answered(qq.question_id)).length;
            const total = questions.length;
            const unanswered = total - answeredCount;
            const allDone = unanswered === 0;
            const pct = total ? Math.round((answeredCount / total) * 100) : 0;
            return (
              <div className="flex items-start gap-3">
                <span
                  className={
                    allDone
                      ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                      : "flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                  }
                >
                  {allDone ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm">
                    You&apos;ve answered{" "}
                    <strong className="tabular-nums">
                      {answeredCount} of {total}
                    </strong>{" "}
                    questions
                    {unanswered > 0 && (
                      <>
                        {" "}
                        — <span className="font-medium text-amber-600 dark:text-amber-400">
                          {unanswered} still unanswered
                        </span>
                      </>
                    )}
                    .
                  </p>
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className={allDone ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-primary"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <DialogDescription>
                    Once submitted, you can&apos;t change your answers.
                  </DialogDescription>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back &amp; review
            </Button>
            <Button
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

      {/* First switch-away warning. The second leave auto-submits (see effect). */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ Don’t leave the exam</DialogTitle>
            <DialogDescription>
              You switched away from the exam window. This is your{" "}
              <strong>only warning</strong> — if you leave again (Alt+Tab, Cmd+Tab,
              switching apps, or minimising the window), your exam will be submitted
              automatically and you will not be able to resume.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setWarnOpen(false)}>I understand — continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    {meta && <StudentPaperPrint meta={meta} questions={questions} />}
    </>
  );
}
