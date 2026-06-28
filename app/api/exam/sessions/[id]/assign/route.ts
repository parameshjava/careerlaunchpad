/**
 * Assign students to a sitting (docs/EXAM_MODULE_SPEC.md §9.3). Either an explicit
 * list of student ids, or the whole college (college_wide). RLS bounds the roster
 * to the session's college (exam.assign).
 *
 *   POST body { student_ids?: string[], college_wide?: boolean } -> { ok, assigned }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.assign");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: { student_ids?: string[]; college_wide?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("exam_session")
    .select("id, college_id")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let studentIds: string[] = Array.isArray(body.student_ids) ? body.student_ids : [];
  if (body.college_wide) {
    // Approved students of this college (visible to the admin under RLS).
    const { data: students, error } = await supabase
      .from("student_profile")
      .select("user_id")
      .eq("college_id", session.college_id)
      .eq("status", "approved");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    studentIds = (students ?? []).map((s) => s.user_id as string);
  }

  if (studentIds.length === 0)
    return NextResponse.json({ error: "No students to assign" }, { status: 422 });

  const { error: insErr } = await supabase
    .from("exam_session_student")
    .upsert(
      studentIds.map((sid) => ({ session_id: id, student_id: sid, status: "invited" })),
      { onConflict: "session_id,student_id", ignoreDuplicates: true },
    );
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, assigned: studentIds.length });
}
