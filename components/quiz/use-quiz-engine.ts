"use client";

// The shared quiz engine. It owns everything common to *any* timed, one-question-
// at-a-time quiz — exams, chapter assessments, and future mock tests all drive the
// same behaviour through it, so anti-cheat and timing can never drift between them:
//
//   • interaction state — current index, answers, seen / marked / collapsed sets
//   • the hard-stop countdown → auto-submit at zero
//   • the leave guard — Alt+Tab / Cmd+Tab / app-switch / minimise fires window
//     `blur` + `visibilitychange`; a single switch fires both, so they're coalesced
//     into one strike. First strike warns; the second submits (or a custom penalty,
//     e.g. the exam's abort flow).
//   • the submit-confirm + "don't leave" dialog state
//
// It is presentation-agnostic: feed it questions + a small adapter of persistence
// and submit callbacks, spread its output into <AttemptView>, and render the warn
// dialog from `warnOpen`. Each surface keeps its own data layer (how it loads,
// caches, persists, and submits) — the engine just calls the adapter at the right
// moments. See quiz-runner.tsx (assessment) and attempt-runner.tsx (exam).
import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptQuestion } from "@/components/exam/attempt-view";

export type LeaveReason = "manual" | "time" | "tab";

export type QuizEngineAdapter = {
  // Persist an answer change. `all` is the full next map; `questionId` / `selected`
  // identify what changed (the exam saves per-question, the assessment saves all).
  onAnswerChange?: (all: Record<string, string[]>, questionId: string, selected: string[]) => void;
  // The cursor moved. A good place to flush pending saves and persist the position.
  onNavigate?: (index: number) => void;
  onSeenChange?: (seen: string[]) => void;
  onMarkedChange?: (marked: string[]) => void;
  // Fire-and-forget record of a leave event (the exam logs it for staff).
  onLeaveRecorded?: () => void;
  // Perform the submit. Called for a manual submit, on timeout, and — unless
  // `onSecondLeave` is given — on the second leave strike. The caller owns the
  // async work and its own `submitting` flag.
  submit: (reason: LeaveReason) => void | Promise<void>;
  // Override the second-leave action (the exam aborts — recoverable — instead of
  // submitting). When omitted, the second strike calls `submit("tab")`.
  onSecondLeave?: () => void | Promise<void>;
};

export type QuizEngineInput = QuizEngineAdapter & {
  // Loaded paper. Empty until the surface has data; the engine seeds itself the
  // first time it turns non-empty.
  questions: AttemptQuestion[];
  // Guard + countdown run only while active (false once submitted / aborted / on
  // an error screen). Flipping it false tears the listeners + timer down.
  active: boolean;
  // Epoch-ms hard deadline, or null for an untimed quiz.
  deadline: number | null;
};

export function useQuizEngine(input: QuizEngineInput) {
  const {
    questions,
    active,
    deadline,
    onAnswerChange,
    onNavigate,
    onSeenChange,
    onMarkedChange,
    onLeaveRecorded,
    submit,
    onSecondLeave,
  } = input;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);

  // Always-current adapter, so the guard/timer effects can bind once and never go
  // stale — they read the latest callbacks off this ref rather than via deps.
  const adapter = useRef(input);
  adapter.current = input;

  const questionsRef = useRef<AttemptQuestion[]>(questions);
  questionsRef.current = questions;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Refs backing the leave guard (survive re-renders without re-binding).
  const strikesRef = useRef(0);
  const lastLeaveRef = useRef(0); // coalesce blur+visibility from one switch
  const suppressLeaveRef = useRef(false); // e.g. suppressed while a print dialog is open
  const firedTimeoutRef = useRef(false);
  const navigatedRef = useRef(false); // once the user has moved, don't re-seed the cursor
  const seededRef = useRef(false);

  // ---- Hydration ------------------------------------------------------------
  // Seed once from loaded data; re-calls merge answers (server under local edits),
  // matching the exam's cache-then-server flow. Safe to call from a load effect.
  const hydrate = useCallback(
    (data: {
      answers?: Record<string, string[]>;
      seen?: string[];
      marked?: string[];
      index?: number;
    }) => {
      const incoming = data.answers;
      if (incoming) setAnswers((local) => ({ ...incoming, ...local }));
      if (data.seen && !seededRef.current) setSeen(new Set(data.seen));
      if (data.marked && !seededRef.current) setMarked(new Set(data.marked));
      if (data.index != null && !navigatedRef.current) setIndex(data.index);
      seededRef.current = true;
    },
    [],
  );

  // ---- Answer / navigation mutations ---------------------------------------
  const choose = useCallback((q: AttemptQuestion, optionId: string) => {
    if (!activeRef.current) return;
    setAnswers((prev) => {
      const cur = prev[q.questionId] ?? [];
      const nextSel =
        q.answerType === "single"
          ? [optionId]
          : cur.includes(optionId)
            ? cur.filter((id) => id !== optionId)
            : [...cur, optionId];
      const next = { ...prev, [q.questionId]: nextSel };
      adapter.current.onAnswerChange?.(next, q.questionId, nextSel);
      return next;
    });
  }, []);

  const clearAnswer = useCallback((q: AttemptQuestion) => {
    if (!activeRef.current) return;
    setAnswers((prev) => {
      if (!(prev[q.questionId]?.length)) return prev; // already blank
      const next = { ...prev, [q.questionId]: [] };
      adapter.current.onAnswerChange?.(next, q.questionId, []);
      return next;
    });
  }, []);

  const goTo = useCallback((i: number) => {
    const q = questionsRef.current[i];
    if (!q) return;
    navigatedRef.current = true;
    setIndex(i);
    adapter.current.onNavigate?.(i);
  }, []);

  const toggleMark = useCallback((questionId: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      adapter.current.onMarkedChange?.([...next]);
      return next;
    });
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const toggleCollapseAll = useCallback(() => {
    const ids = [...new Set(questionsRef.current.map((q) => q.sectionId))];
    setCollapsed((prev) => (prev.size >= ids.length ? new Set() : new Set(ids)));
  }, []);

  // ---- Mark the current question "seen" the moment it's shown ---------------
  useEffect(() => {
    const q = questions[index];
    if (!q) return;
    setSeen((prev) => {
      if (prev.has(q.questionId)) return prev;
      const next = new Set(prev).add(q.questionId);
      adapter.current.onSeenChange?.([...next]);
      return next;
    });
  }, [index, questions]);

  // ---- Countdown → hard auto-submit at zero ---------------------------------
  useEffect(() => {
    if (deadline == null || !active) return;
    const tick = () => {
      const rem = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(rem);
      if (rem <= 0 && !firedTimeoutRef.current) {
        firedTimeoutRef.current = true;
        void adapter.current.submit("time");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, active]);

  // ---- Leave guard ----------------------------------------------------------
  // Alt+Tab / Cmd+Tab / app-switch / minimise → window `blur`; tab-switch /
  // minimise → `visibilitychange` hidden. One switch fires both, so coalesce
  // within 1.5s into a single strike. First strike warns; the second submits
  // (or runs the adapter's custom penalty).
  useEffect(() => {
    if (!active) return;
    // Diagnostic: prove the guard is armed in the running build. Remove once the
    // tab-switch behaviour is confirmed in the deployed app.
    console.info("[quiz-guard] armed");
    const registerLeave = (via: string) => {
      console.info("[quiz-guard] leave via", via, {
        suppressed: suppressLeaveRef.current,
        sinceLast: Date.now() - lastLeaveRef.current,
      });
      if (suppressLeaveRef.current) return;
      const now = Date.now();
      if (now - lastLeaveRef.current < 1500) return;
      lastLeaveRef.current = now;
      adapter.current.onLeaveRecorded?.();
      strikesRef.current += 1;
      if (strikesRef.current >= 2) {
        const penalty = adapter.current.onSecondLeave ?? (() => adapter.current.submit("tab"));
        void penalty();
      } else {
        setWarnOpen(true);
      }
    };
    const onBlur = () => registerLeave("blur");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") registerLeave("visibility");
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      console.info("[quiz-guard] disarmed");
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  const openConfirm = useCallback(() => setConfirmOpen(true), []);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);
  const submitManual = useCallback(() => {
    setConfirmOpen(false);
    void adapter.current.submit("manual");
  }, []);

  return {
    // AttemptView state
    index,
    answers,
    seen,
    marked,
    collapsed,
    timeLeft,
    confirmOpen,
    // AttemptView handlers
    onChoose: choose,
    onGoTo: goTo,
    onClear: clearAnswer,
    onToggleMark: toggleMark,
    onToggleSection: toggleSection,
    onToggleCollapseAll: toggleCollapseAll,
    onOpenConfirm: openConfirm,
    onCloseConfirm: closeConfirm,
    onSubmit: submitManual,
    // Leave-warning dialog (each surface renders its own copy)
    warnOpen,
    setWarnOpen,
    // Imperative hydration from the surface's loader
    hydrate,
    // For surfaces that suppress the guard transiently (exam print dialog)
    suppressLeaveRef,
  };
}
