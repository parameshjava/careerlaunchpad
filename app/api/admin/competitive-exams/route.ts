import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCompetitiveExams } from "@/lib/competitive-exam-query";
import { parseCompetitiveExamPayload, writeCompetitiveExamSyllabus } from "@/lib/competitive-exam-write";

// GET /api/admin/competitive-exams — list competitive exams (with syllabus counts).
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const exams = await fetchCompetitiveExams(supabase);
    return NextResponse.json({ exams });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/competitive-exams — create a competitive exam (+ optional syllabus).
// Also serves the course editor's quick "add exam" (code + name only).
export async function POST(req: NextRequest) {
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

  const parsed = parseCompetitiveExamPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const p = parsed.value;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("competitive_exam")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last?.sort_order as number | undefined) ?? 0) + 1;

  const { data: exam, error } = await supabase
    .from("competitive_exam")
    .insert({
      code: p.code,
      name: p.name,
      description: p.description,
      is_active: p.isActive,
      sort_order: sortOrder,
    })
    .select("id, code, name")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "An exam with this code already exists." : error.message },
      { status }
    );
  }

  const write = await writeCompetitiveExamSyllabus(supabase, exam.id, p.subjects);
  if (write.error) {
    await supabase.from("competitive_exam").delete().eq("id", exam.id);
    return NextResponse.json({ error: write.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, competitiveExam: exam });
}
