import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatchSubjectsData } from "@/lib/batch-subject-query";
import { parseSubjectsPayload } from "@/lib/batch-subject-write";

// GET /api/admin/batches/[id]/subjects — the batch's subjects + assigned
// mentors, plus the candidate syllabus subjects and eligible mentors for the
// editor pickers.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const data = await fetchBatchSubjectsData(supabase, id);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PUT /api/admin/batches/[id]/subjects — replace the subject set + per-subject
// mentor assignments transactionally (replace_batch_subjects RPC).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSubjectsPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_batch_subjects", {
    p_batch_id: id,
    p_subjects: parsed.value.map((s) => ({
      subject_id: s.subjectId,
      sort_order: s.sortOrder,
      mentor_ids: s.mentorIds,
    })),
  });
  if (error) {
    // The RPC raises a friendly message when a subject with live classes is removed.
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
