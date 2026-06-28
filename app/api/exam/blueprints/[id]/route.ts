/**
 * A single blueprint (docs/EXAM_MODULE_SPEC.md §9.2).
 *
 *   GET   -> the full blueprint (sections + chapter quotas)
 *   PATCH -> update. Exam-level fields can always change. Sections/quotas can only
 *            be replaced while the blueprint has NO sittings — a generated paper
 *            references exam_section rows, so replacing them once a session exists
 *            would break those references (409).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchBlueprint } from "@/lib/exam-query";
import { validateBlueprint } from "@/lib/exam-validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  try {
    const blueprint = await fetchBlueprint(supabase, id);
    if (!blueprint) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ blueprint });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { clean, errors } = validateBlueprint(body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const supabase = await createClient();
  const existing = await fetchBlueprint(supabase, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: uErr } = await supabase
    .from("exam")
    .update({
      title: clean.title,
      duration_minutes: clean.duration_minutes,
      shuffle_questions: clean.shuffle_questions,
      shuffle_options: clean.shuffle_options,
      negative_mark_per_wrong: clean.negative_mark_per_wrong,
    })
    .eq("id", id);
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

  // Replace sections only when there are no sittings yet.
  const { count: sessionCount } = await supabase
    .from("exam_session")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", id);
  if ((sessionCount ?? 0) > 0) {
    return NextResponse.json({
      ok: true,
      id,
      note: "Exam-level fields updated. Sections were not changed because this blueprint already has sittings.",
    });
  }

  // Atomic delete+insert of sections + chapter quotas via a single SECURITY
  // DEFINER function, so a failed insert can't leave the blueprint section-less.
  const { error: rpcErr } = await supabase.rpc("replace_blueprint_sections", {
    p_exam_id: id,
    p_sections: clean.sections,
  });
  if (rpcErr) return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
