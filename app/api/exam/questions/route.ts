/**
 * Exam questions (docs/EXAM_MODULE_SPEC.md §9.1). Per-college bank; RLS bounds
 * to the caller's college. A question always has exactly 4 options with ≥1
 * correct (validated in lib/exam-validation.ts).
 *
 *   GET  ?subject_id&chapter_id&difficulty&include_archived -> { questions: [...] }
 *   POST  body { chapter_id, passage_id?, kind, difficulty, answer_type, stem,
 *               stem_image_url?, explanation?, options:[{label,is_correct}] }
 *         -> { ok, id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchQuestions, type Difficulty } from "@/lib/exam-query";
import { validateQuestion } from "@/lib/exam-validation";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  try {
    const questions = await fetchQuestions(supabase, {
      subjectId: sp.get("subject_id") ?? undefined,
      chapterId: sp.get("chapter_id") ?? undefined,
      difficulty: (sp.get("difficulty") as Difficulty | null) ?? undefined,
      includeArchived: sp.get("include_archived") === "true",
    });
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();
  const { clean, errors } = await validateQuestion(supabase, body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  // Insert the question, then its options. supabase-js has no transaction; on an
  // options failure we delete the orphan question so the bank stays consistent.
  const { data: q, error: qErr } = await supabase
    .from("question")
    .insert({
      subject_id: clean.subject_id,
      chapter_id: clean.chapter_id,
      passage_id: clean.passage_id,
      kind: clean.kind,
      difficulty: clean.difficulty,
      answer_type: clean.answer_type,
      stem: clean.stem,
      stem_image_url: clean.stem_image_url,
      explanation: clean.explanation,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (qErr) return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });

  const { error: oErr } = await supabase.from("question_option").insert(
    clean.options.map((o) => ({
      question_id: q.id,
      label: o.label,
      is_correct: o.is_correct,
      position: o.position,
    })),
  );
  if (oErr) {
    await supabase.from("question").delete().eq("id", q.id);
    return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: q.id });
}
