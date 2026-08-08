/**
 * POST /api/admin/college-staff/:userId/status   body { status, note }
 *
 * The review action. Delegates to set_college_staff_status() (migration 175
 * §10c), which is where the authorization and the consequence both live:
 *
 *   • authorization is SCOPED — has_college_permission('college.staff.review',
 *     the profile's own college). A college B admin calling this for a college A
 *     staff member is refused by the DB, not by this handler.
 *   • 'approved' GRANTS the scoped college_staff role; every other status
 *     REVOKES it. So approving and suspending are real access changes, not
 *     labels (#107 §3.2).
 *
 * Then emails the person — an approval or a send-back that nobody is told about
 * is the reason people email the platform team, which is exactly what this story
 * is meant to stop.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { sendCollegeStaffApprovedEmail, sendCollegeStaffReviewEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const STATUSES = ["pending_review", "changes_requested", "approved", "suspended", "rejected"] as const;
type Status = (typeof STATUSES)[number];

/** A send-back with no reason is a dead end for the recipient. */
const NOTE_REQUIRED: Status[] = ["changes_requested", "rejected", "suspended"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission("college.staff.review");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;

  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "") as Status;
  const note = String(body?.note ?? "").trim();

  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 422 });
  }
  if (NOTE_REQUIRED.includes(status) && !note) {
    return NextResponse.json(
      { error: "Add a short reason — it's sent to them, and it's how they know what to fix." },
      { status: 422 },
    );
  }

  const supabase = await createClient();

  // Read the target BEFORE the change: after a suspend the row is still visible
  // to the reviewer, but reading first keeps the email content and the audit in
  // one consistent snapshot.
  const { data: target } = await supabase
    .from("college_staff_profile")
    .select("full_name, college:college_id ( name ), app_user:app_user!college_staff_profile_user_id_fkey ( email )")
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "No staff profile" }, { status: 404 });

  const { error } = await supabase.rpc("set_college_staff_status", {
    p_user: userId,
    p_status: status,
    p_note: note || null,
  });
  if (error) {
    const forbidden = /not authorized/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: forbidden ? 403 : 500 });
  }

  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const email = one(target.app_user as { email?: string }[] | { email?: string } | null)?.email;
  const collegeName = one(target.college as { name?: string }[] | { name?: string } | null)?.name ?? null;
  const name = (target.full_name as string | null) ?? null;

  // Best-effort: never fail the review because email failed.
  if (email) {
    if (status === "approved") {
      await sendCollegeStaffApprovedEmail({
        to: email, name, collegeName, loginUrl: `${SITE_URL}/dashboard`,
      });
    } else if (status === "changes_requested" || status === "rejected" || status === "suspended") {
      await sendCollegeStaffReviewEmail({
        to: email, name, outcome: status, note, loginUrl: `${SITE_URL}/college-staff`,
      });
    }
  }

  return NextResponse.json({ ok: true, status });
}
