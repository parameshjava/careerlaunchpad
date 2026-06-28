/**
 * Publish a blueprint (docs/EXAM_MODULE_SPEC.md §9.2). Runs the feasibility check
 * first and refuses to publish if the bank can't satisfy it.
 *
 *   POST -> { ok } | 409 { ok:false, shortfalls }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchBlueprint } from "@/lib/exam-query";
import { checkFeasibility } from "@/lib/exam-generate";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  const blueprint = await fetchBlueprint(supabase, id);
  if (!blueprint) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (blueprint.sections.length === 0)
    return NextResponse.json({ error: "Add at least one section first" }, { status: 422 });

  const shortfalls = await checkFeasibility(supabase, blueprint);
  if (shortfalls.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "The question bank cannot satisfy this blueprint yet.",
        shortfalls: shortfalls.map((s) => ({
          subject_id: s.subjectId,
          chapter_id: s.chapterId,
          difficulty: s.difficulty,
          required: s.required,
          available: s.available,
        })),
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("exam").update({ status: "published" }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
