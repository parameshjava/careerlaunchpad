// Per-subject scores for the strengths/weaknesses bar chart (migration 147).
//   GET ?from&to&batch -> { subjects: [{ subject_id, subject_name, score_pct,
//        chapters_assessed, chapters_completed }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_subject_scores", {
    p_from: sp.get("from") || null,
    p_to: sp.get("to") || null,
    p_batch: sp.get("batch") || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subjects: data ?? [] });
}
