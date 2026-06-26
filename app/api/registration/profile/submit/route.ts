/**
 * Finalize registration: full validation across required fields, then flip
 * registration_status -> 'submitted'. On failure returns the missing fields so
 * the form can jump the user back to the right step. See §4 of the spec.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_FIELDS } from "@/lib/registration";
import { sendStudentSubmittedEmail, sendRegistrationPendingEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("student_profile")
    .select("full_name, phone, college_id, career_goal_ids, primary_career_goal_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ ok: false, error: "No student profile" }, { status: 404 });

  const p = profile as Record<string, unknown>;
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
  // Invited/imported students are auto-approved, so their submit notifies no one.
  if (p.status === "pending_review") {
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
