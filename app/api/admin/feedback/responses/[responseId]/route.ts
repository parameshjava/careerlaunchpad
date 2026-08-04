// Moderate one feedback response (issue #84).
//
//   PATCH  body { moderation: 'ok' | 'hidden' } -> { ok }
//
// Hiding removes a remark from the MENTOR read only — staff always see it and
// nothing is deleted. This exists for remarks that name a person or turn abusive:
// the alternative (deleting) would destroy the record of what was said, and the
// alternative (nothing) makes the trainer's view unsafe to open.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATES = ["ok", "hidden"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> },
) {
  const { responseId } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.view.identified"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { moderation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const moderation = typeof body.moderation === "string" ? body.moderation : "";
  if (!STATES.includes(moderation))
    return NextResponse.json({ error: "moderation must be 'ok' or 'hidden'" }, { status: 422 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_feedback_moderation", {
    p_response_id: responseId,
    p_moderation: moderation,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 422 });
  }
  return NextResponse.json({ ok: true });
}
