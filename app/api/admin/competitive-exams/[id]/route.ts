import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCompetitiveExam } from "@/lib/competitive-exam-query";
import {
  parseCompetitiveExamPayload,
  writeCompetitiveExamSyllabus,
  deleteCompetitiveExamSyllabus,
} from "@/lib/competitive-exam-write";

// GET /api/admin/competitive-exams/[id] — the full editable exam (+ syllabus).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const exam = await fetchCompetitiveExam(supabase, id);
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    return NextResponse.json({ exam });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/admin/competitive-exams/[id] — active toggle ({ isActive }) or full update.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();
  const b = (body ?? {}) as Record<string, unknown>;

  // Active-only toggle.
  if (typeof b.isActive === "boolean" && Object.keys(b).length === 1) {
    const { error } = await supabase.from("competitive_exam").update({ is_active: b.isActive }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const parsed = parseCompetitiveExamPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const p = parsed.value;

  const { error: uerr } = await supabase
    .from("competitive_exam")
    .update({ code: p.code, name: p.name, description: p.description, is_active: p.isActive })
    .eq("id", id);
  if (uerr) {
    const status = uerr.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "An exam with this code already exists." : uerr.message },
      { status }
    );
  }

  const del = await deleteCompetitiveExamSyllabus(supabase, id);
  if (del.error) return NextResponse.json({ error: del.error }, { status: 500 });
  const write = await writeCompetitiveExamSyllabus(supabase, id, p.subjects);
  if (write.error) return NextResponse.json({ error: write.error }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
