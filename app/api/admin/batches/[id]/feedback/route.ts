// Staff view of one batch's chapter feedback (issue #84) — the Feedback tab.
//
//   GET -> { chapters: [{ …aggregates, responsePct, trips[], quizPassPct, … }] }
//
// batch_feedback_overview() authorizes internally (feedback.view.identified,
// batch.progress.manage, or a college-scoped grant on one of the batch's colleges)
// and computes the trip flags in SQL, so the triage list can't drift between this
// tab and any other reader. Trips are n-independent on purpose (O-2): one rating of
// 1-2, or one remark, is enough to earn a look.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toStaffRow } from "@/lib/feedback-query";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("batch_feedback_overview", { p_batch_id: id });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 500 });
  }
  return NextResponse.json({ chapters: (data ?? []).map(toStaffRow) });
}
