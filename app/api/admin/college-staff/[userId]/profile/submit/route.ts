/**
 * POST /api/admin/college-staff/:userId/profile/submit
 *
 * Mark a target staff registration complete on their behalf — the console
 * counterpart of /api/college-staff/profile/submit, used when an admin fills in
 * the last missing fields for someone (the wizard's Submit button on
 * /dashboard/college-staff/[userId]).
 *
 * It does NOT approve and it does NOT email the reviewers: an admin who is
 * already looking at the record does not need to be told about it, and the
 * vetting `status` is only ever changed by set_college_staff_status. Auth:
 * college.staff.review; RLS confines it to the reviewer's own college.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { REQUIRED_FIELDS } from "@/lib/college-staff-registration";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission("college.staff.review");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("college_staff_profile")
    .select("full_name, designation_id, years_teaching_total")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ ok: false, error: "No staff profile" }, { status: 404 });

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
    .eq("user_id", userId);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, registration_status: "submitted" });
}
