/**
 * Publish / unpublish a sitting's results (docs/EXAM_MODULE_SPEC.md §8). Until
 * published, students cannot see their score (get_exam_result returns
 * {published:false}). Updating exam_session rides the exam_session_manage RLS
 * policy (exam.assign), so the route gate matches.
 *
 *   POST body { published: boolean } -> { ok }
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

  let body: { published?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const published = body.published === true;

  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_session")
    .update({ results_published: published })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
