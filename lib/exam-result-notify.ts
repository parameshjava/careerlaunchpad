/**
 * Delivery of the "your result is ready" emails (issue #77).
 *
 * The queue lives in exam_result_notification (migration 157); this module is the
 * worker that drains it. Two callers:
 *   · POST /api/exam/sessions/[id]/publish-results — enqueues, responds, then
 *     drains inside after() so the staff member is not held for N SMTP
 *     round-trips.
 *   · POST /api/exam/sessions/[id]/notify-results — the console's "Resend"
 *     button, which awaits the drain and reports counts.
 *
 * WHY A PER-RUN CAP
 *   Delivery is one Zoho mailbox with per-hour and per-day limits. A 300-student
 *   sitting is 300 messages in a burst. Stopping at PER_RUN_CAP leaves the
 *   remainder `pending`, and the next drain (Resend, or the next publish)
 *   continues from there — a queue that can be worked down beats a loop that
 *   trips a quota half way and loses the rest.
 *
 * CONCURRENCY is small on purpose: nodemailer opens a connection per send here,
 * and hammering an SMTP host is the fastest way to get throttled.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExamResultEmail, type ExamResultSection } from "./mailer";

const PER_RUN_CAP = 200;
const CONCURRENCY = 4;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type DigestStudent = {
  student_id: string;
  full_name: string | null;
  email: string | null;
  marks: number | string;
  max_marks: number | string;
  correct: number;
  questions: number;
  answered: number;
  interrupted: boolean;
  rank: number | null;
  out_of: number | null;
  college_average: number | string | null;
  sections: { name: string; got: number | string; max: number | string }[];
};

type Digest = {
  session: {
    label: string;
    exam_title: string;
    college_name: string | null;
    blueprint_total: number | string;
  };
  students: DigestStudent[];
};

export type DrainResult = {
  attempted: number;
  sent: number;
  failed: number;
  /** Rows left pending because the per-run cap was reached. */
  remaining: number;
  error?: string;
};

/** numeric columns arrive from PostgREST as strings; NaN is never acceptable here. */
function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Send every queued (`pending` or `failed`) notification for a sitting, then
 * record each outcome. Never throws: it is called from after() where a rejection
 * would be an unhandled one, and from a route that must still answer.
 */
export async function drainExamResultNotifications(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<DrainResult> {
  const empty: DrainResult = { attempted: 0, sent: 0, failed: 0, remaining: 0 };
  try {
    const { data: queuedRows, error: qErr } = await supabase.rpc(
      "pending_exam_result_notifications",
      { p_session_id: sessionId, p_limit: PER_RUN_CAP },
    );
    if (qErr) return { ...empty, error: qErr.message };
    const queued = (queuedRows ?? []) as { student_id: string; email: string | null }[];
    if (!queued.length) return empty;

    // The RPC returns one row beyond the cap purely so we can tell there is more.
    const batch = queued.slice(0, PER_RUN_CAP);
    const remaining = Math.max(0, queued.length - batch.length);
    const ids = batch.map((r) => r.student_id);

    const { data, error: dErr } = await supabase.rpc("exam_result_digest", {
      p_session_id: sessionId,
      p_student_ids: ids,
    });
    if (dErr) return { ...empty, error: dErr.message };
    const digest = data as Digest | null;
    if (!digest?.students?.length) return { ...empty, remaining };

    const emailById = new Map(batch.map((r) => [r.student_id, r.email]));
    // Bound outside the worker closure: TypeScript cannot keep the null-narrowing
    // on `digest` across an async function boundary.
    const sess = digest.session;
    const blueprintTotal = num(sess.blueprint_total);

    const results: { student_id: string; ok: boolean; error?: string }[] = [];

    // Bounded worker pool over the digest rows.
    const queue = [...digest.students];
    async function worker() {
      for (;;) {
        const s = queue.shift();
        if (!s) return;
        // The queue row's address is the one the audit trail recorded; fall back
        // to the digest's copy in case a row predates an email change.
        const to = emailById.get(s.student_id) ?? s.email;
        if (!to) {
          results.push({ student_id: s.student_id, ok: false, error: "No email address on the student account" });
          continue;
        }
        // An attempt with no per-question marks would divide by zero; the
        // blueprint total is the documented fallback (same rule as the page).
        const maxMarks = num(s.max_marks) > 0 ? num(s.max_marks) : blueprintTotal;
        const sections: ExamResultSection[] = (s.sections ?? []).map((x) => ({
          name: x.name,
          got: num(x.got),
          max: num(x.max),
        }));

        const outcome = await sendExamResultEmail({
          to,
          name: s.full_name,
          examTitle: sess.exam_title,
          sittingLabel: sess.label,
          collegeName: sess.college_name,
          marks: num(s.marks),
          maxMarks,
          correct: s.correct,
          questions: s.questions,
          answered: s.answered,
          interrupted: s.interrupted,
          rank: s.rank,
          outOf: s.out_of,
          collegeAverage: s.college_average == null ? null : num(s.college_average),
          sections,
          resultUrl: `${SITE_URL}/student/exams/${sessionId}/result`,
        });
        results.push({ student_id: s.student_id, ok: outcome.sent, error: outcome.error });
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    const { error: rErr } = await supabase.rpc("record_exam_result_notifications", {
      p_session_id: sessionId,
      p_results: results,
    });

    const sent = results.filter((r) => r.ok).length;
    return {
      attempted: results.length,
      sent,
      failed: results.length - sent,
      remaining,
      error: rErr?.message,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
