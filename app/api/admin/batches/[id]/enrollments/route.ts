import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enrolStudentsBulk, type BulkEnrolItem } from "@/lib/enrollment-write";
import type { ConcessionType } from "@/lib/fee-receipt";

const CONCESSIONS: ConcessionType[] = ["none", "discount", "scholarship", "full_waiver"];

// POST /api/admin/batches/[id]/enrollments — bulk-enrol students into the batch.
// Body: { enrollments: [{ studentId, collegeId?, concessionType, concessionPaise,
// concessionReason?, paymentOption, installmentCount? }] }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params;
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

  const raw = Array.isArray(body.enrollments) ? body.enrollments : [];
  if (raw.length === 0)
    return NextResponse.json({ error: "Select at least one student to enrol." }, { status: 422 });

  const items: BulkEnrolItem[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const studentId = typeof o.studentId === "string" ? o.studentId : "";
    if (!studentId) return NextResponse.json({ error: "Each row needs a student." }, { status: 422 });
    const concessionType = (typeof o.concessionType === "string" ? o.concessionType : "none") as ConcessionType;
    if (!CONCESSIONS.includes(concessionType))
      return NextResponse.json({ error: "Invalid concession type." }, { status: 422 });
    items.push({
      studentId,
      collegeId: typeof o.collegeId === "string" ? o.collegeId : null,
      concessionType,
      concessionPaise: Number(o.concessionPaise) || 0,
      concessionReason: typeof o.concessionReason === "string" ? o.concessionReason : null,
      paymentOption: o.paymentOption === "installments" ? "installments" : "full",
      installmentCount: Number(o.installmentCount) || 0,
    });
  }

  const supabase = await createClient();
  const res = await enrolStudentsBulk(supabase, batchId, items, ctx.userId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 500 });
  return NextResponse.json({ ok: true, ...res.value });
}
