// Act on one feedback response (issue #84) — moderation and the outreach log.
//
//   PATCH  body { moderation: 'ok' | 'hidden' }                 -> { ok }
//   PATCH  body { contacted: true, outreach_note?: string }     -> { ok }
//   PATCH  body { contacted: false }                            -> { ok }   (undo)
//
// Hiding removes a remark from the MENTOR read only — staff always see it and
// nothing is deleted. This exists for remarks that name a person or turn abusive:
// the alternative (deleting) would destroy the record of what was said, and the
// alternative (nothing) makes the trainer's view unsafe to open.
//
// The outreach log answers "did anyone actually follow up?" (migration 167). The
// RPC refuses to log against a student who did not tick the contact opt-in, so the
// promise on the form is kept by the database and not by this route.
//
// One PATCH, two intents, because both are edits to the same row and the client
// sends whichever field it is changing. `moderation` is checked first only so a
// malformed value fails loudly rather than being ignored.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATES = ["ok", "hidden"];
const NOTE_MAX = 2000;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> },
) {
  const { responseId } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.view.identified"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { moderation?: string; contacted?: boolean; outreach_note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();

  if ("moderation" in body) {
    const moderation = typeof body.moderation === "string" ? body.moderation : "";
    if (!STATES.includes(moderation))
      return NextResponse.json({ error: "moderation must be 'ok' or 'hidden'" }, { status: 422 });

    const { error } = await supabase.rpc("set_feedback_moderation", {
      p_response_id: responseId,
      p_moderation: moderation,
    });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (typeof body.contacted === "boolean") {
    const { error } = await supabase.rpc("record_feedback_outreach", {
      p_response_id: responseId,
      p_note:
        typeof body.outreach_note === "string" ? body.outreach_note.slice(0, NOTE_MAX) : null,
      p_clear: body.contacted === false,
    });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
}

// Postgres prefixes RAISE messages; the tail is what staff should read.
function fail(message: string) {
  const msg = message.replace(/^.*?:\s*/, "");
  return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 422 });
}
