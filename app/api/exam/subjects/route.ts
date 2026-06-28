/**
 * Exam subjects (docs/EXAM_MODULE_SPEC.md §9.1). COMMON / global content
 * (migration 025): readable by any provisioned user (needed to author questions
 * and build blueprints); created/edited only by the central team via the global
 * exam.subject.manage permission. RLS enforces both.
 *
 *   GET  -> { subjects: [{ id, name, status }] }
 *   POST -> body { name } -> { ok, id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, requirePermission } from "@/lib/auth";
import { fetchSubjects } from "@/lib/exam-query";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const includeArchived = req.nextUrl.searchParams.get("include_archived") === "true";
  try {
    const subjects = await fetchSubjects(supabase, { includeArchived });
    return NextResponse.json({ subjects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requirePermission("exam.subject.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name: required" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subject")
    .insert({ name, created_by: ctx.userId })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation (duplicate subject name).
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
