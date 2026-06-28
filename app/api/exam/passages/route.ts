/**
 * Reading passages (docs/EXAM_MODULE_SPEC.md §9.1). A passage groups several
 * questions (e.g. English RC). college is resolved via the subject under RLS.
 *
 *   GET  ?subject_id -> { passages: [{ id, subjectId, title, body }] }
 *   POST  body { subject_id, title?, body } -> { ok, id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchPassages } from "@/lib/exam-query";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const subjectId = req.nextUrl.searchParams.get("subject_id");
  if (!subjectId) return NextResponse.json({ error: "subject_id: required" }, { status: 400 });

  const supabase = await createClient();
  try {
    const passages = await fetchPassages(supabase, subjectId);
    return NextResponse.json({ passages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let ctx;
  try {
    // Passages are common content (025) — curated with the syllabus.
    ctx = await requirePermission("exam.subject.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { subject_id?: string; title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subjectId = (body.subject_id ?? "").trim();
  const text = (body.body ?? "").trim();
  const title = (body.title ?? "").trim() || null;
  if (!subjectId) return NextResponse.json({ error: "subject_id: required" }, { status: 422 });
  if (!text) return NextResponse.json({ error: "body: required" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("passage")
    .insert({ subject_id: subjectId, title, body: text, created_by: ctx.userId })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
