/**
 * GET /api/students — students for the console grid.
 * Returns { students: Student[] } unioned from student_intake (imported, not yet
 * registered) + student_profile (registered). Access is enforced by RLS via the
 * caller's session, so an unauthorized request gets an empty list, not an error.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchStudents } from "@/lib/students-query";

export async function GET() {
  const supabase = await createClient();
  try {
    const students = await fetchStudents(supabase);
    return NextResponse.json({ students });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load students";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
