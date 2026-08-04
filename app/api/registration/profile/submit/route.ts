/**
 * Finalize registration: full validation across required fields, then flip
 * registration_status -> 'submitted'. On failure returns the missing fields so
 * the form can jump the user back to the right step. See §4 of the spec.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_FIELDS } from "@/lib/registration";
import { sendStudentSubmittedEmail, sendRegistrationPendingEmail } from "@/lib/mailer";
import { recordRegistrationActivity } from "@/lib/request-audit";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Fetch exactly the columns the required-field check needs (derived from
  // REQUIRED_FIELDS so adding a required field never drifts this select), plus
  // full_name (for the email) and status (to decide who to notify).
  const cols = [
    ...new Set([...REQUIRED_FIELDS.map((r) => r.field), "full_name", "status"]),
  ].join(", ");
  const { data: profile, error } = await supabase
    .from("student_profile")
    .select(cols)
    .eq("user_id", user.id)
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
    .eq("user_id", user.id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  // Audit (issue #83): bumps the revision counter and appends the timeline row
  // (IP, user agent, real actor). Runs before the review/email side effects so a
  // failure in those still leaves the submit recorded.
  await recordRegistrationActivity(supabase, req, user.id, "submit");

  // Re-submitting is the student's response to the reviewer: resolves all their
  // open remarks, and — if they were sent back (changes_requested) — flips them
  // back into the review queue (pending_review). Returns the resulting status.
  const { data: resubStatus } = await supabase.rpc("mark_registration_resubmitted");
  const reviewStatus = (resubStatus as string | null) ?? (p.status as string | null);

  const fullName = (p.full_name as string | null | undefined) ?? null;

  // Confirm the submission to the student. Best-effort — never blocks the response.
  if (user.email) {
    await sendStudentSubmittedEmail({
      to: user.email,
      name: fullName,
      loginUrl: `${SITE_URL}/student/register`,
    });
  }

  // Self-registered students await approval — notify owners/admins to review.
  // Covers both a first submit (pending_review) and a re-submit after a send-back
  // (changes_requested → pending_review above). Auto-approved students notify no one.
  if (reviewStatus === "pending_review") {
    const { data: recips } = await supabase.rpc("notification_recipients");
    await sendRegistrationPendingEmail({
      to: (recips as string[] | null) ?? [],
      kind: "student",
      name: fullName,
      reviewUrl: `${SITE_URL}/dashboard`,
    });
  }

  return NextResponse.json({ ok: true, registration_status: "submitted" });
}
