/**
 * The current user's College Staff registration profile (the staff counterpart
 * of /api/mentor/profile).
 *
 *   GET   -> the profile + subjects + progress (registration_status,
 *            last_completed_step, the vetting `status`, and any reviewer notes),
 *            so the form can RESUME at last_completed_step + 1 and show what the
 *            reviewer asked for.
 *   PATCH -> incremental save. Body { step, data, subjects? } — `data` is a
 *            PARTIAL subset of the step's fields; only provided fields are
 *            written (merge) and last_completed_step advances monotonically.
 *            Lenient validation, so a half-finished step still saves.
 *
 * UPDATE, never upsert — unlike the mentor route. college_staff_profile has NO
 * self-INSERT policy (migration 175 §7): the row is created only by
 * register_as_college_staff(), because a self-INSERT policy would be a way
 * around that function's allowlist, letting any signed-in user post a pending
 * registration for any college. So a missing row here is a real 404, not
 * something to create on the fly.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = await fetchStaffProfile(supabase, user.id);
  if (!payload) {
    // No registration started yet. The register page turns this into the
    // "which college do you work at?" step rather than an error.
    return NextResponse.json({
      registration_status: "in_progress",
      last_completed_step: 0,
      status: null,
      staff_source: null,
      college: null,
      profile: null,
      subjects: [],
      review_notes: [],
      email: user.email ?? null,
    });
  }

  return NextResponse.json({ ...payload, email: user.email ?? null });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
  // Subjects belong to step 3 only — accepting them on another step would let a
  // client write them while skipping that step's validation.
  if (body.subjects !== undefined && step !== 3) {
    return NextResponse.json({ error: "subjects may only be saved in step 3" }, { status: 400 });
  }

  const { data: current } = await supabase
    .from("college_staff_profile")
    .select("last_completed_step")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json(
      { error: "No staff registration found. Start one from your college selection." },
      { status: 404 },
    );
  }

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

  // RLS gates this to the caller's own row; the guard trigger (175 §6) keeps
  // `status` and `college_id` reviewer-controlled, so neither can be smuggled in.
  const { error: upErr } = await supabase
    .from("college_staff_profile")
    .update({ ...clean, last_completed_step: nextStep, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  if (subjectRows) {
    const subjErr = await replaceStaffSubjects(supabase, user.id, subjectRows);
    if (subjErr) return NextResponse.json({ ok: false, error: subjErr }, { status: 500 });
  }

  const payload = await fetchStaffProfile(supabase, user.id);
  return NextResponse.json({ ok: true, ...payload });
}
