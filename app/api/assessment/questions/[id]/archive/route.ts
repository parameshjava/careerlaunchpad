/**
 * Archive an assessment question (migration 143). Never hard-deleted once it may
 * be referenced by a quiz attempt — flipped to status 'archived' so attempt
 * snapshots never dangle and start_chapter_quiz_attempt stops picking it.
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
    .from("assessment_question")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
