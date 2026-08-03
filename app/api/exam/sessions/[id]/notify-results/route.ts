/**
 * Re-send the result emails for a sitting (issue #77) — the console's "Resend"
 * button. Same permission as publishing, since it is the same act.
 *
 * It re-enqueues first, which does two useful things beyond retrying failures:
 * a student whose attempt was graded after the original publish gets picked up,
 * and a row that was skipped for a missing address heals into `pending` once the
 * address exists. Rows already `sent` are never revisited, so this can be pressed
 * repeatedly without mailing anyone twice.
 *
 * Unlike the publish route this AWAITS delivery, because a human pressed the
 * button and wants the counts back. Retry batches are small by nature.
 *
 *   POST -> { ok, attempted, sent, failed, remaining }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { drainExamResultNotifications } from "@/lib/exam-result-notify";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.assign");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  const { error: qErr } = await supabase.rpc("enqueue_exam_result_notifications", {
    p_session_id: id,
  });
  // The RPC refuses an unpublished sitting — that is a 422, not a server fault.
  if (qErr) return NextResponse.json({ ok: false, error: qErr.message }, { status: 422 });

  const res = await drainExamResultNotifications(supabase, id);
  if (res.error) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });

  return NextResponse.json({ ok: true, ...res });
}
