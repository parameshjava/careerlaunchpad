// The student's enrolled batches, for the performance view's batch filter (FR-7,
// migration 153). The picker only renders when there is more than one.
//   GET ?student -> { batches: [{ batch_id, batch_name }] }
// `?student=` lets a college staff member / admin read ONE of their own students
// (#111); perf_target() (migration 176) authorizes it in the DB.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchBatches } from "@/lib/student-performance-query";

export async function GET(req: NextRequest) {
  const student = req.nextUrl.searchParams.get("student") || null;
  if (!(await gateStudentAnalytics(student)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  try {
    return NextResponse.json({ batches: await fetchBatches(supabase, student) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
