// The calling student's open chapter-feedback requests (issue #84).
//
//   GET ?batch=<uuid> -> { requests: [{ requestId, batchId, batchName, chapterName,
//                         subjectName, closesAt, items:[…], submittedAt,
//                         editableUntil, answers, remark, contactOk }],
//            published: [{ id, batchId, batchName, title, status, … }],
//            needsDob: boolean }
//
// `needsDob` is the honest answer to an empty `requests`: feedback is not collected
// from under-18s and cannot be collected from a student whose age we don't know
// (#84 O-11), so a student with no date of birth on file gets skipped. It is true only
// when there IS a window they would otherwise be asked about — a prompt with nothing
// behind it teaches people to ignore prompts.
//
// `published` is the "what changed after your feedback" list — the action items
// staff chose to publish. It ships with this GET rather than a second endpoint
// because the student card shows both together, and one round trip beats two.
//
// `batch` is optional and narrows BOTH lists to one batch. Without it this endpoint
// is deliberately cross-batch (the prompt on /student/quizzes wants every open
// window), which is exactly why a batch-scoped caller has to say so — rendering the
// unfiltered answer inside one batch's page shows another batch's chapters, and
// chapter names repeat across batches of the same course, so nothing on screen
// reveals the mix-up. Narrowing server-side also keeps `published`'s limit from
// being spent on other batches' actions.
//
// student_pending_feedback() enforces enrolment and the 24h edit window itself; a
// request the student may not answer never appears in the result.
import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";
import { fetchPublishedActions, toPending, type PendingFeedback } from "@/lib/feedback-query";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "feedback.submit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isStudentApproved(ctx.userId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // An unparseable batch id is dropped rather than 400'd: it can only come from a
  // hand-edited URL, and the unscoped answer is still a correct answer.
  const raw = new URL(request.url).searchParams.get("batch");
  const batchId = raw && UUID.test(raw) ? raw : null;

  const supabase = await createClient();
  const [{ data, error }, published, { data: needsDob }] = await Promise.all([
    supabase.rpc("student_pending_feedback"),
    // A failure here must not cost the student their feedback prompt.
    fetchPublishedActions(supabase, 6, batchId).catch(() => []),
    // True when this student has feedback waiting but no date of birth on file, so
    // the age gate (migration 173) is skipping them. Without this the page would
    // simply render nothing and they would never learn there was anything to do.
    supabase.rpc("student_feedback_dob_required"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requests: PendingFeedback[] = (data ?? []).map(toPending);

  return NextResponse.json({
    requests: batchId ? requests.filter((r) => r.batchId === batchId) : requests,
    needsDob: needsDob === true,
    published: published.map((a) => ({
      id: a.id,
      title: a.title,
      batchId: a.batchId,
      batchName: a.batchName,
      status: a.status,
      dueOn: a.dueOn,
      completedAt: a.completedAt,
      resolutionNote: a.resolutionNote,
    })),
  });
}
