// Update one feedback action item (issue #84).
//
//   PATCH body { status?, owner_user_id?, priority?, due_on?, title?, detail?,
//                resolution_note?, published_to_students? } -> { action }
//
// Closing an item stamps completed_at/completed_by so the loop has a date, and the
// resolution note is what makes a closed item evidence rather than a tick. Moving a
// done item back to open clears the stamp — otherwise the "closed on" date would
// outlive the closure it described.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toActionItem } from "@/lib/feedback-query";

const COLS =
  "id, batch_id, subject_id, chapter_id, request_id, dimension_key, title, detail, owner_user_id, priority, due_on, status, resolution_note, published_to_students, created_at, completed_at";
const STATUSES = ["open", "in_progress", "done", "dropped"];
const PRIORITIES = ["low", "normal", "high"];
const CLOSED = new Set(["done", "dropped"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.action.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status))
      return NextResponse.json({ error: "Invalid status" }, { status: 422 });
    patch.status = body.status;
    if (CLOSED.has(body.status)) {
      patch.completed_at = new Date().toISOString();
      patch.completed_by = ctx.userId;
    } else {
      patch.completed_at = null;
      patch.completed_by = null;
    }
  }
  if (typeof body.priority === "string") {
    if (!PRIORITIES.includes(body.priority))
      return NextResponse.json({ error: "Invalid priority" }, { status: 422 });
    patch.priority = body.priority;
  }
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "Title cannot be empty" }, { status: 422 });
    patch.title = t;
  }
  if ("detail" in body) patch.detail = typeof body.detail === "string" ? body.detail : null;
  if ("resolution_note" in body)
    patch.resolution_note = typeof body.resolution_note === "string" ? body.resolution_note : null;
  if ("owner_user_id" in body)
    patch.owner_user_id = typeof body.owner_user_id === "string" ? body.owner_user_id : null;
  if ("due_on" in body)
    patch.due_on = typeof body.due_on === "string" && body.due_on ? body.due_on : null;
  if ("published_to_students" in body)
    patch.published_to_students = body.published_to_students === true;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_action_item")
    .update(patch)
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });
  if (!data) return NextResponse.json({ error: "Action item not found" }, { status: 404 });
  return NextResponse.json({ action: toActionItem(data) });
}
