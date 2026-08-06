// Cross-batch feedback triage (issue #84, migration 165) — "what needs me today?".
//
//   GET ?all=1&limit=<n> -> { requests: [{ …aggregates, batchName, trips[],
//                                          openActionCount, … }] }
//
// Default is tripped requests only, because that is the question this screen
// answers; `all=1` returns every request the caller may see, for the times someone
// wants the full picture rather than the queue.
//
// feedback_triage_overview() resolves the visible batches from the caller's grants
// and computes the trip flags with the SAME helper the batch tab uses, so the inbox
// can never claim a chapter tripped when its own batch page says otherwise.
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toTriageRow } from "@/lib/feedback-query";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_triage_overview", {
    p_only_trips: !all,
    p_limit: limit,
  });
  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 500 });
  }
  return NextResponse.json({ requests: (data ?? []).map(toTriageRow) });
}
