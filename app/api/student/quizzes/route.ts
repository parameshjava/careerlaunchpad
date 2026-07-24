// Student chapter quizzes — the assessments available to the signed-in student,
// grouped by batch. A quiz is available once its chapter is marked completed and
// the assessment bank has questions (enforced in student_chapter_quizzes). Gated on
// chapter.quiz.take + an approved student profile; the RPC re-checks enrollment.
//
//   GET -> { batches: [{ batchId, batchName, quizzes: [...] }] }
import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "chapter.quiz.take"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isStudentApproved(ctx.userId)))
    return NextResponse.json({ error: "Your student profile is awaiting approval." }, { status: 403 });

  const supabase = await createClient();
  const { data: enr, error } = await supabase
    .from("student_enrollment")
    .select("batch_id")
    .eq("student_id", ctx.userId)
    .in("status", ["pending", "active", "completed"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const batchIds = [...new Set((enr ?? []).map((e) => e.batch_id as string))];
  if (batchIds.length === 0) return NextResponse.json({ batches: [] });

  const { data: batches } = await supabase.from("batch").select("id, name").in("id", batchIds);
  const nameMap = new Map((batches ?? []).map((b) => [b.id as string, b.name as string]));

  const out = [];
  for (const bid of batchIds) {
    const { data: quizzes, error: qErr } = await supabase.rpc("student_chapter_quizzes", {
      p_batch_id: bid,
    });
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    out.push({ batchId: bid, batchName: nameMap.get(bid) ?? "Batch", quizzes: quizzes ?? [] });
  }
  // Batches with at least one completed chapter first; then by name.
  out.sort((a, b) => Number(b.quizzes.length > 0) - Number(a.quizzes.length > 0) || a.batchName.localeCompare(b.batchName));
  return NextResponse.json({ batches: out });
}
