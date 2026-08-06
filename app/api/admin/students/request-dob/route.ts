// Ask enrolled students with no date of birth on file to add it (issue #84 O-11).
//
//   GET  -> { students: [{ studentId, fullName, email, askedRecently }] }
//   POST -> { asked, skipped, failed, remaining }   (capped per press)
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
// an unresolved DOB note from the last 14 days are skipped and counted. The note carries
// `topic='dob'` (migration 174) — matching on "any open note" counted a student sent back
// last week over a roll number as already asked, and they were then never asked at all.
//
// CAPPED AND BOUNDED, like lib/feedback-notify.ts. Each student costs one RPC plus one
// SMTP send against a single mailbox, so an uncapped serial loop over a few hundred
// students is killed mid-flight by the function timeout: notes and emails already went
// out, but the caller sees only a failure and loses the report. Instead we do at most
// PER_RUN_CAP per press, a few at a time, and return how many are left so the UI can
// ask for another press.
import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendStudentRemarksEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Students asked per press. Sized so the run finishes well inside maxDuration. */
const PER_RUN_CAP = 60;
/** Concurrent sends. Small on purpose — hammering one SMTP host gets it throttled. */
const CONCURRENCY = 4;

// Sending N emails can outlast the default budget.
export const maxDuration = 300;

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
  const skipped = rows.filter((r) => r.asked_recently).length;
  const todo = rows.filter((r) => !r.asked_recently);
  const batch = todo.slice(0, PER_RUN_CAP);
  const remaining = todo.length - batch.length;

  let asked = 0;
  let failed = 0;
  const queue = [...batch];

  async function worker() {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const { error: nErr } = await supabase.rpc("add_student_review_note", {
        p_student: row.student_id,
        p_body: REMARK,
        p_request_changes: false,
        p_topic: "dob",
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
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

  return NextResponse.json({ asked, skipped, failed, remaining });
}
