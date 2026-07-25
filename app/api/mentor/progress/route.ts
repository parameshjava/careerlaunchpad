// Batch chapter progress — mentor surface (the "My teaching" board on /mentor).
// A mentor drives progress only for the subjects they're assigned to; the
// set_batch_*_progress RPCs authorize that internally (assigned mentor OR
// batch.progress.manage), so these handlers just require a signed-in user.
//
//   GET  -> { batches: [{ batchId, batchName, batchStatus, subjects:[...] }] }
//   POST  body { batch_id, subject_id, chapter_id?, status } -> { ok }
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMentorProgress } from "@/lib/batch-progress-query";

const STATUSES = ["not_started", "in_progress", "completed"];

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const batches = await fetchMentorProgress(supabase, ctx.userId);
    return NextResponse.json({ batches });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { batch_id?: string; subject_id?: string; chapter_id?: string | null; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const batchId = typeof body.batch_id === "string" ? body.batch_id : "";
  const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
  const chapterId = typeof body.chapter_id === "string" ? body.chapter_id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!batchId || !subjectId || !STATUSES.includes(status))
    return NextResponse.json(
      { error: "batch_id, subject_id and a valid status are required" },
      { status: 422 },
    );

  const supabase = await createClient();
  const { error } = chapterId
    ? await supabase.rpc("set_batch_chapter_progress", {
        p_batch_id: batchId,
        p_subject_id: subjectId,
        p_chapter_id: chapterId,
        p_status: status,
      })
    : await supabase.rpc("set_batch_subject_progress", {
        p_batch_id: batchId,
        p_subject_id: subjectId,
        p_status: status,
      });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    const code = msg.includes("Forbidden") ? 403 : 422;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
