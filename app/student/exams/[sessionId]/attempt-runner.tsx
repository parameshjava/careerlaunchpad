"use client";

// The exam runner. On mount it calls start_exam_attempt (SECURITY DEFINER RPC),
// then caches the hydrated paper + answers in localStorage so navigation and
// answering survive brief disconnects. Answers autosave (debounced) via
// save_exam_answer; submit calls submit_exam_attempt.
//
// All the interactive behaviour — one question per screen, the palette, the
// countdown, and the Alt+Tab / Cmd+Tab leave guard — lives in the shared
// useQuizEngine (so exams, assessments, and future mock tests behave identically).
// This file is the exam's data layer: start/resume, localStorage cache, per-answer
// autosave, the abort-on-second-leave flow, the waiting/closed screens, and print
// blocking.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { WarningSign } from "../warning-sign";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format-date";
import { AttemptView, type AttemptQuestion } from "@/components/exam/attempt-view";
import { useQuizEngine } from "@/components/quiz/use-quiz-engine";
import { type SessionPrintMeta } from "./paper-print";

type Option = { id: string; label: string };
export type Question = {
  position: number;
  question_id: string;
  section_id: string;
  section_title: string | null;
  section_position: number | null;
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
  seen: string[];
  // Questions the student flagged with "Mark for review". Persisted like `seen`
  // (localStorage only) so it survives a plain reload; an aborted attempt clears
  // the cache, exactly as seen does.
  marked: string[];
  lastPosition: number;
};

// Emphasised keyboard-shortcut chip for the anti-cheat notices (amber context).
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block rounded border border-amber-400/70 bg-amber-100 px-1.5 py-0.5 font-mono text-[0.7rem] font-bold whitespace-nowrap text-amber-900 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-100">
      {children}
    </kbd>
  );
}

// Waiting-screen countdown: HH:MM:SS, or "Nd HHh MMm" once it's more than a day.
function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

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
  const [deadline, setDeadline] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // null while live; set when the anti-cheat closes the paper. `final` = graded
  // (no resumes left); otherwise the attempt is `aborted` and recoverable.
  const [abortInfo, setAbortInfo] = useState<{ final: boolean; resumeCount: number } | null>(null);

  const lastPositionRef = useRef<number | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latest answers, readable inside doSubmit / the abort flow without depending on
  // the engine's reactive state. Kept in sync by the adapter + the loader.
  const answersRef = useRef<Record<string, string[]>>({});

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

  // Map the exam's questions into the shared AttemptView shape, resolving each
  // section's label from the payload, else meta.sections in paper order.
  const attemptQuestions: AttemptQuestion[] = useMemo(() => {
    const bands: { id: string; title: string | null; items: Question[] }[] = [];
    questions.forEach((qq) => {
      const last = bands[bands.length - 1];
      if (last && last.id === qq.section_id) last.items.push(qq);
      else bands.push({ id: qq.section_id, title: qq.section_title, items: [qq] });
    });
    const labelByQid = new Map<string, string | null>();
    bands.forEach((b, bi) => {
      const label = b.title ?? meta?.sections[bi]?.subject ?? null;
      b.items.forEach((qq) => labelByQid.set(qq.question_id, label));
    });
    return questions.map((qq) => ({
      position: qq.position,
      questionId: qq.question_id,
      sectionId: qq.section_id,
      sectionLabel: labelByQid.get(qq.question_id) ?? null,
      answerType: qq.answer_type,
      stem: qq.stem,
      stemImageUrl: qq.stem_image_url,
      passage: qq.passage,
      options: qq.options,
    }));
  }, [questions, meta]);

  // Autosave a single answer (debounced 800ms per question).
  const scheduleSave = useCallback(
    (questionId: string, selected: string[]) => {
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
    },
    [attemptId, supabase],
  );

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

  // Second leave strike: flush answers-so-far, then abort (recoverable) or finalise
  // if resumes are spent. start_exam_attempt won't re-hand a non-in_progress
  // attempt, so a `final` abort can't be resumed.
  const abortForLeave = useCallback(async () => {
    if (!attemptId) return;
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
      /* non-fatal — abort uses whatever persisted */
    }
    const { data, error: e } = await supabase.rpc("abort_exam_attempt", { p_attempt_id: attemptId });
    if (e) {
      setError(e.message);
      return;
    }
    const info = (data as { final?: boolean; resume_count?: number }) ?? {};
    setAbortInfo({ final: !!info.final, resumeCount: info.resume_count ?? 0 });
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      /* ignore */
    }
  }, [attemptId, supabase, cacheKey]);

  const engine = useQuizEngine({
    questions: attemptQuestions,
    active: !!attemptId && !abortInfo,
    deadline,
    onAnswerChange: (all, questionId, selected) => {
      answersRef.current = all;
      persist({ answers: all });
      scheduleSave(questionId, selected);
    },
    onNavigate: (i) => {
      // Persist any answers still in the debounce window before navigating —
      // moving between questions never leaves an unsaved answer behind.
      for (const qid of Object.keys(saveTimers.current)) {
        clearTimeout(saveTimers.current[qid]);
        supabase
          .rpc("save_exam_answer", {
            p_attempt_id: attemptId,
            p_question_id: qid,
            p_selected: answersRef.current[qid] ?? [],
          })
          .then(({ error: e }) => {
            if (e) console.warn("autosave failed", e.message);
          });
      }
      saveTimers.current = {};
      // Persist the cursor so a resume lands exactly here (server = durable across
      // abort/device; cache = instant restore on a plain reload).
      lastPositionRef.current = i;
      persist({ lastPosition: i });
      supabase.rpc("save_exam_position", { p_attempt_id: attemptId, p_position: i }).then(({ error: e }) => {
        if (e) console.warn("save_exam_position failed", e.message);
      });
    },
    onSeenChange: (seen) => persist({ seen }),
    onMarkedChange: (marked) => persist({ marked }),
    onLeaveRecorded: () => {
      // Persist the switch-away for staff (Alt-Tab metric). Fire-and-forget.
      supabase.rpc("record_exam_leave", { p_attempt_id: attemptId }).then(({ error: e }) => {
        if (e) console.warn("record_exam_leave failed", e.message);
      });
    },
    submit: doSubmit,
    onSecondLeave: abortForLeave,
  });
  const { hydrate, suppressLeaveRef } = engine;

  // Ticking clock for the waiting-screen countdown (1s cadence, only while the
  // student is on the waiting screen).
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

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
      const cachedAnswers = cached.answers ?? {};
      answersRef.current = cachedAnswers;
      setAttemptId(cached.attemptId);
      setQuestions(cached.questions);
      setDeadline(cached.deadline ?? null);
      if (cached.lastPosition != null) lastPositionRef.current = cached.lastPosition;
      hydrate({
        answers: cachedAnswers,
        seen: cached.seen ?? [],
        marked: cached.marked ?? [],
        index: cached.lastPosition ?? undefined,
      });
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
        last_position?: number | null;
        questions: Question[];
      };
      // Server cursor wins over a stale cache (e.g. resumed on another device).
      if (payload.last_position != null) lastPositionRef.current = payload.last_position;
      const serverAnswers: Record<string, string[]> = {};
      for (const q of payload.questions) serverAnswers[q.question_id] = q.selected_option_ids ?? [];
      // Local edits win over the server copy (matches the engine's merge).
      answersRef.current = { ...serverAnswers, ...answersRef.current };
      // Server-authoritative deadline (duration clamped to the session close);
      // fall back to the cached value (offline) or a duration-from-now estimate.
      const dl = payload.ends_at
        ? new Date(payload.ends_at).getTime()
        : (cached?.deadline ?? Date.now() + payload.duration_minutes * 60_000);
      // Restore the cursor: persisted last_position, else the first unanswered
      // question, else Q1.
      let restoreIndex = lastPositionRef.current ?? 0;
      if (!(restoreIndex > 0 && restoreIndex < payload.questions.length)) {
        const firstUnanswered = payload.questions.findIndex(
          (qq) => !(answersRef.current[qq.question_id]?.length),
        );
        restoreIndex = firstUnanswered > 0 ? firstUnanswered : 0;
      }
      setAttemptId(payload.attempt_id);
      setQuestions(payload.questions);
      setDeadline(dl);
      setLoading(false);
      hydrate({ answers: serverAnswers, index: restoreIndex });
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

  // Printing is disabled during an attempt (the paper is print:hidden with no
  // print-visible component). Block the Ctrl/Cmd+P shortcut so no dialog opens,
  // and — for a forced print via the browser menu — suppress the print-dialog
  // blur so it can't be mistaken for leaving the exam (which would strike the
  // student). `beforeprint` fires before that blur, so the guard is set in time.
  useEffect(() => {
    if (!attemptId || abortInfo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") e.preventDefault();
    };
    const onBeforePrint = () => {
      suppressLeaveRef.current = true;
    };
    const onAfterPrint = () => {
      suppressLeaveRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [attemptId, abortInfo, suppressLeaveRef]);

  if (abortInfo)
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-destructive text-base font-semibold">Exam closed</p>
        <p className="text-muted-foreground mt-2 text-sm">
          {abortInfo.final ? (
            <>You left the exam window again. Your answers have been submitted automatically and this attempt cannot be resumed.</>
          ) : abortInfo.resumeCount === 0 ? (
            <>You left the exam window after a warning, so the exam was closed. You can reopen it <strong>once</strong> yourself from My exams — do it now to continue where you left off.</>
          ) : (
            <>You left the exam window after a warning, so the exam was closed. Please <strong>ask your administrator</strong> to let you resume.</>
          )}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/student/exams")}>
          Back to my exams
        </Button>
      </div>
    );
  if (loading) return <p className="text-muted-foreground px-4 py-6 text-sm">Loading exam…</p>;
  const opensAtDate = meta?.opens_at ? new Date(meta.opens_at) : null;
  const remainingMs = opensAtDate ? opensAtDate.getTime() - nowTs : 0;
  const opensInFuture = !!opensAtDate && remainingMs > 0;
  if (waiting)
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="bg-card relative overflow-hidden rounded-3xl border p-8 text-center shadow-xl shadow-[#7c3aed]/10">
          {/* Brand accent bar across the top. */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#2563eb] to-[#7c3aed]" />

          {/* Spinner on a soft brand halo. */}
          <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb]/10 to-[#7c3aed]/10">
            <svg
              viewBox="0 0 100 100"
              className="size-14"
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
              {/* Spinning rim: the 5 lobes + their bearings, rotating about the
                  fixed centre (transform-box view-box → origin = viewBox centre). */}
              <g
                className="animate-spin motion-reduce:animate-none"
                style={{ transformBox: "view-box", transformOrigin: "center", animationDuration: "0.9s" }}
              >
                <g fill="#a78bfa">
                  <circle cx="50" cy="22" r="15" />
                  <circle cx="76.6" cy="41.4" r="15" />
                  <circle cx="66.5" cy="72.7" r="15" />
                  <circle cx="33.5" cy="72.7" r="15" />
                  <circle cx="23.4" cy="41.4" r="15" />
                </g>
                <g fill="url(#cl-bearing)">
                  <circle cx="50" cy="22" r="8" />
                  <circle cx="76.6" cy="41.4" r="8" />
                  <circle cx="66.5" cy="72.7" r="8" />
                  <circle cx="33.5" cy="72.7" r="8" />
                  <circle cx="23.4" cy="41.4" r="8" />
                </g>
              </g>
              {/* Fixed centre hub + bearing + dot — stays put, so it reads as a
                  true wheel rather than the whole thing tumbling. */}
              <circle cx="50" cy="50" r="20" fill="#a78bfa" />
              <circle cx="50" cy="50" r="10" fill="url(#cl-bearing)" />
              <circle cx="50" cy="50" r="4" fill="#a78bfa" />
            </svg>
          </div>

          {/* Exam title. */}
          <h1 className="mt-5 text-lg font-bold tracking-tight">
            {meta?.exam_title ?? "Your exam"}
          </h1>

          {/* Live countdown, or "being prepared" once the start time has passed. */}
          {opensInFuture ? (
            <>
              <p className="text-muted-foreground mt-5 text-xs font-semibold tracking-widest uppercase">
                Starts in
              </p>
              <p className="mt-1 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text font-mono text-4xl font-bold tabular-nums text-transparent">
                {formatCountdown(remainingMs)}
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                {formatDateTime(opensAtDate)}
              </p>
            </>
          ) : (
            <p className="mt-5 text-base font-semibold">Your exam is being prepared…</p>
          )}

          {/* Exam facts. */}
          {meta && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
                ⏱ {meta.duration_minutes} min
              </span>
              <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
                {meta.total_questions} questions
              </span>
              <span className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
                {meta.total_marks} marks
              </span>
            </div>
          )}

          <p className="text-muted-foreground mt-5 text-sm">
            The question paper opens automatically — keep this page open.
          </p>

          {/* Security notice. */}
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <WarningSign className="size-11 shrink-0" />
            <p className="text-xs leading-relaxed">
              Once the exam begins, moving away from this screen — switching tabs or apps,
              <Kbd>Alt + Tab</Kbd> / <Kbd>Cmd + Tab</Kbd>, or minimising — will submit your
              exam, for security reasons.
            </p>
          </div>

          <Button
            className="mt-6"
            variant="outline"
            onClick={() => router.push("/student/exams")}
          >
            Back to my exams
          </Button>
        </div>
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

  return (
    <>
      <div
        className="mx-auto max-w-6xl px-4 py-4 select-none sm:px-6 print:hidden"
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <AttemptView
          questions={attemptQuestions}
          index={engine.index}
          answers={engine.answers}
          seen={engine.seen}
          marked={engine.marked}
          collapsed={engine.collapsed}
          timeLeft={engine.timeLeft}
          submitting={submitting}
          confirmOpen={engine.confirmOpen}
          submitLabel="Submit exam"
          submitTitle="Submit exam?"
          notice={
            <details className="group mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
                <TriangleAlert className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  Stay on this screen — leaving closes your exam (one warning only).
                </span>
                <span className="shrink-0 underline group-open:hidden">Details</span>
                <span className="hidden shrink-0 underline group-open:inline">Less</span>
              </summary>
              <div className="mt-2 leading-relaxed">
                Pressing <Kbd>Alt + Tab</Kbd> or <Kbd>Cmd + Tab</Kbd>, switching apps, or minimising
                the window will close your exam. You get <strong>one warning</strong> — the next time,
                your exam is submitted automatically and <strong>cannot be resumed</strong>. Copying
                is disabled.
              </div>
            </details>
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
      </div>

      {/* First switch-away warning. The second leave aborts/auto-submits (engine). */}
      <Dialog open={engine.warnOpen} onOpenChange={engine.setWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Don&rsquo;t leave the exam</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <TriangleAlert className="size-5" />
            </span>
            <DialogDescription className="flex-1">
              You switched away from the exam window. This is your{" "}
              <strong className="text-foreground font-medium">only warning</strong> — if you leave
              again (Alt+Tab, Cmd+Tab, switching apps, or minimising the window), your exam will be
              submitted automatically and you will not be able to resume.
            </DialogDescription>
          </div>
          <DialogFooter>
            <Button onClick={() => engine.setWarnOpen(false)}>I understand — continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
