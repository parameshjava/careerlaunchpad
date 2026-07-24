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
  const { clean, errors } = await validateAssessmentQuestion(supabase, body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  // Insert the question, then its options. supabase-js has no transaction; on an
  // options failure we delete the orphan question so the bank stays consistent.
  const { data: q, error: qErr } = await supabase
    .from("assessment_question")
    .insert({
      subject_id: clean.subject_id,
      chapter_id: clean.chapter_id,
      kind: clean.kind,
      difficulty: clean.difficulty,
      answer_type: clean.answer_type,
      stem: clean.stem,
      stem_image_url: clean.stem_image_url,
      explanation: clean.explanation,
      source: clean.source,
      source_year: clean.source_year,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (qErr) return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });

  const { error: oErr } = await supabase.from("assessment_question_option").insert(
    clean.options.map((o) => ({
      question_id: q.id,
      label: o.label,
      is_correct: o.is_correct,
      position: o.position,
    })),
  );
  if (oErr) {
    await supabase.from("assessment_question").delete().eq("id", q.id);
    return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: q.id });
}
