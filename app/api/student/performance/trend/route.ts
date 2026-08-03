// Monthly score trend (migration 147). group=subject adds a per-subject series.
//   GET ?from&to&batch&group -> { points: [{ month, subject_id, subject_name, pct }] }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchTrend, readScope } from "@/lib/student-performance-query";

export async function GET(req: NextRequest) {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  try {
    const points = await fetchTrend(supabase, readScope(sp), sp.get("group") === "subject" ? "subject" : "overall");
    return NextResponse.json({ points });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
