// Per-chapter scores within a subject — the drill-down (migration 147).
//   GET ?from&to&batch -> { chapters: [{ chapter_id, chapter_name, best_pct,
//        first_pct, attempts_used, passed }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> },
) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { subjectId } = await params;
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_chapter_scores", {
    p_subject: subjectId,
    p_from: sp.get("from") || null,
    p_to: sp.get("to") || null,
    p_batch: sp.get("batch") || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapters: data ?? [] });
}
