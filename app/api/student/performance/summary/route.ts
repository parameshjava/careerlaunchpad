// Snapshot tiles for the student's performance view (migration 147).
//   GET ?from&to&batch -> { summary: { overall_pct, pass_rate_pct, chapters_assessed,
//        chapters_completed, strongest_subject, strongest_pct, weakest_subject, weakest_pct } }
// `?student=` lets a college staff member / admin read ONE of their own
// students (#111). perf_target() (migration 176) authorizes it in the DB and
// raises for anyone else, so this route only has to pass it through.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchSummary, readScope } from "@/lib/student-performance-query";

export async function GET(req: NextRequest) {
  const scope = readScope(req.nextUrl.searchParams);
  if (!(await gateStudentAnalytics(scope.student)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  try {
    return NextResponse.json({ summary: (await fetchSummary(supabase, scope)) ?? {} });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
