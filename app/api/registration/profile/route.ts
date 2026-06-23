/**
 * The current student's registration profile.
 *
 *   GET   -> the profile + progress (registration_status, last_completed_step),
 *            so the form can RESUME at last_completed_step + 1.
 *   PATCH -> incremental save. Body { step, data } — `data` is a PARTIAL subset
 *            of the step's fields; only provided fields are written (merge),
 *            last_completed_step advances monotonically. Lenient validation so a
 *            half-finished step still saves. RLS guarantees own-profile only.
 *
 * See docs/REGISTRATION_AND_INTAKE_API.md §4.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STEP_FIELDS, PROFILE_SELECT, validatePartial } from "@/lib/registration";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("student_profile")
    .select(
      `${PROFILE_SELECT}, registration_status, last_completed_step,
       college:college_id ( id, name, place, state )`,
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    // Signed-in student with no profile row yet (not provisioned as a student).
    return NextResponse.json(
      { registration_status: "in_progress", last_completed_step: 0, profile: null },
      { status: 200 },
    );
  }

  const { registration_status, last_completed_step, ...profile } = data as unknown as Record<string, unknown>;
  return NextResponse.json({
    registration_status,
    last_completed_step,
    email: user.email ?? null,
    profile,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
  // Only accept fields that belong to the declared step.
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

  // Advance last_completed_step monotonically.
  const { data: current } = await supabase
    .from("student_profile")
    .select("last_completed_step")
    .eq("user_id", user.id)
    .maybeSingle();
  const nextStep = Math.max(Number(current?.last_completed_step ?? 0), step);

  const { data: updated, error: upErr } = await supabase
    .from("student_profile")
    .update({ ...clean, last_completed_step: nextStep, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select(`${PROFILE_SELECT}, registration_status, last_completed_step`)
    .maybeSingle();

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "No student profile to update" }, { status: 404 });

  const { registration_status, last_completed_step, ...profile } = updated as unknown as Record<string, unknown>;
  return NextResponse.json({ ok: true, registration_status, last_completed_step, profile });
}
