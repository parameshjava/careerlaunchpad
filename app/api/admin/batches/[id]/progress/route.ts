// Batch chapter progress — staff/admin surface (Progress tab). Gated on the
// migration-143 permission batch.progress.manage (platform_admin / coordinator /
// support), distinct from the finance.manage that governs the rest of the batch.
//
//   GET  -> { subjects: [{ subjectId, subjectName, progressStatus, chapters:[...] }] }
//   POST  body { subject_id, chapter_id?, status } -> { ok }  (via set_batch_*_progress)
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchProgress } from "@/lib/batch-progress-query";

const STATUSES = ["not_started", "in_progress", "completed"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "batch.progress.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const subjects = await fetchBatchProgress(supabase, id);
    return NextResponse.json({ subjects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "batch.progress.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { subject_id?: string; chapter_id?: string | null; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
  const chapterId = typeof body.chapter_id === "string" ? body.chapter_id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!subjectId || !STATUSES.includes(status))
    return NextResponse.json({ error: "subject_id and a valid status are required" }, { status: 422 });

  const supabase = await createClient();
  const { error } = chapterId
    ? await supabase.rpc("set_batch_chapter_progress", {
        p_batch_id: id,
        p_subject_id: subjectId,
        p_chapter_id: chapterId,
        p_status: status,
      })
    : await supabase.rpc("set_batch_subject_progress", {
        p_batch_id: id,
        p_subject_id: subjectId,
        p_status: status,
      });
  if (error) {
    // The RPC raises friendly messages (Forbidden / batch not open / not found).
    const msg = error.message.replace(/^.*?:\s*/, "");
    const code = msg.includes("Forbidden") ? 403 : 422;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
