import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatch, type BatchStatus } from "@/lib/batch-query";
import { parseBatchPayload } from "@/lib/batch-write";

const STATUSES: BatchStatus[] = ["draft", "open", "running", "closed", "cancelled"];

// Closed batches are stamped with who/when; moving away from closed clears it.
function closeStamp(status: BatchStatus, userId: string) {
  return status === "closed"
    ? { closed_at: new Date().toISOString(), closed_by: userId }
    : { closed_at: null, closed_by: null };
}

// GET /api/admin/batches/[id] — the full editable batch.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const batch = await fetchBatch(supabase, id);
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    return NextResponse.json({ batch });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/admin/batches/[id] — status-only change (e.g. Close), or full update.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();
  const b = (body ?? {}) as Record<string, unknown>;

  // Status-only change (Close / reopen / cancel).
  if (typeof b.status === "string" && Object.keys(b).length === 1) {
    if (!STATUSES.includes(b.status as BatchStatus))
      return NextResponse.json({ error: "Invalid batch status." }, { status: 422 });
    const status = b.status as BatchStatus;
    const { error } = await supabase
      .from("batch")
      .update({ status, ...closeStamp(status, ctx.userId), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const parsed = parseBatchPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const p = parsed.value;

  const { error: uerr } = await supabase
    .from("batch")
    .update({
      course_id: p.courseId,
      name: p.name,
      code: p.code,
      academic_year: p.academicYear,
      delivery_mode: p.deliveryMode,
      start_date: p.startDate,
      end_date: p.endDate,
      currency: p.currency,
      status: p.status,
      ...closeStamp(p.status, ctx.userId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (uerr) {
    const status = uerr.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "A batch with this code already exists." : uerr.message },
      { status }
    );
  }

  // Replace colleges + fee lines atomically (one transaction inside the RPC), so
  // a failed reinsert can never leave the batch stripped of its children.
  const { error: rerr } = await supabase.rpc("replace_batch_children", {
    p_batch_id: id,
    p_college_ids: p.collegeIds,
    p_fee_lines: p.feeLines.map((f, i) => ({
      label: f.label,
      amount_paise: f.amountPaise,
      sort_order: i,
    })),
  });
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
