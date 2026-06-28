/**
 * Open / close a sitting (docs/EXAM_MODULE_SPEC.md §9.3). Toggles the session
 * status so students can (or can no longer) start attempts.
 *
 *   POST body { status: "open" | "closed" | "scheduled" } -> { ok }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

const ALLOWED = ["scheduled", "open", "closed"];

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
  if (!body.status || !ALLOWED.includes(body.status))
    return NextResponse.json({ error: "status: must be scheduled | open | closed" }, { status: 422 });

  const supabase = await createClient();

  // Guard: once results are published the sitting is final — don't let it reopen.
  if (body.status === "open") {
    const { data: s } = await supabase
      .from("exam_session")
      .select("results_published")
      .eq("id", id)
      .maybeSingle();
    if (s?.results_published)
      return NextResponse.json({ error: "Results are published; this sitting cannot be reopened." }, { status: 409 });
  }

  const { error } = await supabase.from("exam_session").update({ status: body.status }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Closing the sitting finalizes anyone still in progress (answered but never
  // submitted), so abandoned attempts are graded instead of lost.
  if (body.status === "closed") {
    const { error: gradeErr } = await supabase.rpc("grade_session_in_progress", { p_session_id: id });
    if (gradeErr) return NextResponse.json({ ok: true, warning: `closed, but grading failed: ${gradeErr.message}` });
  }

  return NextResponse.json({ ok: true });
}
