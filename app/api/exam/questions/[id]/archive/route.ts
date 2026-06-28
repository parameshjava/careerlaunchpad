/**
 * Archive a question (docs/EXAM_MODULE_SPEC.md §4 rule 6). Questions are never
 * hard-deleted once they may be referenced — they are flipped to status
 * 'archived' so existing paper references never dangle and the generator stops
 * picking them. RLS bounds this to the caller's college.
 *
 *   POST -> { ok }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase
    .from("question")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
