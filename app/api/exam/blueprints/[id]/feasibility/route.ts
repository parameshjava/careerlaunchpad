/**
 * Dry-run feasibility check (docs/EXAM_MODULE_SPEC.md §9.4). Reports the
 * (subject, chapter, difficulty) cells the question bank cannot fill for this
 * blueprint, before generation/publish.
 *
 *   POST -> { ok: boolean, shortfalls: [{ subject_id, chapter_id, difficulty, required, available }] }
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

  // Wrap the whole body (not just checkFeasibility): fetchBlueprint or the
  // feasibility RPC can throw, and an uncaught throw returns a non-JSON 500 that
  // the client can't parse — which surfaced as "clicking Check feasibility does
  // nothing". Always return JSON with the real message.
  try {
    const blueprint = await fetchBlueprint(supabase, id);
    if (!blueprint) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const shortfalls = await checkFeasibility(supabase, blueprint);
    return NextResponse.json({
      ok: shortfalls.length === 0,
      shortfalls: shortfalls.map((s) => ({
        subject_id: s.subjectId,
        chapter_id: s.chapterId,
        difficulty: s.difficulty,
        required: s.required,
        available: s.available,
      })),
    });
  } catch (e) {
    console.error("[feasibility] check failed:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Feasibility check failed" },
      { status: 500 },
    );
  }
}
