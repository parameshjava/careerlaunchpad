import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/admin/enrollments/[id] — approve/reject a (self-enrolled) enrolment.
// Body: { status: "active" | "cancelled" }. Gated on finance.manage.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "cancelled")
    return NextResponse.json({ error: "status must be active or cancelled." }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_enrollment")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
