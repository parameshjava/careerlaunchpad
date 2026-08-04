// Feedback action items — the staff todo list from #84, with provenance.
//
//   GET  ?batch=<uuid>&status=open|in_progress|done|dropped&overdue=1
//        -> { actions: [...] }
//   POST body { batch_id, title, detail?, subject_id?, chapter_id?, request_id?,
//               dimension_key?, owner_user_id?, priority?, due_on?,
//               published_to_students? } -> { action }
//
// Reads and writes go through the table under RLS (feedback.action.manage), not an
// RPC: the policy IS the whole authorization rule here, so a definer function would
// only add a place for the two to disagree.
//
// Every item carries the source that produced it (batch → subject → chapter →
// dimension, and the request itself). Six months on, "fix the audio" without
// provenance is unreviewable — and the source is what lets a closed item be shown
// next to the score that prompted it.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toActionItem } from "@/lib/feedback-query";

const COLS =
  "id, batch_id, subject_id, chapter_id, request_id, dimension_key, title, detail, owner_user_id, priority, due_on, status, resolution_note, published_to_students, created_at, completed_at";
const STATUSES = ["open", "in_progress", "done", "dropped"];
const PRIORITIES = ["low", "normal", "high"];

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.action.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const batch = url.searchParams.get("batch");
  const status = url.searchParams.get("status");
  const overdue = url.searchParams.get("overdue") === "1";

  const supabase = await createClient();
  let q = supabase.from("feedback_action_item").select(COLS);
  if (batch) q = q.eq("batch_id", batch);
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  if (overdue) {
    // Overdue means still open AND past due — a completed item is never overdue.
    q = q.lt("due_on", new Date().toISOString().slice(0, 10)).in("status", ["open", "in_progress"]);
  }
  const { data, error } = await q
    .order("status")
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: (data ?? []).map(toActionItem) });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.action.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const batchId = typeof body.batch_id === "string" ? body.batch_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!batchId || !title)
    return NextResponse.json({ error: "batch_id and title are required" }, { status: 422 });

  const priority = typeof body.priority === "string" && PRIORITIES.includes(body.priority)
    ? body.priority
    : "normal";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_action_item")
    .insert({
      batch_id: batchId,
      subject_id: typeof body.subject_id === "string" ? body.subject_id : null,
      chapter_id: typeof body.chapter_id === "string" ? body.chapter_id : null,
      request_id: typeof body.request_id === "string" ? body.request_id : null,
      dimension_key: typeof body.dimension_key === "string" ? body.dimension_key : null,
      title,
      detail: typeof body.detail === "string" ? body.detail : null,
      owner_user_id: typeof body.owner_user_id === "string" ? body.owner_user_id : ctx.userId,
      priority,
      due_on: typeof body.due_on === "string" && body.due_on ? body.due_on : null,
      published_to_students: body.published_to_students === true,
      created_by: ctx.userId,
    })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });
  return NextResponse.json({ action: toActionItem(data) });
}
