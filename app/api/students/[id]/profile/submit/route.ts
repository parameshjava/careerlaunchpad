/**
 * Staff-facing "finalize" for a target student's registration — the console
 * editor's step-6 Submit. Mirrors /api/registration/profile/submit but targets
 * user_id = :id and is gated by `student.profile.manage`.
 *
 * ponytail: unlike the student's own submit, this sends NO emails and pings no
 * reviewers — a staff edit shouldn't spam the student. Wire notifications here if
 * staff-completed registrations ever need the same review flow as self-submits.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { REQUIRED_FIELDS } from "@/lib/registration";
import { recordRegistrationActivity } from "@/lib/request-audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("student.profile.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();

  // Select exactly the required-field columns (derived from REQUIRED_FIELDS so a
  // newly-required field never drifts out of this select — the bug that made
  // roll_number always read as missing here).
  const cols = [...new Set(REQUIRED_FIELDS.map((r) => r.field))].join(", ");
  const { data: profile, error } = await supabase
    .from("student_profile")
    .select(cols)
    .eq("user_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ ok: false, error: "No student profile" }, { status: 404 });

  const p = profile as unknown as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter(({ field }) => {
    const v = p[field];
    if (Array.isArray(v)) return v.length === 0;
    return v == null || v === "";
  });
  if (missing.length) return NextResponse.json({ ok: false, missing }, { status: 422 });

  const { error: upErr } = await supabase
    .from("student_profile")
    .update({
      registration_status: "submitted",
      registration_submitted_at: new Date().toISOString(),
      last_completed_step: 6,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  // Audit (issue #83): a staff-completed registration counts as a revision like
  // any other, attributed to the staff member who submitted it.
  await recordRegistrationActivity(supabase, req, id, "submit");

  return NextResponse.json({ ok: true, registration_status: "submitted" });
}
