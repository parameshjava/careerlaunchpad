/**
 * Finalize a College Staff registration: validate the (few) required fields,
 * flip registration_status -> 'submitted', and put it in the right college's
 * review queue. This does NOT grant access — the scoped `college_staff` role is
 * created only by an approval (set_college_staff_status, migration 175 §10c).
 * On failure returns the missing fields so the form can jump back.
 *
 * Two notification rules, both deliberate:
 *   • the registrant gets a confirmation naming who reviews it;
 *   • the reviewers come from college_staff_recipients(college_id) — THAT
 *     college's admins plus platform admins — never notification_recipients(),
 *     which returns every college's admins (019:174) and would tell the whole
 *     platform about one college's hire.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_FIELDS } from "@/lib/college-staff-registration";
import { sendCollegeStaffSubmittedEmail, sendRegistrationPendingEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("college_staff_profile")
    .select("full_name, designation_id, years_teaching_total, status, college_id, college:college_id ( name )")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ ok: false, error: "No staff registration" }, { status: 404 });

  const p = profile as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter(({ field }) => {
    const v = p[field];
    if (Array.isArray(v)) return v.length === 0;
    return v == null || v === "";
  });
  if (missing.length) return NextResponse.json({ ok: false, missing }, { status: 422 });

  const { error: upErr } = await supabase
    .from("college_staff_profile")
    .update({
      registration_status: "submitted",
      registration_submitted_at: new Date().toISOString(),
      last_completed_step: 3,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  // A send-back that has been fixed goes back into the queue and its open notes
  // are resolved. No-op for any other state, so it is safe to always call.
  const { error: resubErr } = await supabase.rpc("mark_college_staff_resubmitted");
  if (resubErr) return NextResponse.json({ ok: false, error: resubErr.message }, { status: 500 });

  const fullName = (p.full_name as string | null) ?? null;
  const collegeRow = p.college as { name?: string } | { name?: string }[] | null;
  const collegeName = (Array.isArray(collegeRow) ? collegeRow[0]?.name : collegeRow?.name) ?? null;

  // Best-effort from here — email must never fail the submission.
  if (user.email) {
    await sendCollegeStaffSubmittedEmail({
      to: user.email,
      name: fullName,
      collegeName,
      loginUrl: `${SITE_URL}/college-staff/register`,
    });
  }

  // Only notify reviewers while the registration is actually pending. An already
  // approved staff member editing their profile is not a review event.
  const status = p.status as string | undefined;
  if (status === "pending_review" || status === "changes_requested") {
    const { data: recips } = await supabase.rpc("college_staff_recipients", {
      p_college: p.college_id as string,
    });
    await sendRegistrationPendingEmail({
      to: (recips as string[] | null) ?? [],
      kind: "college_staff",
      name: fullName,
      collegeName,
      reviewUrl: `${SITE_URL}/dashboard/college-staff?tab=pending`,
    });
  }

  return NextResponse.json({ ok: true, registration_status: "submitted" });
}
