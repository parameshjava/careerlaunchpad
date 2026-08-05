/**
 * POST /api/admin/reference/mapping/[degreeSlug]/copy   body { from: "btech" }
 *   -> { ok, copied }
 *
 * Branch sets repeat — B.E is B.Tech's 30 branches verbatim, M.Sc is B.Sc minus
 * the combination group — so re-picking them by hand is the wrong ask (issue #99
 * §7.1). ADDITIVE on purpose: it never removes what the target already has, so a
 * mis-click costs a few unmaps rather than the whole list. Trim afterwards with
 * PUT on the mapping.
 * Auth: refdata.manage (checked here and again inside copy_degree_branches()).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditRefChange, bustRefCache, refdataGate } from "@/lib/refdata-admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ degreeSlug: string }> }) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });
  const { degreeSlug } = await params;

  let body: { from?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const from = String(body.from ?? "").trim();
  if (!from) return NextResponse.json({ error: "from (a degree slug) is required" }, { status: 422 });
  if (from === degreeSlug)
    return NextResponse.json({ error: "Pick a different degree to copy from" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_degree_branches", { p_from: from, p_to: degreeSlug });
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });

  const copied = Number(data ?? 0);
  await auditRefChange(supabase, {
    table: "ref_degree_branch",
    rowKey: degreeSlug,
    action: "copy",
    after: { from, copied },
  });
  bustRefCache();
  return NextResponse.json({ ok: true, copied });
}
