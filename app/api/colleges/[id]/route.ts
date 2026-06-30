/**
 * Single-college read + update + delete (CLAUDE.md "API design first"). PATCH lets
 * a manager edit any field and flip `status` (archive ⇄ restore). DELETE is a hard
 * delete, but guarded: it refuses (409) when the row is referenced by data the DB
 * would silently cascade away (user_role, exam, exam_session) or orphan (affiliated
 * colleges via university_id) — archive instead in that case. Remaining NO-ACTION
 * references (student_profile, mentor_profile, …) surface as a 23503 → 409.
 * Writes require `college.manage`; RLS enforces it again.
 *
 *   GET    /api/colleges/:id            -> { college: College }
 *   PATCH  /api/colleges/:id  body: Partial<CollegeInput>  -> { ok }  (409 dup)
 *   DELETE /api/colleges/:id            -> { ok }  (409 if referenced, 404 if absent)
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, requirePermission } from "@/lib/auth";
import { COLLEGE_SELECT, SELF_UNIVERSITY, parseCollegeInput } from "@/lib/college";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college")
    .select(COLLEGE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "College not found" }, { status: 404 });
  return NextResponse.json({ college: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("college.manage");
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

  const parsed = parseCollegeInput(body, { partial: true });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });
  if (Object.keys(parsed.values).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 422 });

  // "Mark this row as a university" → self-associate (the id is the param here,
  // so unlike create we can resolve the sentinel inline).
  if (parsed.values.university_id === SELF_UNIVERSITY) parsed.values.university_id = id;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college")
    .update(parsed.values)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message =
      status === 409
        ? "A college with this name, place and pincode already exists."
        : error.message;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
  if (!data) return NextResponse.json({ ok: false, error: "College not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

const IN_USE_MSG =
  "This college is referenced by users, exams or affiliated colleges. Archive it instead of deleting.";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("college.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  // Pre-check the references the DB would NOT block: ON DELETE CASCADE (user_role,
  // exam, exam_session) silently deletes children, and university_id is SET NULL,
  // orphaning affiliates. Refuse if any exist so a delete can't destroy real data.
  const [roles, exams, sessions, affiliates] = await Promise.all([
    supabase.from("user_role").select("id", { count: "exact", head: true }).eq("scope_college_id", id),
    supabase.from("exam").select("id", { count: "exact", head: true }).eq("college_id", id),
    supabase.from("exam_session").select("id", { count: "exact", head: true }).eq("college_id", id),
    supabase.from("college").select("id", { count: "exact", head: true }).eq("university_id", id).neq("id", id),
  ]);
  const referenced = (roles.count ?? 0) + (exams.count ?? 0) + (sessions.count ?? 0) + (affiliates.count ?? 0);
  if (referenced > 0) return NextResponse.json({ ok: false, error: IN_USE_MSG }, { status: 409 });

  const { error, count } = await supabase
    .from("college")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    // 23503 = foreign_key_violation from the NO-ACTION refs (student_profile, …).
    const status = error.code === "23503" ? 409 : 500;
    return NextResponse.json(
      { ok: false, error: status === 409 ? IN_USE_MSG : error.message },
      { status },
    );
  }
  if (!count) return NextResponse.json({ ok: false, error: "College not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
