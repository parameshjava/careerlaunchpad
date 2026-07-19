/**
 * Close a sitting early (docs/EXAM_MODULE_SPEC.md §9.3). Opening is automatic at
 * the start time and a closed sitting is final — this route only closes (there
 * is no re-open). Sittings also auto-close 2 min after their window (migration
 * 111); this is the manual early-stop.
 *
 *   POST body { status: "closed" } -> { ok }
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

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.status !== "closed")
    return NextResponse.json({ error: "This sitting can only be closed." }, { status: 422 });

  const supabase = await createClient();

  const { error } = await supabase.from("exam_session").update({ status: "closed" }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Closing finalizes anyone still in progress (answered but never submitted),
  // so abandoned attempts are graded instead of lost.
  const { error: gradeErr } = await supabase.rpc("grade_session_in_progress", { p_session_id: id });
  if (gradeErr) return NextResponse.json({ ok: true, warning: `closed, but grading failed: ${gradeErr.message}` });

  return NextResponse.json({ ok: true });
}
