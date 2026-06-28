/**
 * Exam chapters within a subject (docs/EXAM_MODULE_SPEC.md §9.1). A chapter has
 * no college_id of its own — RLS resolves the owning college through its subject.
 *
 *   GET  ?subject_id -> { chapters: [{ id, subjectId, name }] }
 *   POST  body { subject_id, name } -> { ok, id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, requirePermission } from "@/lib/auth";
import { fetchChapters } from "@/lib/exam-query";

export async function GET(req: NextRequest) {
  // Chapters are common/global (025) — readable by any provisioned user so they
  // can author questions / build blueprints against the shared syllabus.
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const subjectId = req.nextUrl.searchParams.get("subject_id");
  if (!subjectId) return NextResponse.json({ error: "subject_id: required" }, { status: 400 });

  const supabase = await createClient();
  try {
    const chapters = await fetchChapters(supabase, subjectId);
    return NextResponse.json({ chapters });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("exam.subject.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { subject_id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subjectId = (body.subject_id ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!subjectId) return NextResponse.json({ error: "subject_id: required" }, { status: 422 });
  if (!name) return NextResponse.json({ error: "name: required" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chapter")
    .insert({ subject_id: subjectId, name })
    .select("id")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
