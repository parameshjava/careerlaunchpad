// Study plan — the prescriptive focus list, the target ladder and the pass-mark
// floor (migrations 147, 153, 154).
//
// Items are every chapter the student can still act on that is short of where they
// want to be: not yet passed, or (with ?target) passing but below it. Ranked by
// points_to_target — what lifting that one chapter adds to the overall average —
// with `category` carrying achievability as a chip.
//
//   GET ?batch&target -> { plan: [{ chapter_id, chapter_name, subject_name, best_pct,
//        attempts_used, attempts_remaining, pass_pct, category, points_to_target }],
//        projection: { target, current_avg, projected_avg, chapters_to_lift,
//        gap_to_target, reaches_target },
//        ladder: [{ key, chapters, assumed_pct, avg }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchStudyPlan } from "@/lib/student-performance-query";

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
  try {
    const { items, projection, ladder } = await fetchStudyPlan(supabase, sp.get("batch") || null, target);
    return NextResponse.json({ plan: items, projection, ladder });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
