/**
 * Staff-facing read/write of a *target* student's registration profile, powering
 * the console profile editor (/dashboard/students/[id]). Mirrors
 * /api/registration/profile but targets user_id = :id instead of the session
 * user, and is gated by `student.profile.manage` (Owner/Platform Admin/Coordinator).
 * RLS enforces the same permission again. Reuses the shared registration schema
 * (STEP_FIELDS/validatePartial/PROFILE_SELECT) so the two surfaces never drift.
 *
 *   GET   -> { profile, registration_status, last_completed_step, email }
 *   PATCH -> incremental save. Body { step, data } (partial). UPDATE-only, so it
 *            never creates a row for a non-registered id (404 if none exists).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { STEP_FIELDS, PROFILE_SELECT, validatePartial } from "@/lib/registration";
import { recordRegistrationActivity } from "@/lib/request-audit";

const PERM = "student.profile.manage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission(PERM);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("student_profile")
    .select(`${PROFILE_SELECT}, registration_status, last_completed_step,
             college:college_id ( id, name, place, state ),
             app_user:user_id ( email )`)
    .eq("user_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No student profile" }, { status: 404 });

  const row = data as unknown as Record<string, unknown>;
  const appUser = row.app_user;
  const email = Array.isArray(appUser)
    ? (appUser[0] as { email?: string })?.email ?? null
    : (appUser as { email?: string } | null)?.email ?? null;
  const { registration_status, last_completed_step, app_user: _drop, ...profile } = row;
  void _drop;
  return NextResponse.json({ registration_status, last_completed_step, email, profile });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission(PERM);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  let body: { step?: number; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const step = Number(body.step);
  if (!Number.isInteger(step) || step < 1 || step > 6) {
    return NextResponse.json({ error: "step must be 1–6" }, { status: 400 });
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

  const { clean, errors } = await validatePartial(supabase, data);
  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  // Advance last_completed_step monotonically. Also serves as the existence check:
  // no row -> the id isn't a registered student, so there's nothing to edit.
  const { data: current } = await supabase
    .from("student_profile")
    .select("last_completed_step")
    .eq("user_id", id)
    .maybeSingle();
  if (!current) return NextResponse.json({ ok: false, error: "No student profile" }, { status: 404 });
  const nextStep = Math.max(Number(current.last_completed_step ?? 0), step);

  // UPDATE (not upsert): never fabricate a profile row for a non-registered id.
  const { data: updated, error: upErr } = await supabase
    .from("student_profile")
    .update({ ...clean, last_completed_step: nextStep, updated_at: new Date().toISOString() })
    .eq("user_id", id)
    .select(`${PROFILE_SELECT}, registration_status, last_completed_step`)
    .maybeSingle();

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "Could not save profile" }, { status: 500 });

  // Audit (issue #83) — same call as the student's own route, so a staff edit is
  // recorded identically and `updated_by` shows the staff member, not the student.
  await recordRegistrationActivity(supabase, req, id, "save");

  const { registration_status, last_completed_step, ...profile } = updated as unknown as Record<string, unknown>;
  return NextResponse.json({ ok: true, registration_status, last_completed_step, profile });
}
