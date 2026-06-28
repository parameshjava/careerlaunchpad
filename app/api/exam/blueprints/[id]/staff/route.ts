/**
 * Exam staff (evaluators) for a blueprint — chosen by the central team at exam
 * creation. They can view the exam's blueprint, answer key and results, and
 * enter/adjust marks (see migration 024). RLS on exam_staff restricts writes to
 * is_exam_admin(); the route gate matches.
 *
 *   GET    -> { staff: [{ user_id, email }] }
 *   POST    body { user_id } -> { ok }
 *   DELETE  ?user_id=        -> { ok }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_exam_staff", { p_exam_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.user_id) return NextResponse.json({ error: "user_id: required" }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_staff")
    .upsert(
      { exam_id: id, user_id: body.user_id, created_by: ctx.userId },
      { onConflict: "exam_id,user_id", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id: required" }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_staff")
    .delete()
    .eq("exam_id", id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
