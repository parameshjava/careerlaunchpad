/**
 * Regenerate a sitting's paper with a fresh draw (docs/EXAM_MODULE_SPEC.md §9.3).
 * Only allowed before anyone has started — otherwise it would change the paper
 * out from under in-flight attempts.
 *
 *   POST -> { ok, paper_id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchBlueprint } from "@/lib/exam-query";
import { writePaper } from "@/lib/exam-generate";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.paper.generate");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("exam_session")
    .select("id, exam_id")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Refuse if any attempt has started — the paper is already in use.
  const { count: attemptCount } = await supabase
    .from("exam_attempt")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);
  if ((attemptCount ?? 0) > 0)
    return NextResponse.json({ error: "Cannot regenerate — students have already started." }, { status: 409 });

  const blueprint = await fetchBlueprint(supabase, session.exam_id as string);
  if (!blueprint) return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });

  // Write the NEW paper first; only if it succeeds do we drop the old one(s).
  // This way a failed (re)generation leaves the existing working paper intact
  // instead of stranding the sitting with no paper at all.
  try {
    const seed = Math.floor(Math.random() * 2_000_000_000);
    const paperId = await writePaper(supabase, id, blueprint, seed);
    await supabase.from("exam_paper").delete().eq("session_id", id).neq("id", paperId);
    return NextResponse.json({ ok: true, paper_id: paperId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 409 });
  }
}
