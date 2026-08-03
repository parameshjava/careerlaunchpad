/**
 * Publish / unpublish a sitting's results (docs/EXAM_MODULE_SPEC.md §8). Until
 * published, students cannot see their score (get_exam_result returns
 * {published:false}). Updating exam_session rides the exam_session_manage RLS
 * policy (exam.assign), so the route gate matches.
 *
 * Publishing also notifies the students by email (issue #77,
 * docs/EMAIL_NOTIFICATIONS_SPEC.md §5): it enqueues one row per eligible student
 * and then drains the queue in `after()`, so the response is not held open for
 * N SMTP round-trips. Unpublishing notifies nobody.
 *
 * Enqueueing is idempotent on (session, student) and never revisits a row it has
 * already sent, so unpublish → publish cannot double-send.
 *
 *   POST body { published: boolean } -> { ok, queued }
 */
import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { drainExamResultNotifications } from "@/lib/exam-result-notify";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.assign");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: { published?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const published = body.published === true;

  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_session")
    .update({ results_published: published })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (!published) return NextResponse.json({ ok: true, queued: 0 });

  // Queue the student emails. A failure here must NOT fail the publish — the
  // results are already visible, and the console surfaces the delivery state and
  // offers a resend.
  const { data: queued, error: qErr } = await supabase.rpc("enqueue_exam_result_notifications", {
    p_session_id: id,
  });
  if (qErr) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      warning: `Results published, but queueing the result emails failed: ${qErr.message}`,
    });
  }

  // Deliver after the response. The Supabase server client's cookie writer is
  // already try/caught (lib/supabase/server.ts), so a token refresh that cannot
  // set cookies at this point is swallowed rather than thrown.
  after(async () => {
    const res = await drainExamResultNotifications(supabase, id);
    if (res.error) console.error(`[exam-result] drain for sitting ${id}:`, res.error);
    else
      console.info(
        `[exam-result] sitting ${id}: ${res.sent} sent, ${res.failed} failed, ${res.remaining} left for the next run`,
      );
  });

  return NextResponse.json({ ok: true, queued: queued ?? 0 });
}
