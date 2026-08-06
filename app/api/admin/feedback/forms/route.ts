// The feedback instrument's versions (issue #84 §F9, migration 170).
//
//   GET  ?scope=chapter -> { forms: [{ id, version, status, publishedAt, requestCount,
//                                      responseCount, items:[…] }] }
//   POST body { copy_from?: uuid, scope?: 'chapter' } -> { formId }
//        Starts the next DRAFT version. `copy_from` seeds it from an existing version,
//        which is what "same form plus one question" means — the copy happens in SQL so
//        it can never miss a column the UI doesn't know about.
//
// Everything sensitive is in the RPCs: they check feedback.form.manage, assign the
// version number, allow only one draft per scope, and refuse to let a published
// version be edited. This route only shapes JSON.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toFormVersion } from "@/lib/feedback-forms";

const SCOPES = ["chapter"];

function scopeOf(url: URL): string {
  const s = url.searchParams.get("scope");
  return s && SCOPES.includes(s) ? s : "chapter";
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.form.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_form_catalogue", {
    p_scope: scopeOf(new URL(req.url)),
  });
  if (error) return fail(error.message);
  return NextResponse.json({
    forms: ((data ?? []) as Record<string, unknown>[]).map(toFormVersion),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "feedback.form.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { copy_from?: string; scope?: string } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is a legitimate "start me a blank draft".
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_feedback_form_draft", {
    p_copy_from: typeof body.copy_from === "string" ? body.copy_from : null,
    p_scope: body.scope && SCOPES.includes(body.scope) ? body.scope : "chapter",
  });
  if (error) return fail(error.message);
  return NextResponse.json({ formId: data as string });
}

function fail(message: string) {
  const msg = message.replace(/^.*?:\s*/, "");
  return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 422 });
}
