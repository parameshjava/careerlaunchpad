import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchBatches } from "@/lib/batch-query";
import { parseBatchPayload, writeBatchChildren } from "@/lib/batch-write";

// GET /api/admin/batches — list batches (with course name + rollup counts).
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const batches = await fetchBatches(supabase);
    return NextResponse.json({ batches });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/batches — create a batch + its colleges + fee lines.
export async function POST(req: NextRequest) {
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

  const parsed = parseBatchPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const p = parsed.value;

  const supabase = await createClient();
  const { data: batch, error } = await supabase
    .from("batch")
    .insert({
      course_id: p.courseId,
      name: p.name,
      code: p.code,
      academic_year: p.academicYear,
      delivery_mode: p.deliveryMode,
      start_date: p.startDate,
      end_date: p.endDate,
      currency: p.currency,
      status: p.status,
      closed_at: p.status === "closed" ? new Date().toISOString() : null,
      closed_by: p.status === "closed" ? ctx.userId : null,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "A batch with this code already exists." : error.message },
      { status }
    );
  }

  const write = await writeBatchChildren(supabase, batch.id, p);
  if (write.error) {
    await supabase.from("batch").delete().eq("id", batch.id);
    return NextResponse.json({ error: write.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: batch.id });
}
