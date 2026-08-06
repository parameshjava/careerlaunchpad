// Ask enrolled students with no date of birth on file to add it (issue #84 O-11).
//
//   GET  -> { students: [{ studentId, fullName, email, askedRecently }] }
//   POST -> { asked: number, skipped: number, failed: number }
//
// WHY THIS EXISTS
//   Feedback is not collected from under-18s, and a student whose age we don't know
//   can be neither asked nor excluded honestly — so migration 173 skips them. Date of
//   birth is now required at registration, which fixes every future profile; this is
//   how the students who registered before that get asked.
//
// It deliberately reuses the review-note channel (migration 149) rather than inventing
// a notification: that channel already posts to the student's thread, shows in-app via
// StudentRemarksAlert, and emails them the remark. `request_changes` is NOT set — an
// approved student must keep their access while they add one field. A missing DOB is a
// gap to fill, not a registration to re-review.
//
// Pressing the button twice must not email anyone twice, so students who already have
// an unresolved note from the last 14 days are skipped and counted.
import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendStudentRemarksEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const REMARK =
  "Please add your date of birth to your profile. We ask for it because some " +
  "activities — including feedback on the chapters your trainer has completed — are " +
  "only collected from students aged 18 and over, and without it we have to leave you " +
  "out. It takes a moment: open your profile, Basic Information, Date of Birth.";

type MissingRow = {
  student_id: string;
  full_name: string | null;
  email: string | null;
  college_id: string | null;
  asked_recently: boolean;
};

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(ctx.permissions.has("*") || can(ctx, "student.review") || can(ctx, "feedback.view.identified")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("students_missing_dob");
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 500 });
  }
  return NextResponse.json({
    students: ((data ?? []) as MissingRow[]).map((r) => ({
      studentId: r.student_id,
      fullName: r.full_name,
      email: r.email,
      askedRecently: r.asked_recently === true,
    })),
  });
}

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Posting a note is a student.review action, whatever else the caller holds.
  if (!(ctx.permissions.has("*") || can(ctx, "student.review")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("students_missing_dob");
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 500 });
  }

  const rows = (data ?? []) as MissingRow[];
  let asked = 0;
  let failed = 0;
  const skipped = rows.filter((r) => r.asked_recently).length;

  for (const row of rows) {
    if (row.asked_recently) continue;
    const { error: nErr } = await supabase.rpc("add_student_review_note", {
      p_student: row.student_id,
      p_body: REMARK,
      p_request_changes: false,
    });
    if (nErr) {
      failed += 1;
      continue;
    }
    asked += 1;
    // Best-effort, exactly as sendStudentRemark does: the note is saved either way,
    // and it shows in-app, so a mail outage delays the nudge rather than losing it.
    if (row.email) {
      await sendStudentRemarksEmail({
        to: row.email,
        name: row.full_name,
        remarks: REMARK,
        requestChanges: false,
        profileUrl: `${SITE_URL}/student/register`,
      });
    }
  }

  return NextResponse.json({ asked, skipped, failed });
}
