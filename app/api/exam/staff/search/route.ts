/**
 * Search platform users to assign as exam staff/evaluators (employers, mentors,
 * college admins, …). Central team only. Backed by search_exam_staff_candidates,
 * which is is_exam_admin()-gated.
 *
 *   GET ?q= -> { candidates: [{ user_id, email, roles[] }] }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_exam_staff_candidates", { p_q: q });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data ?? [] });
}
