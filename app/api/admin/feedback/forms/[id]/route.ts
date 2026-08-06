// One version of the feedback instrument (issue #84 §F9, migration 170).
//
//   PATCH  body { status: 'active' }  -> { ok }   publish this draft (retires the incumbent)
//   DELETE                            -> { ok }   discard this draft
//
// Both go through RPCs because both are transactions with invariants: publishing has to
// retire the current active version in the same breath (one active per scope is a
// partial unique index), and discarding must refuse a version any request has used.
// 'retired' is not settable by hand — a version is retired by its successor being
// published, which is the only way that keeps exactly one active.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.form.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.status !== "active")
    return NextResponse.json(
      { error: "Only { status: 'active' } is supported — a version is retired by publishing its successor" },
      { status: 422 },
    );

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_feedback_form", { p_form_id: id });
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.form.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_feedback_form_draft", { p_form_id: id });
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
}

function fail(message: string) {
  const msg = message.replace(/^.*?:\s*/, "");
  return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 422 });
}
