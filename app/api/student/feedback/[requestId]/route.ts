// Submit (or correct) the calling student's feedback for one chapter (issue #84).
//
//   GET  -> the student's own view of this request (round-trip per CLAUDE.md: what
//           was submitted through the form is re-fetchable and editable for 24h)
//   POST  body { answers: [{ item_id, rating? , choice? }], remark?, contact_ok? }
//         -> { ok: true, responseId }
//
// submit_chapter_feedback() owns every rule: enrolment, the open window, required
// items, one response per student, the 24h edit window, and the straightlining
// flag. A validation failure surfaces as its message with 422 — these are all
// things the student can fix by answering differently.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { isStudentApproved } from "@/lib/student-approval";
import { createClient } from "@/lib/supabase/server";
import { toPending } from "@/lib/feedback-query";

type Answer = { item_id: string; rating?: number | null; choice?: string | null };

async function gate() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended" || !can(ctx, "feedback.submit"))
    return null;
  if (!(await isStudentApproved(ctx.userId))) return null;
  return ctx;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  if (!(await gate())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { requestId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_pending_feedback");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = (data ?? []).find(
    (r: { request_id: string }) => r.request_id === requestId,
  );
  if (!row)
    return NextResponse.json({ error: "This feedback request is not open for you" }, { status: 404 });
  return NextResponse.json({ request: toPending(row) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  if (!(await gate())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { requestId } = await params;

  let body: { answers?: Answer[]; remark?: string; contact_ok?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (answers.length === 0)
    return NextResponse.json({ error: "Please answer the questions first" }, { status: 422 });
  if (!answers.every((a) => a && typeof a.item_id === "string"))
    return NextResponse.json({ error: "Every answer needs an item_id" }, { status: 422 });

  const remark = typeof body.remark === "string" ? body.remark.slice(0, 1000) : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_chapter_feedback", {
    p_request_id: requestId,
    p_answers: answers,
    p_remark: remark,
    p_contact_ok: body.contact_ok === true,
  });
  if (error) {
    // Postgres prefixes RAISE messages; the student only needs the sentence.
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  return NextResponse.json({ ok: true, responseId: data });
}
