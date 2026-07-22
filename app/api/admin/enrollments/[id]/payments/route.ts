import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordPayment } from "@/lib/enrollment-write";
import type { PaymentMode } from "@/lib/fee-receipt";

const MODES: PaymentMode[] = ["cash", "upi", "card", "online"];

// POST /api/admin/enrollments/[id]/payments — record a payment; returns the
// receipt id (= payment id) so the client can open the printable receipt.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: enrollmentId } = await params;
  let ctx;
  try {
    ctx = await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = (typeof body.mode === "string" ? body.mode : "cash") as PaymentMode;
  if (!MODES.includes(mode)) return NextResponse.json({ error: "Invalid payment mode." }, { status: 422 });

  const supabase = await createClient();
  const res = await recordPayment(
    supabase,
    enrollmentId,
    {
      amountPaise: Number(body.amountPaise) || 0,
      mode,
      referenceNo: typeof body.referenceNo === "string" ? body.referenceNo : null,
      paidOn: typeof body.paidOn === "string" ? body.paidOn : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    },
    ctx.userId
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 500 });
  return NextResponse.json({ ok: true, receiptId: res.value.paymentId, receiptNo: res.value.receiptNo });
}
