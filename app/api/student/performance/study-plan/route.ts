// Study plan — the prescriptive focus list + target/projection (migration 147, 153).
// Completed chapters the student hasn't yet passed, ranked quick-win → not-attempted
// → needs-study, plus a target-gap + projected average when ?target is given (FR-8).
//   GET ?batch&target -> { plan: [{ chapter_id, chapter_name, subject_name, best_pct,
//        attempts_used, attempts_remaining, pass_pct, category }],
//        projection: { target, current_avg, projected_avg, chapters_to_lift,
//        gap_to_target, reaches_target } }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;

  // target is an optional whole-percent 0..100; reject anything else with 422.
  let target: number | null = null;
  const raw = sp.get("target");
  if (raw !== null && raw !== "") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100)
      return NextResponse.json({ error: "target must be a whole number between 0 and 100" }, { status: 422 });
    target = n;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_study_plan", {
    p_batch: sp.get("batch") || null,
    p_target: target,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data?.items ?? [], projection: data?.projection ?? null });
}
