/**
 * A single exam question (docs/EXAM_MODULE_SPEC.md §9.1, §6.3).
 *
 *   GET   -> the full question (stem, options WITH correct flags — authors only)
 *   PATCH -> edit. Integrity rule: a question already REFERENCED by a generated
 *            paper or an attempt is immutable — archive it and create a new one
 *            instead (409). Editing an unreferenced question bumps its version.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchQuestionFull } from "@/lib/exam-query";
import { validateQuestion } from "@/lib/exam-validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  try {
    const question = await fetchQuestionFull(supabase, id);
    if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ question });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function isReferenced(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<boolean> {
  const [paper, attempt] = await Promise.all([
    supabase.from("exam_paper_question").select("question_id", { count: "exact", head: true }).eq("question_id", id),
    supabase.from("exam_attempt_question").select("question_id", { count: "exact", head: true }).eq("question_id", id),
  ]);
  return (paper.count ?? 0) > 0 || (attempt.count ?? 0) > 0;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  void ctx;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();

  const existing = await fetchQuestionFull(supabase, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (await isReferenced(supabase, id)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This question is used in an exam paper or attempt and cannot be edited. Archive it and create a new one.",
      },
      { status: 409 },
    );
  }

  const { clean, errors } = await validateQuestion(supabase, body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const { error: uErr } = await supabase
    .from("question")
    .update({
      subject_id: clean.subject_id,
      chapter_id: clean.chapter_id,
      passage_id: clean.passage_id,
      kind: clean.kind,
      difficulty: clean.difficulty,
      answer_type: clean.answer_type,
      stem: clean.stem,
      stem_image_url: clean.stem_image_url,
      explanation: clean.explanation,
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

  // Replace the option set (question is unreferenced, so this is safe).
  await supabase.from("question_option").delete().eq("question_id", id);
  const { error: oErr } = await supabase.from("question_option").insert(
    clean.options.map((o) => ({
      question_id: id,
      label: o.label,
      is_correct: o.is_correct,
      position: o.position,
    })),
  );
  if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id, version: existing.version + 1 });
}
