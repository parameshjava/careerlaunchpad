/**
 * The current mentor's registration profile (mentor counterpart of
 * /api/registration/profile).
 *
 *   GET   -> the profile + progress (registration_status, last_completed_step,
 *            and the vetting `status`), so the form can RESUME at
 *            last_completed_step + 1 and show the approval state.
 *   PATCH -> incremental save. Body { step, data } — `data` is a PARTIAL subset
 *            of the step's fields; only provided fields are written (merge),
 *            last_completed_step advances monotonically. Lenient validation so a
 *            half-finished step still saves. RLS guarantees own-profile only and
 *            the status guard trigger keeps `status` reviewer-controlled.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STEP_FIELDS, PROFILE_SELECT, validatePartial } from "@/lib/mentor-registration";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("mentor_profile")
    .select(
      `${PROFILE_SELECT}, registration_status, last_completed_step, status, mentor_kind,
       college:college_id ( id, name, place, state )`,
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      {
        registration_status: "in_progress", last_completed_step: 0,
        status: "pending_review", mentor_kind: null, profile: null,
        email: user.email ?? null,
      },
      { status: 200 },
    );
  }

  const { registration_status, last_completed_step, status, mentor_kind, ...profile } =
    data as unknown as Record<string, unknown>;
  return NextResponse.json({
    registration_status,
    last_completed_step,
    status,
    mentor_kind,
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

  const { data: current } = await supabase
    .from("mentor_profile")
    .select("last_completed_step")
    .eq("user_id", user.id)
    .maybeSingle();
  const nextStep = Math.max(Number(current?.last_completed_step ?? 0), step);

  // UPSERT: the row is normally seeded by register_as_mentor(), but upsert keeps
  // the first save safe even if it isn't. RLS gates this to the mentor's own row
  // (mentor.profile.manage_own); the guard trigger pins `status` to
  // 'pending_review' for non-reviewers, so a mentor can't self-approve here.
  const { data: updated, error: upErr } = await supabase
    .from("mentor_profile")
    .upsert(
      { user_id: user.id, ...clean, last_completed_step: nextStep, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select(`${PROFILE_SELECT}, registration_status, last_completed_step, status`)
    .maybeSingle();

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "Could not save profile" }, { status: 500 });

  const { registration_status, last_completed_step, status, ...profile } =
    updated as unknown as Record<string, unknown>;
  return NextResponse.json({ ok: true, registration_status, last_completed_step, status, profile });
}
