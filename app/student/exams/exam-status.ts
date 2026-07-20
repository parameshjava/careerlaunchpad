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
