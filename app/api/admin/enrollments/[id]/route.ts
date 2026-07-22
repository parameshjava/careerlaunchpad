import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchEnrollmentLedger } from "@/lib/enrollment-query";

// GET /api/admin/enrollments/[id] — one enrolment's installment schedule +
// issued receipts, for the batch roster's per-student detail. Gated on finance.manage.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const ledger = await fetchEnrollmentLedger(supabase, id);
    return NextResponse.json(ledger);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/admin/enrollments/[id] — approve/reject a (self-enrolled) enrolment.
// Body: { status: "active" | "cancelled" }. Gated on finance.manage.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { status?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "cancelled")
    return NextResponse.json({ error: "status must be active or cancelled." }, { status: 422 });

  const reason = (body.reason ?? "").trim();
  if (body.status === "cancelled" && !reason)
    return NextResponse.json({ error: "A reason is required to reject an enrolment." }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_enrollment")
    .update({
      status: body.status,
      // Keep the reason on reject; clear it on approve.
      rejection_reason: body.status === "cancelled" ? reason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
