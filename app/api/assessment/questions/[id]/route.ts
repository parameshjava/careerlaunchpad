/**
 * A single assessment question (migration 143).
 *
 *   GET   -> the full question (stem, options WITH correct flags — authors only)
 *   PATCH -> edit. Integrity rule: a question already REFERENCED by a quiz attempt
 *            is immutable — archive it and create a new one instead (409). The edit
 *            (referenced-check + version bump + option replacement) runs in the
 *            SECURITY DEFINER RPC save_assessment_question (migration 146): it
 *            bypasses RLS to see any student's attempt rows (a plain admin query
 *            can't — the table is self-read only), and is transactional.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchAssessmentQuestionFull } from "@/lib/assessment-query";
import { validateAssessmentQuestion } from "@/lib/assessment-validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  try {
    const question = await fetchAssessmentQuestionFull(supabase, id);
    if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ question });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.question.manage");
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
  const { clean, errors } = await validateAssessmentQuestion(supabase, body);
  if (!clean) return NextResponse.json({ ok: false, errors }, { status: 422 });

  // The RPC enforces the immutability guard (crossing RLS), bumps version, and
  // replaces options atomically. Map its raised errors to HTTP status.
  const { error } = await supabase.rpc("save_assessment_question", {
    p_id: id,
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
    const m = error.message;
    if (m.includes("REFERENCED")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This question is used in a quiz attempt and cannot be edited. Archive it and create a new one.",
        },
        { status: 409 },
      );
    }
    if (m.includes("NOT_FOUND")) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (m.includes("Forbidden")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ ok: false, error: m }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
