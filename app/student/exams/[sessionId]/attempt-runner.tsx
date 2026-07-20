"use client";

// The exam runner. On mount it calls start_exam_attempt (SECURITY DEFINER RPC),
// then caches the hydrated paper + answers in localStorage so navigation and
// answering survive brief disconnects. Answers autosave (debounced) via
// save_exam_answer; submit calls submit_exam_attempt. One question per screen
// (mobile-first) with a palette and a hard-stop countdown.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, TriangleAlert, Printer } from "lucide-react";
import { WarningSign } from "../warning-sign";
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
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  // Question ids the student has landed on — drives the amber "seen but not
  // answered" palette state. Persisted like answers so it survives a resume.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  // Keep the active palette chip in view as the student moves through a long,
  // scrollable palette (60+ questions no longer paginate — they all render).
  const currentCellRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentCellRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);
  // On first load, restore the student's cursor so a resumed student lands
  // exactly where they left off. Prefer the persisted last_position (server +
  // cache, survives an abort); fall back to the first unanswered question, then
  // Q1. Runs once, after questions + answers are loaded.
  const initedIndexRef = useRef(false);
  const lastPositionRef = useRef<number | null>(null);
  useEffect(() => {
    if (initedIndexRef.current || loading || questions.length === 0) return;
    initedIndexRef.current = true;
    const saved = lastPositionRef.current;
    if (saved != null && saved > 0 && saved < questions.length) {
      setIndex(saved);
      return;
    }
    const firstUnanswered = questions.findIndex((qq) => !(answers[qq.question_id]?.length));
    if (firstUnanswered > 0) setIndex(firstUnanswered);
  }, [loading, questions, answers]);
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
  // null while live; set when the anti-cheat closes the paper. `final` = graded
  // (no resumes left); otherwise the attempt is `aborted` and recoverable.
  const [abortInfo, setAbortInfo] = useState<{ final: boolean; resumeCount: number } | null>(null);
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
      setAttemptId(cached.attemptId);
      setQuestions(cached.questions);
      setAnswers(cached.answers ?? {});
      setSeen(new Set(cached.seen ?? []));
      setDeadline(cached.deadline ?? null);
      if (cached.lastPosition != null) lastPositionRef.current = cached.lastPosition;
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

  // Mark the current question as "seen" the moment it's shown.
  useEffect(() => {
    const qid = questions[index]?.question_id;
    if (!qid || seen.has(qid)) return;
    const next = new Set(seen).add(qid);
    setSeen(next);
    persist({ seen: [...next] });
  }, [index, questions, seen, persist]);

  // Anti-cheat: detect the student leaving the exam window. Active only while an
  // attempt is live. First leave warns; the second submits as-is and shows the
  // closed screen — start_exam_attempt won't re-hand a non-in_progress attempt,
  // so it can't be resumed.
  useEffect(() => {
    if (!attemptId || abortInfo) return;
    const registerLeave = () => {
      if (suppressLeaveRef.current) return;
      const now = Date.now();
      if (now - lastLeaveRef.current < 1500) return; // one switch fires blur+visibility → one strike
      lastLeaveRef.current = now;
      // Persist the switch-away for staff (Alt-Tab metric). Fire-and-forget.
      supabase.rpc("record_exam_leave", { p_attempt_id: attemptId }).then(({ error: e }) => {
        if (e) console.warn("record_exam_leave failed", e.message);
      });
      const n = strikesRef.current + 1;
      setStrikes(n);
      if (n >= 2) {
        // Second strike: flush answers-so-far (like doSubmit), then abort
        // (recoverable) or finalize if resumes are spent.
        void (async () => {
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
          if (e) { setError(e.message); return; }
          const info = (data as { final?: boolean; resume_count?: number }) ?? {};
          setAbortInfo({ final: !!info.final, resumeCount: info.resume_count ?? 0 });
          try { localStorage.removeItem(cacheKey); } catch { /* ignore */ }
        })();
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
  }, [attemptId, abortInfo, supabase, cacheKey]);

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
      // Persist the cursor so a resume lands exactly here (server = durable
      // across abort/device; cache = instant restore on a plain reload).
      lastPositionRef.current = i;
      persist({ lastPosition: i });
      supabase.rpc("save_exam_position", { p_attempt_id: attemptId, p_position: i }).then(({ error: e }) => {
        if (e) console.warn("save_exam_position failed", e.message);
      });
    },
    [attemptId, supabase, persist],
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
                {opensAtDate!.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
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

  const q = questions[index];
  const answered = (qid: string) => (answers[qid]?.length ?? 0) > 0;
  const mm = timeLeft != null ? String(Math.floor(timeLeft / 60)).padStart(2, "0") : "--";
  const ss = timeLeft != null ? String(timeLeft % 60).padStart(2, "0") : "--";
  const lowTime = timeLeft != null && timeLeft <= 60;

  // Palette counts (whole paper) + per-subject bands. Questions arrive ordered by
  // position and each section is contiguous, so grouping in encounter order keeps
  // the subjects in their exam order. Papers without sections fall into one band.
  const answeredCount = questions.filter((qq) => answered(qq.question_id)).length;
  const seenCount = questions.filter(
    (qq) => !answered(qq.question_id) && seen.has(qq.question_id),
  ).length;
  const notVisitedCount = questions.length - answeredCount - seenCount;
  const rawBands: { id: string; title: string | null; items: { qq: Question; i: number }[] }[] = [];
  questions.forEach((qq, i) => {
    const last = rawBands[rawBands.length - 1];
    if (last && last.id === qq.section_id) last.items.push({ qq, i });
    else rawBands.push({ id: qq.section_id, title: qq.section_title, items: [{ qq, i }] });
  });
  // Subject label: from the question payload (migration 116) if present, else
  // fall back to meta.sections — same paper order, contiguous — so bands are
  // labelled even before that migration reaches the DB.
  const bands = rawBands.map((b, bi) => ({
    ...b,
    label: b.title ?? meta?.sections[bi]?.subject ?? null,
  }));
  const multiSection = bands.length > 1;
  const currentSubject = bands.find((b) => b.items.some((it) => it.i === index))?.label ?? null;

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
      {/* Header: progress + timer. Bleeds over the container's px/py padding
          (-mx / -mt + re-pad) so its opaque background fully masks content
          scrolling underneath — otherwise the amber banner peeks above/beside
          it on scroll. z-20 keeps it above the palette's own sticky subheaders. */}
      <div className="bg-background sticky top-0 z-20 mb-4 -mx-4 -mt-4 flex items-center justify-between gap-4 border-b px-4 pt-4 pb-2 sm:-mx-6 sm:px-6">
        <span className="min-w-0 truncate text-sm font-medium">
          Question {index + 1} / {questions.length}
          {currentSubject && (
            <span className="text-muted-foreground"> · {currentSubject}</span>
          )}
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
        <strong>Stay on this screen.</strong> Pressing <Kbd>Alt + Tab</Kbd> or{" "}
        <Kbd>Cmd + Tab</Kbd>, switching apps, or minimising the window will close your
        exam. You get{" "}
        <strong>one warning</strong> — the next time, your exam is submitted
        automatically and <strong>cannot be resumed</strong>. Copying is disabled.
      </div>

      {/* Palette — summary counts double as the legend, then every question in
          one scrollable grid, banded by subject. */}
      <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-2 rounded-md border p-2">
          <span className="size-3 shrink-0 rounded-sm bg-emerald-500" />
          <span className="tabular-nums font-semibold">{answeredCount}</span>
          <span className="text-muted-foreground">Answered</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-2">
          <span className="size-3 shrink-0 rounded-sm border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40" />
          <span className="tabular-nums font-semibold">{seenCount}</span>
          <span className="text-muted-foreground">Seen</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-2">
          <span className="bg-muted size-3 shrink-0 rounded-sm border" />
          <span className="tabular-nums font-semibold">{notVisitedCount}</span>
          <span className="text-muted-foreground">Left</span>
        </div>
      </div>

      <div className="bg-muted/30 mb-4 max-h-52 overflow-y-auto rounded-md border p-2">
        {bands.map((band) => (
          <div key={band.id}>
            {/* Subject header — only when the paper actually has sections.
                Bold, brand-tinted highlight bar with a left accent so each
                section reads as a clear divider in the palette. */}
            {multiSection && band.label && (
              <div className="bg-primary/10 text-primary sticky top-0 z-10 -mx-2 mb-2 flex items-center justify-between gap-2 border-l-4 border-primary px-2 py-1.5 text-xs font-bold uppercase tracking-wide backdrop-blur">
                <span className="truncate">{band.label}</span>
                <span className="tabular-nums whitespace-nowrap">
                  {band.items.filter(({ qq }) => answered(qq.question_id)).length}/
                  {band.items.length}
                </span>
              </div>
            )}
            <div className="mb-2 grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1.5">
              {band.items.map(({ qq, i }) => (
                <button
                  key={qq.question_id}
                  ref={i === index ? currentCellRef : null}
                  onClick={() => goTo(i)}
                  className={`relative flex aspect-square items-center justify-center rounded-md border text-xs font-medium tabular-nums transition ${
                    answered(qq.question_id)
                      ? "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600"
                      : seen.has(qq.question_id)
                        ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        : "bg-background"
                  } ${i === index ? "ring-primary border-primary ring-2" : ""}`}
                >
                  {i + 1}
                  {/* Answered → corner tick, so "done" reads even in greyscale. */}
                  {answered(qq.question_id) && (
                    <span className="bg-background text-emerald-600 dark:bg-background absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full">
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
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
          <div className="flex gap-2.5 font-medium">
            <span className="text-primary bg-primary/10 h-fit shrink-0 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums">
              Q{index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <RichContent content={q.stem} />
            </div>
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
            <DialogTitle>Don’t leave the exam</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <TriangleAlert className="size-5" />
            </span>
            <DialogDescription className="flex-1">
              You switched away from the exam window. This is your{" "}
              <strong className="font-medium text-foreground">only warning</strong> — if
              you leave again (Alt+Tab, Cmd+Tab, switching apps, or minimising the
              window), your exam will be submitted automatically and you will not be
              able to resume.
            </DialogDescription>
          </div>
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
