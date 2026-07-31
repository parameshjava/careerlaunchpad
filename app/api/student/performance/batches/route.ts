// The student's enrolled batches, for the performance view's batch filter (FR-7,
// migration 153). Self-only; the picker only renders when there is more than one.
//   GET -> { batches: [{ batch_id, batch_name }] }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";

export async function GET() {
  if (!(await gateStudentAnalytics())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_performance_batches");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batches: data ?? [] });
}
