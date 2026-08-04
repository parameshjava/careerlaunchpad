// Chapter feedback for the calling mentor's assigned subjects (issue #84).
//
//   GET  -> { chapters: [{ …aggregates, remarks[], quizPassPct, lowConfidence }] }
//   POST  body { request_id, note } -> { ok }        (the trainer's context note)
//
// The RPC decides everything sensitive: it authorizes by batch_subject_mentor
// assignment (no permission key), returns aggregates and remark text ONLY, shuffles
// remark order, and drops timestamps. With names already absent, submission order is
// the last thing that could re-identify a student in a 20-person batch — so there is
// no shape in which this endpoint can return a per-student row.
//
// Scores stay null while the window is open (O-5); the response count does not, so a
// mentor can still chase participation without watching a live score.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toMentorFeedback } from "@/lib/feedback-query";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mentor_chapter_feedback");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapters: (data ?? []).map(toMentorFeedback) });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { request_id?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  if (!requestId) return NextResponse.json({ error: "request_id is required" }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chapter_feedback_note", {
    p_request_id: requestId,
    p_note: typeof body.note === "string" ? body.note.slice(0, 1000) : null,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 422 });
  }
  return NextResponse.json({ ok: true });
}
