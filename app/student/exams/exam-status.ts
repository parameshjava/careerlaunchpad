// Shared client-side status/action derivation for a student's exam sessions.
// One source of truth used by the My Exams table, the sidebar count badge, and
// the home banner — so "what counts as an exam I still need to attend" can't
// drift between them.
import type { Session, ExamRow, ExamStatus, ExamAction } from "./exam-columns";

export const GRACE_MS = 60_000; // fetch from opens_at-1min; submit until closes_at+1min

// Derive the single status + primary action for a session, given the clock.
export function decorate(s: Session, now: number): ExamRow {
  const done = s.roster_status === "submitted";
  const opens = s.opens_at ? new Date(s.opens_at).getTime() : null;
  const closes = s.closes_at ? new Date(s.closes_at).getTime() : null;
  const beforeWindow = opens == null || now < opens - GRACE_MS;
  const afterWindow = closes != null && now > closes + GRACE_MS;

  // Published results are viewable by anyone with a finalized attempt — including
  // an aborted one (its partial marks are graded on close). This MUST come before
  // the aborted-locked branch below, or an aborted student could never open their
  // published result.
  const hasFinalizedAttempt = s.attempt_status != null && s.attempt_status !== "in_progress";
  if (s.results_published && hasFinalizedAttempt) {
    return { ...s, statusLabel: "Result ready", action: "result" };
  }

  // Anti-cheat close (results not yet out): an aborted attempt is locked.
  // resume_count 0 → the student may reopen it once themselves (in window);
  // otherwise it's admin-only.
  if (s.attempt_status === "aborted") {
    const selfResumable = (s.resume_count ?? 0) === 0 && !beforeWindow && !afterWindow;
    return {
      ...s,
      statusLabel: selfResumable ? "Open" : "Closed",
      action: selfResumable ? "resume" : null,
    };
  }

  let statusLabel: ExamStatus;
  let action: ExamAction = null;
  if (done) {
    if (s.results_published) {
      statusLabel = "Result ready";
      action = "result";
    } else {
      statusLabel = "Submitted";
    }
  } else if (afterWindow) {
    statusLabel = "Closed";
  } else if (opens != null && !beforeWindow) {
    statusLabel = "Open";
    action = s.roster_status === "started" ? "resume" : "open";
  } else {
    // Scheduled: students may enter the waiting room early (the attempt page
    // polls and the server releases questions at opens-1min).
    statusLabel = "Scheduled";
    if (opens != null) action = "open";
  }
  return { ...s, statusLabel, action };
}

// Exams that still need the student's attention: happening now or coming up.
export function isUpcoming(row: ExamRow): boolean {
  return row.statusLabel === "Open" || row.statusLabel === "Scheduled";
}
