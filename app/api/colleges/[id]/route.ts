/**
 * Single-college read + update (CLAUDE.md "API design first"). The PATCH lets a
 * manager edit any field and also flip `status` (archive ⇄ restore) — there is no
 * hard DELETE because student_profile.college_id / user_role.scope_college_id
 * reference this row. Writes require `college.manage`; RLS enforces it again.
 *
 *   GET   /api/colleges/:id            -> { college: College }
 *   PATCH /api/colleges/:id  body: Partial<CollegeInput>  -> { ok }  (409 dup)
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
