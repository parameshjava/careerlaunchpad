// Submit + grade a chapter-quiz attempt. submit_chapter_quiz_attempt grades against
// the assessment bank and returns the result directly (no separate results RPC).
//
//   POST -> { score, total_marks, passed, pass_pct }
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "chapter.quiz.take"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isStudentApproved(ctx.userId)))
    return NextResponse.json({ error: "Your student profile is awaiting approval." }, { status: 403 });

  const { attemptId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_chapter_quiz_attempt", {
    p_attempt_id: attemptId,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  // RETURNS TABLE → an array with one row.
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json(row ?? {});
}
