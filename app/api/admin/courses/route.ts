import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCourses } from "@/lib/course-query";
import { parseCoursePayload, writeCourseChildren } from "@/lib/course-write";

// GET /api/admin/courses — list courses (with rollup counts).
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const courses = await fetchCourses(supabase);
    return NextResponse.json({ courses });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/courses — create a course template + its nested rows.
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCoursePayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const p = parsed.value;

  const supabase = await createClient();
  const { data: course, error } = await supabase
    .from("course")
    .insert({
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      status: p.status,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "A course with this slug already exists." : error.message },
      { status }
    );
  }

  const write = await writeCourseChildren(supabase, course.id, p);
  if (write.error) {
    // Roll back the just-created course (cascades any children written so far).
    await supabase.from("course").delete().eq("id", course.id);
    return NextResponse.json({ error: write.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: course.id });
}
