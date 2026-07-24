/**
 * Assessment questions (migration 143). A SEPARATE global bank from the exam
 * question bank, feeding per-chapter quizzes. Gated by exam.question.manage (the
 * same permission the RLS policies use). A question has 4–5 options with ≥1
 * correct (validated in lib/assessment-validation.ts).
 *
 *   GET  ?subject_id&chapter_id&difficulty&include_archived&page&page_size
 *        -> { questions, total, page, pageSize }
 *   POST  body { chapter_id, kind, difficulty, answer_type, stem, stem_image_url?,
 *               explanation, options:[{label,is_correct}] } -> { ok, id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchAssessmentQuestions } from "@/lib/assessment-query";
import { type Difficulty } from "@/lib/exam-query";
import { validateAssessmentQuestion } from "@/lib/assessment-validation";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("page_size")) || 20));
  const supabase = await createClient();
  try {
    const { questions, total } = await fetchAssessmentQuestions(supabase, {
      subjectId: sp.get("subject_id") ?? undefined,
      chapterId: sp.get("chapter_id") ?? undefined,
      difficulty: (sp.get("difficulty") as Difficulty | null) ?? undefined,
      includeArchived: sp.get("include_archived") === "true",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return NextResponse.json({ questions, total, page, pageSize });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("exam.question.manage");
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
  const { clean, errors } = await validateAssessmentQuestion(supabase, body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  // Create the question + its options atomically via the SECURITY DEFINER RPC
  // (supabase-js has no transactions), so a mid-write failure can't leave a
  // question with zero options.
  const { data: id, error } = await supabase.rpc("save_assessment_question", {
    p_id: null,
    p_subject_id: clean.subject_id,
    p_chapter_id: clean.chapter_id,
    p_kind: clean.kind,
    p_difficulty: clean.difficulty,
    p_answer_type: clean.answer_type,
    p_stem: clean.stem,
    p_stem_image_url: clean.stem_image_url,
    p_explanation: clean.explanation,
    p_source: clean.source,
    p_source_year: clean.source_year,
    p_options: clean.options,
  });
  if (error) {
    const status = error.message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, id });
}
