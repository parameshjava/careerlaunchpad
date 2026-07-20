/**
 * Admin resume of an aborted exam attempt (design 2026-07-20). Only staff for
 * the sitting may resume, and only while resume_count < 2 — both re-checked in
 * resume_exam_attempt. Mirrors sessions/[id]/close/route.ts.
 *
 *   POST -> { ok } | { error }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.assign");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_exam_attempt", { p_attempt_id: id });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true });
}
