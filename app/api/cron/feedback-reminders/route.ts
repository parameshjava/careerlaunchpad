// The daily chapter-feedback mail run (issue #84). Two jobs in one invocation:
//
//   GET /api/cron/feedback-reminders
//     -> { reminders: { queued, attempted, sent, failed, remaining },
//          digests:   { attempted, sent, failed } }
//
//   1) The ONE reminder per open window, 3 days in, to students who haven't answered
//      (§G3, migration 168).
//   2) The weekly overdue-actions digest to each item's owner (§V11, migration 172).
//
// ONE endpoint, one schedule, two jobs — because each job's "don't send twice" rule is
// a database key, not a schedule: one row per (window, student) and one per (owner,
// ISO week). That makes a daily run idempotent, so a failed day self-heals tomorrow
// instead of losing a send, and the deployment needs one cron entry rather than two.
//
// AUTHORIZATION
//   Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var is set.
//   With no secret configured the route refuses outright rather than running open to
//   the internet — an unauthenticated endpoint that sends email to students is worse
//   than a job that hasn't been switched on yet, and the 503 says which it is.
//
// WHY CRON AND NOT pg_cron
//   The SMTP transport lives in Node (lib/mailer.ts). Reaching it from Postgres would
//   mean pg_net plus a URL and a shared secret inside a migration. The scheduler that
//   already ships with the deployment is the cheaper, auditable answer. (The jobs that
//   need no mail — window expiry, action proposals, the retention prune — do run in
//   pg_cron, where they belong.)
//
// Runs with the ADMIN client: a cron request carries no user session, and the queue
// RPCs are granted to service_role only.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFeedbackReminders, runOverdueActionDigests } from "@/lib/feedback-notify";

// Sending N emails can outlast the default budget on a big cohort.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; refusing to run" },
      { status: 503 },
    );
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let reminders, digests;
  try {
    const supabase = createAdminClient();
    // Sequential, not parallel: both drain the same single SMTP mailbox, and the
    // student reminders are the time-sensitive half.
    reminders = await runFeedbackReminders(supabase);
    digests = await runOverdueActionDigests(supabase);
  } catch (err) {
    // createAdminClient throws when SUPABASE_SECRET_KEY is missing.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // A partial failure is still a 200: those rows stay unsent and tomorrow's run
  // retries them. Only a hard error with nothing attempted is a 500, since that is the
  // case where nothing will self-heal.
  const hardFailure =
    reminders.error && reminders.attempted === 0 && digests.error && digests.attempted === 0;
  return NextResponse.json({ reminders, digests }, { status: hardFailure ? 500 : 200 });
}
