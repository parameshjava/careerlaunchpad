// Start (or resume) a chapter-quiz attempt. start_chapter_quiz_attempt returns
// the existing in-progress attempt if there is one, else creates a new one — hard
// cap of 3 submitted attempts, enforced in-RPC (race-safe). Returns the attempt id
// the runner then loads.
//
//   POST body { batch_id, chapter_id } -> { attempt_id }
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "chapter.quiz.take"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isStudentApproved(ctx.userId)))
    return NextResponse.json({ error: "Your student profile is awaiting approval." }, { status: 403 });

  let body: { batch_id?: string; chapter_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const batchId = typeof body.batch_id === "string" ? body.batch_id : "";
  const chapterId = typeof body.chapter_id === "string" ? body.chapter_id : "";
  if (!batchId || !chapterId)
    return NextResponse.json({ error: "batch_id and chapter_id are required" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_chapter_quiz_attempt", {
    p_batch_id: batchId,
    p_chapter_id: chapterId,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    // "all 3 attempts" / "not available" / "closed" are client-recoverable states.
    const code = /attempt|available|closed|enrolled/i.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ attempt_id: data });
}
