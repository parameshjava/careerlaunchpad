// The IDENTIFIED responses for one feedback request (issue #84) — the staff triage
// panel. This is the ONLY endpoint in the feature that returns a student's name.
//
//   GET -> { responses: [{ studentName, rollNumber, answers, remark, contactOk, … }] }
//
// Non-responders come back with a null response, because "who stayed silent" is
// half the signal and the frozen eligible_count is what makes that list possible.
// `contactOk` is the student's own opt-in — the UI must not offer a contact action
// without it, which is the whole basis of the anonymity promise on the form.
//
// request_feedback_responses() requires feedback.view.identified globally or
// college-scoped on one of the batch's colleges.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toIdentified } from "@/lib/feedback-query";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_feedback_responses", {
    p_request_id: requestId,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 500 });
  }
  return NextResponse.json({ responses: (data ?? []).map(toIdentified) });
}
