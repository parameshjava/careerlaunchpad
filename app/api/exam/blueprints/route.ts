/**
 * Exam blueprints (docs/EXAM_MODULE_SPEC.md §9.2). A blueprint is the reusable
 * template: per-subject question count + difficulty mix + optional per-chapter
 * quota. Per-college; RLS bounds to the caller's college.
 *
 *   GET  -> { blueprints: [...] }
 *   POST  body { title, duration_minutes, sections:[...], college_id? } -> { ok, id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchBlueprints } from "@/lib/exam-query";
import { validateBlueprint } from "@/lib/exam-validation";

export async function GET() {
  try {
    await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  try {
    const blueprints = await fetchBlueprints(supabase);
    return NextResponse.json({ blueprints });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requirePermission("exam.blueprint.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { clean, errors } = validateBlueprint(body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const collegeId = (body.college_id as string) || ctx.collegeScopes[0];
  if (!collegeId)
    return NextResponse.json({ error: "college_id: required (no college scope)" }, { status: 422 });

  const supabase = await createClient();

  // Insert the exam (draft), then sections, then chapter quotas. On any failure
  // delete the exam — its FK cascades remove sections + quotas, so no orphans.
  const { data: exam, error: examErr } = await supabase
    .from("exam")
    .insert({
      college_id: collegeId,
      title: clean.title,
      duration_minutes: clean.duration_minutes,
      generation_strategy: clean.generation_strategy,
      shuffle_questions: clean.shuffle_questions,
      shuffle_options: clean.shuffle_options,
      negative_mark_per_wrong: clean.negative_mark_per_wrong,
      status: "draft",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (examErr) return NextResponse.json({ ok: false, error: examErr.message }, { status: 500 });

  const { data: sectionRows, error: secErr } = await supabase
    .from("exam_section")
    .insert(
      clean.sections.map((s) => ({
        exam_id: exam.id,
        subject_id: s.subject_id,
        num_questions: s.num_questions,
        marks_per_question: s.marks_per_question,
        pct_easy: s.pct_easy,
        pct_medium: s.pct_medium,
        pct_hard: s.pct_hard,
        pct_very_hard: s.pct_very_hard,
        position: s.position,
      })),
    )
    .select("id, position");
  if (secErr) {
    await supabase.from("exam").delete().eq("id", exam.id);
    return NextResponse.json({ ok: false, error: secErr.message }, { status: 500 });
  }

  const idByPosition = new Map<number, string>((sectionRows ?? []).map((r) => [r.position, r.id]));
  const quotaRows = clean.sections.flatMap((s) =>
    (s.chapter_quota ?? []).map((q) => ({
      section_id: idByPosition.get(s.position)!,
      subject_id: s.subject_id,
      chapter_id: q.chapter_id,
      pct: q.pct,
    })),
  );
  if (quotaRows.length > 0) {
    const { error: qErr } = await supabase.from("exam_section_chapter").insert(quotaRows);
    if (qErr) {
      await supabase.from("exam").delete().eq("id", exam.id);
      return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: exam.id });
}
