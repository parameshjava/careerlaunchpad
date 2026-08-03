// The student's enrolled batches, for the performance view's batch filter (FR-7,
// migration 153). Self-only; the picker only renders when there is more than one.
//   GET -> { batches: [{ batch_id, batch_name }] }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchBatches } from "@/lib/student-performance-query";

export async function GET() {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  try {
    return NextResponse.json({ batches: await fetchBatches(supabase) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
