// Monthly score trend (migration 147). group=subject adds a per-subject series.
//   GET ?from&to&batch&group -> { points: [{ month, subject_id, subject_name, pct }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_score_trend", {
    p_from: sp.get("from") || null,
    p_to: sp.get("to") || null,
    p_batch: sp.get("batch") || null,
    p_group: sp.get("group") === "subject" ? "subject" : "overall",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ points: data ?? [] });
}
