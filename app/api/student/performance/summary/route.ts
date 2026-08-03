// Snapshot tiles for the student's performance view (migration 147).
//   GET ?from&to&batch -> { summary: { overall_pct, pass_rate_pct, chapters_assessed,
//        chapters_completed, strongest_subject, strongest_pct, weakest_subject, weakest_pct } }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchSummary, readScope } from "@/lib/student-performance-query";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  try {
    return NextResponse.json({ summary: (await fetchSummary(supabase, readScope(req.nextUrl.searchParams))) ?? {} });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
