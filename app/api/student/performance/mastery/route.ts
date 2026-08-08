// The FR-5 subject × chapter mastery grid (migration 154) — every completed
// chapter across every subject in one read, in syllabus order.
//   GET ?from&to&batch -> { cells: [{ subject_id, subject_name, chapter_id,
//        chapter_name, best_pct, pass_pct, attempts_used }] }
// best_pct is null for a chapter with no submitted attempt; those cells render
// neutral ("not assessed"), never as a low score.
// `?student=` lets a college staff member / admin read ONE of their own
// students (#111). perf_target() (migration 176) authorizes it in the DB and
// raises for anyone else, so this route only has to pass it through.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchMastery, readScope } from "@/lib/student-performance-query";

export async function GET(req: NextRequest) {
  const scope = readScope(req.nextUrl.searchParams);
  if (!(await gateStudentAnalytics(scope.student)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  try {
    return NextResponse.json({ cells: await fetchMastery(supabase, scope) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
