import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCourse } from "@/lib/course-query";
import { parseCoursePayload, writeCourseChildren, deleteCourseChildren } from "@/lib/course-write";

// GET /api/admin/courses/[id] — the full editable course.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const course = await fetchCourse(supabase, id);
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    return NextResponse.json({ course });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/admin/courses/[id] — either a status-only change (archive/restore),
// or a full update (course fields + replace all nested rows).
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

  // Status-only change: { status: "active" | "archived" }.
  if (typeof b.status === "string" && Object.keys(b).length === 1) {
    if (b.status !== "active" && b.status !== "archived")
      return NextResponse.json({ error: "Status must be active or archived." }, { status: 422 });
    const { error } = await supabase
      .from("course")
      .update({ status: b.status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const parsed = parseCoursePayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const p = parsed.value;

  const { error: uerr } = await supabase
    .from("course")
    .update({
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      status: p.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (uerr) {
    const status = uerr.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "A course with this slug already exists." : uerr.message },
      { status }
    );
  }

  // Replace nested rows: delete then re-insert to the submitted set.
  const del = await deleteCourseChildren(supabase, id);
  if (del.error) return NextResponse.json({ error: del.error }, { status: 500 });
  const write = await writeCourseChildren(supabase, id, p);
  if (write.error) return NextResponse.json({ error: write.error }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
