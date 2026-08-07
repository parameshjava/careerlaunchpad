/**
 * Staff-facing read/write of a *target* College Staff profile, powering the
 * console editor (/dashboard/college-staff/[userId]). Mirrors
 * /api/college-staff/profile but targets user_id = :userId, gated by
 * `college.staff.view` to read and `college.staff.review` to write. Reuses the
 * shared schema (STEP_FIELDS / validatePartial / PROFILE_SELECT) so the two
 * surfaces never drift.
 *
 * The app-level permission check here is NOT the scope check: can() is true for
 * a college admin's scoped grant regardless of which college the target belongs
 * to. RLS (college_staff_profile_college_read / _reviewer_update, migration 175
 * §7) is what confines them to their own college, so a cross-college id returns
 * 404 rather than data.
 *
 *   GET   -> { profile, subjects, review_notes, status, …, email }
 *   PATCH -> incremental save. Body { step, data, subjects? }. UPDATE-only.
 *            Never writes the vetting `status` — that is set_college_staff_status.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import {
  STEP_FIELDS,
  validatePartial,
  validateSubjects,
} from "@/lib/college-staff-registration";
import {
  fetchStaffProfile,
  replaceStaffSubjects,
  knownSubjectIds,
} from "@/lib/college-staff-query";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission("college.staff.view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;
  const supabase = await createClient();

  const payload = await fetchStaffProfile(supabase, userId);
  // Absent OR filtered by RLS (another college's staff) — same answer either way,
  // deliberately: a 403 would confirm the row exists.
  if (!payload) return NextResponse.json({ error: "No staff profile" }, { status: 404 });

  const { data: account } = await supabase
    .from("app_user")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({ ...payload, email: account?.email ?? null });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission("college.staff.review");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;
  const supabase = await createClient();

  let body: { step?: number; data?: Record<string, unknown>; subjects?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const step = Number(body.step);
  if (!Number.isInteger(step) || step < 1 || step > 3) {
    return NextResponse.json({ error: "step must be 1–3" }, { status: 400 });
  }
  const data = body.data ?? {};
  const allowed = new Set(STEP_FIELDS[step]);
  const stray = Object.keys(data).filter((k) => !allowed.has(k));
  if (stray.length) {
    return NextResponse.json(
      { error: `fields not allowed in step ${step}: ${stray.join(", ")}` },
      { status: 400 },
    );
  }
  if (body.subjects !== undefined && step !== 3) {
    return NextResponse.json({ error: "subjects may only be saved in step 3" }, { status: 400 });
  }

  // Existence check + monotonic step advance. UPDATE-only: never fabricate a row.
  const { data: current } = await supabase
    .from("college_staff_profile")
    .select("last_completed_step")
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) return NextResponse.json({ ok: false, error: "No staff profile" }, { status: 404 });

  const { clean, errors } = await validatePartial(supabase, data);

  let subjectRows: Awaited<ReturnType<typeof validateSubjects>>["rows"] | null = null;
  if (body.subjects !== undefined) {
    const known = await knownSubjectIds(supabase);
    const result = validateSubjects(body.subjects, known);
    errors.push(...result.errors);
    subjectRows = result.rows;
  }
  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const nextStep = Math.max(Number(current.last_completed_step ?? 0), step);

  const { error: upErr } = await supabase
    .from("college_staff_profile")
    .update({ ...clean, last_completed_step: nextStep, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  if (subjectRows) {
    const subjErr = await replaceStaffSubjects(supabase, userId, subjectRows);
    if (subjErr) return NextResponse.json({ ok: false, error: subjErr }, { status: 500 });
  }

  const payload = await fetchStaffProfile(supabase, userId);
  return NextResponse.json({ ok: true, ...payload });
}
