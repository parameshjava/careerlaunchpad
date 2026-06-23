/**
 * GET /api/admin/intake?college_id=&status=
 * Lists staged intake rows for the console review table. RLS scopes what each
 * caller can see (owner/support: all; college_admin: their own college).
 */
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("student.intake.import");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  let query = supabase
    .from("student_intake")
    .select("id, email, full_name, phone, college_id, status, invite_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  const collegeId = req.nextUrl.searchParams.get("college_id");
  const status = req.nextUrl.searchParams.get("status");
  if (collegeId) query = query.eq("college_id", collegeId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
