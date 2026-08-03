// Per-subject scores for the strengths/weaknesses bar chart (migrations 147, 154).
//   GET ?from&to&batch -> { subjects: [{ subject_id, subject_name, score_pct,
//        chapters_assessed, chapters_completed, pass_pct, pass_pct_mixed }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchSubjectScores, readScope } from "@/lib/student-performance-query";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  try {
    return NextResponse.json({ subjects: await fetchSubjectScores(supabase, readScope(req.nextUrl.searchParams)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
