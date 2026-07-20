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

  const supabase = await createClient();

  // Once the exam's sitting has opened, it's locked (spec D6/R9).
  const { data: opened } = await supabase
    .from("exam_session")
    .select("id")
    .eq("exam_id", id)
    .not("opens_at", "is", null)
    .lte("opens_at", new Date().toISOString())
    .limit(1);
  if (opened && opened.length)
    return NextResponse.json(
      { error: "This exam has started and can no longer be edited." },
      { status: 409 },
    );

  // Wizard draft save: lenient. Persist exam-level fields + draft_step always;
  // replace sections only if the provided set is valid (partial edits don't
  // block saving progress). Full validation is deferred to publish (R4).
  if (body.draft === true) {
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") patch.title = body.title.trim() || "Untitled exam";
    if (body.duration_minutes != null) patch.duration_minutes = Number(body.duration_minutes);
    if (body.shuffle_questions != null) patch.shuffle_questions = body.shuffle_questions === true;
    if (body.shuffle_options != null) patch.shuffle_options = body.shuffle_options === true;
    if (body.negative_mark_per_wrong != null)
      patch.negative_mark_per_wrong = Number(body.negative_mark_per_wrong);
    if (body.draft_step != null) patch.draft_step = Number(body.draft_step);
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("exam").update(patch).eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (Array.isArray(body.sections) && body.sections.length) {
      const { clean } = validateBlueprint(body);
      if (clean) {
        await supabase.rpc("replace_blueprint_sections", {
          p_exam_id: id,
          p_sections: clean.sections,
        });
      }
    }
    return NextResponse.json({ ok: true, id });
  }

  const { clean, errors } = validateBlueprint(body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

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

// Delete an exam. Cascades to sections, sittings, papers and any attempts.
// Refused once the exam's window has opened (it may have student attempts). RLS
// enforces exam-admin rights again.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  // Deletable only while no student has attempted it (draft, scheduled/upcoming,
  // or closed-with-nobody). An exam with any attempt holds student submissions/
  // results, so it's protected.
  const { data: sessions } = await supabase
    .from("exam_session")
    .select("id")
    .eq("exam_id", id);
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (sessionIds.length) {
    const { count } = await supabase
      .from("exam_attempt")
      .select("*", { count: "exact", head: true })
      .in("session_id", sessionIds);
    if (count && count > 0)
      return NextResponse.json(
        { error: "Students have attempted this exam — it can no longer be deleted." },
        { status: 409 },
      );
  }

  const { error } = await supabase.from("exam").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
