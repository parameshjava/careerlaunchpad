/**
 * Staff-facing read/write of a *target* mentor's profile, powering the console
 * mentor editor (/dashboard/team/mentors/[userId]). Mirrors /api/mentor/profile
 * but targets user_id = :userId instead of the session user, gated by
 * `mentor.review` (Owner / Platform Admin; RLS re-checks via
 * mentor_profile_admin_update). Reuses the shared mentor schema
 * (STEP_FIELDS/validatePartial/PROFILE_SELECT) so the surfaces never drift.
 *
 *   GET   -> { profile, registration_status, last_completed_step, status, email }
 *   PATCH -> incremental save. Body { step, data } (partial). UPDATE-only (404 if
 *            the id has no mentor profile). Never writes the vetting `status`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { STEP_FIELDS, PROFILE_SELECT, validatePartial } from "@/lib/mentor-registration";

const PERM = "mentor.review";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission(PERM);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mentor_profile")
    .select(`${PROFILE_SELECT}, registration_status, last_completed_step, status, mentor_kind,
             college:college_id ( id, name, place, state ),
             app_user:user_id ( email )`)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No mentor profile" }, { status: 404 });

  const row = data as unknown as Record<string, unknown>;
  const appUser = row.app_user;
  const email = Array.isArray(appUser)
    ? (appUser[0] as { email?: string })?.email ?? null
    : (appUser as { email?: string } | null)?.email ?? null;
  const { registration_status, last_completed_step, status, mentor_kind, app_user: _drop, ...profile } = row;
  void _drop;
  return NextResponse.json({ registration_status, last_completed_step, status, mentor_kind, email, profile });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission(PERM);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;
  const supabase = await createClient();

  let body: { step?: number; data?: Record<string, unknown> };
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

  const { clean, errors } = await validatePartial(supabase, data);
  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  // Existence check + monotonic step advance. UPDATE-only: never fabricate a row.
  const { data: current } = await supabase
    .from("mentor_profile")
    .select("last_completed_step")
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) return NextResponse.json({ ok: false, error: "No mentor profile" }, { status: 404 });
  const nextStep = Math.max(Number(current.last_completed_step ?? 0), step);

  const { data: updated, error: upErr } = await supabase
    .from("mentor_profile")
    .update({ ...clean, last_completed_step: nextStep, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select(`${PROFILE_SELECT}, registration_status, last_completed_step, status`)
    .maybeSingle();

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "Could not save profile" }, { status: 500 });

  const { registration_status, last_completed_step, status, ...profile } = updated as unknown as Record<string, unknown>;
  return NextResponse.json({ ok: true, registration_status, last_completed_step, status, profile });
}
