/**
 * Publish a blueprint AND materialise its sitting (spec 2026-07-13). Runs the
 * feasibility check, publishes, then creates the single `exam_session` for the
 * whole college (or regenerates its paper if it already exists — re-preview is
 * allowed until the exam starts, spec D6). Central-only (D4: exam.paper.generate).
 *
 *   POST -> { ok, session_id, paper_id } | 409 { ok:false, shortfalls } | 409 locked
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchBlueprint } from "@/lib/exam-query";
import { checkFeasibility, writePaper } from "@/lib/exam-generate";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    // Publishing generates the paper from the shared bank → central-only.
    ctx = await requirePermission("exam.paper.generate");
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

  // The wizard owns exactly one sitting per exam. Reuse it if present.
  const { data: existing } = await supabase
    .from("exam_session")
    .select("id, opens_at")
    .eq("exam_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Locked once the window has opened (spec D6).
  if (existing?.opens_at && new Date(existing.opens_at) <= new Date())
    return NextResponse.json(
      { error: "This exam has started and can no longer be republished." },
      { status: 409 },
    );

  await supabase.from("exam").update({ status: "published" }).eq("id", id);

  const seed = Math.floor(Math.random() * 2_000_000_000);
  try {
    let sessionId: string;
    if (existing) {
      // Re-preview: regenerate the paper for the existing (not-yet-open) sitting.
      await supabase.from("exam_paper").delete().eq("session_id", existing.id);
      sessionId = existing.id;
    } else {
      const { data: exam } = await supabase
        .from("exam")
        .select("college_id, title")
        .eq("id", id)
        .single();
      const { data: session, error: sErr } = await supabase
        .from("exam_session")
        .insert({
          exam_id: id,
          college_id: exam!.college_id,
          label: exam!.title,
          mode: "online",
          status: "scheduled",
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
      sessionId = session.id;
    }
    const paperId = await writePaper(supabase, sessionId, blueprint, seed);
    return NextResponse.json({ ok: true, session_id: sessionId, paper_id: paperId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
