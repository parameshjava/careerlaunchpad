/**
 * Outbound email for chapter feedback (issue #84). Two jobs, one caller:
 *
 *   runFeedbackReminders()     — the ONE "how was this chapter?" reminder to students
 *                                who haven't answered (§G3, queue in migration 168).
 *   runOverdueActionDigests()  — the weekly nudge to staff who own overdue action
 *                                items (§V11, log in migration 172).
 *
 * Both are driven by GET /api/cron/feedback-reminders on a daily Vercel Cron. Neither
 * has a human trigger, which is the whole point: the gaps these close are that nobody
 * was telling students a window had opened, and nothing was chasing an action past its
 * due date. Each job's "don't send twice" rule lives in a database key (one row per
 * window+student; one row per owner+week), never in a timestamp comparison here.
 *
 * WHY A PER-RUN CAP
 *   Delivery is one Zoho mailbox with per-hour and per-day limits. Stopping at
 *   PER_RUN_CAP leaves the rest `pending`, and tomorrow's run continues from there;
 *   a window is open for 14 days, so a queue worked down over two runs still
 *   reaches every student in good time. (Mirrors lib/exam-result-notify.ts.)
 *
 * CONCURRENCY is small on purpose: nodemailer opens a connection per send, and
 * hammering an SMTP host is the fastest way to get throttled.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendFeedbackReminderEmail, sendOverdueActionsEmail } from "./mailer";

const PER_RUN_CAP = 200;
const CONCURRENCY = 4;
/** Days after the window opens before the single reminder goes out (§G3). */
export const REMIND_AFTER_DAYS = 3;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type PendingRow = {
  request_id: string;
  student_id: string;
  email: string | null;
  student_name: string | null;
  batch_name: string | null;
  subject_name: string | null;
  chapter_name: string | null;
  closes_at: string;
};

export type ReminderRunResult = {
  queued: number;
  attempted: number;
  sent: number;
  failed: number;
  /** Rows left pending because the per-run cap was reached. */
  remaining: number;
  error?: string;
};

/**
 * Enqueue anything newly due, then send it. Never throws — the cron route must
 * still answer with a status the platform can log.
 *
 * `supabase` must be the ADMIN client: the three RPCs are granted to service_role
 * only, because a mail run is not something a browser session may start.
 */
export async function runFeedbackReminders(
  supabase: SupabaseClient,
): Promise<ReminderRunResult> {
  const empty: ReminderRunResult = { queued: 0, attempted: 0, sent: 0, failed: 0, remaining: 0 };
  try {
    const { data: queuedCount, error: eErr } = await supabase.rpc("enqueue_feedback_reminders", {
      p_after_days: REMIND_AFTER_DAYS,
    });
    if (eErr) return { ...empty, error: eErr.message };
    const queued = Number(queuedCount ?? 0);

    // Drain covers everything pending or failed, not just what this run queued: a
    // send that failed yesterday is exactly what the retry is for.
    const { data: rows, error: pErr } = await supabase.rpc("pending_feedback_reminders", {
      p_limit: PER_RUN_CAP,
    });
    if (pErr) return { ...empty, queued, error: pErr.message };

    const pending = (rows ?? []) as PendingRow[];
    if (!pending.length) return { ...empty, queued };

    // The RPC returns one row beyond the cap purely so we can tell there is more.
    const batch = pending.slice(0, PER_RUN_CAP);
    const remaining = Math.max(0, pending.length - batch.length);

    const results: { request_id: string; student_id: string; ok: boolean; error?: string }[] = [];
    const work = [...batch];

    async function worker() {
      for (;;) {
        const row = work.shift();
        if (!row) return;
        if (!row.email) {
          results.push({
            request_id: row.request_id,
            student_id: row.student_id,
            ok: false,
            error: "No email address on the student account",
          });
          continue;
        }
        const outcome = await sendFeedbackReminderEmail({
          to: row.email,
          name: row.student_name,
          batchName: row.batch_name,
          subjectName: row.subject_name,
          chapterName: row.chapter_name,
          closesAt: row.closes_at,
          // Straight to the form, not the hub: an extra hop is the commonest place a
          // 45-second task gets abandoned.
          feedbackUrl: `${SITE_URL}/student/feedback/${row.request_id}`,
        });
        results.push({
          request_id: row.request_id,
          student_id: row.student_id,
          ok: outcome.sent,
          error: outcome.error,
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

    const { error: rErr } = await supabase.rpc("record_feedback_reminders", {
      p_results: results,
    });

    const sent = results.filter((r) => r.ok).length;
    return {
      queued,
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

type DigestRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  items: {
    id: string;
    title: string;
    due_on: string | null;
    priority: string;
    status: string;
    batch_name: string | null;
  }[];
};

export type DigestRunResult = {
  attempted: number;
  sent: number;
  failed: number;
  error?: string;
};

/**
 * The weekly overdue-actions digest (issue #84 §V11, migration 172). Runs from the
 * same daily cron as the student reminders: the once-a-week rule lives in the digest
 * log's primary key, so a daily invocation sends at most one per owner per week and a
 * failed day is simply covered by the next one.
 *
 * Owner-only by decision — unowned items (including auto-proposals nobody has taken
 * on) are chased on screen in /dashboard/feedback, not by email to people who never
 * asked for them.
 */
export async function runOverdueActionDigests(
  supabase: SupabaseClient,
): Promise<DigestRunResult> {
  const empty: DigestRunResult = { attempted: 0, sent: 0, failed: 0 };
  try {
    const { data, error } = await supabase.rpc("pending_overdue_action_digests");
    if (error) return { ...empty, error: error.message };

    const rows = ((data ?? []) as DigestRow[]).filter((r) => r.email && r.items?.length);
    if (!rows.length) return empty;

    const results: { user_id: string; ok: boolean; item_count: number }[] = [];
    const work = [...rows];

    async function worker() {
      for (;;) {
        const row = work.shift();
        if (!row) return;
        const outcome = await sendOverdueActionsEmail({
          to: row.email as string,
          name: row.full_name,
          items: row.items.map((i) => ({
            title: i.title,
            dueOn: i.due_on,
            priority: i.priority,
            status: i.status,
            batchName: i.batch_name,
          })),
          actionsUrl: `${SITE_URL}/dashboard/feedback`,
        });
        results.push({ user_id: row.user_id, ok: outcome.sent, item_count: row.items.length });
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

    const { error: rErr } = await supabase.rpc("record_overdue_action_digests", {
      p_results: results,
    });

    const sent = results.filter((r) => r.ok).length;
    return { attempted: results.length, sent, failed: results.length - sent, error: rErr?.message };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
