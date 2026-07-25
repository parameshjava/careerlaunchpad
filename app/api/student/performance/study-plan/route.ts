// Study plan — the prescriptive focus list (migration 147): completed chapters the
// student hasn't yet passed, ranked quick-win → not-attempted → needs-study.
//   GET ?batch -> { plan: [{ chapter_id, chapter_name, subject_name, best_pct,
//        attempts_used, attempts_remaining, pass_pct, category }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_study_plan", {
    p_batch: sp.get("batch") || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data ?? [] });
}
