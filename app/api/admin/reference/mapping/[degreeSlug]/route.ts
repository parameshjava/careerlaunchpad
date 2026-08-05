/**
 * The degree → branch mapping for ONE degree (issue #99).
 *
 * PUT's `branches` array is the degree's ACTIVE list. A pair the admin drops from it
 * is RETIRED (is_active = false), never deleted — deleting it made
 * resolveBranchPair reject Step 2 for every student already holding that branch.
 * Re-including a retired pair reactivates the same row. See replace_degree_branches()
 * in migration 161.
 *
 *   GET /api/admin/reference/mapping/[degreeSlug]
 *       -> { degree, assigned: [{ branch_slug, label, category, group_label,
 *                                 sort_order, is_active, student_count }],
 *            available: [{ slug, label, category }] }
 *   PUT /api/admin/reference/mapping/[degreeSlug]
 *       body { branches: [{ branch_slug, sort_order?, group_label? }] }
 *       -> { ok, count }
 *
 * PUT is a WHOLE-LIST REPLACE, executed by replace_degree_branches() so it is one
 * transaction: a route-level delete-then-insert that failed halfway would leave the
 * degree with no branches at all, i.e. every student on it facing an empty
 * dropdown. See migration 161 §12.
 * Auth: refdata.manage (checked here and again inside the RPC).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditRefChange, bustRefCache, refdataGate, text } from "@/lib/refdata-admin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ degreeSlug: string }> }) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });
  const { degreeSlug } = await params;

  const supabase = await createClient();
  const [degree, pairs, branches, usage] = await Promise.all([
    supabase
      .from("ref_degree")
      .select("slug, label, branch_mode, level, duration_years, is_active")
      .eq("slug", degreeSlug)
      .maybeSingle(),
    supabase
      .from("ref_degree_branch")
      .select("branch_slug, sort_order, group_label, is_active")
      .eq("degree_slug", degreeSlug)
      .order("sort_order"),
    supabase.from("ref_branch").select("slug, label, category, is_active").order("sort_order"),
    supabase.rpc("ref_branch_usage"),
  ]);
  if (degree.error) return NextResponse.json({ error: degree.error.message }, { status: 500 });
  if (!degree.data) return NextResponse.json({ error: "Unknown degree" }, { status: 404 });

  const branchRows = (branches.data ?? []) as { slug: string; label: string; category: string | null; is_active: boolean }[];
  const bySlug = new Map(branchRows.map((b) => [b.slug, b]));
  const use = new Map(
    ((usage.data ?? []) as { branch_slug: string; student_count: number; mentor_count: number }[]).map((r) => [
      r.branch_slug,
      r,
    ]),
  );

  const mapped = (pairs.data ?? []) as {
    branch_slug: string; sort_order: number; group_label: string | null; is_active: boolean;
  }[];
  const assigned = mapped
    // A pair pointing at a branch row that no longer exists can't be rendered;
    // it also can't happen (the FK cascades) — this is belt-and-braces so a
    // hand-edited DB shows a short list rather than crashing the screen.
    .filter((m) => bySlug.has(m.branch_slug))
    .map((m) => ({
      branch_slug: m.branch_slug,
      label: bySlug.get(m.branch_slug)!.label,
      category: bySlug.get(m.branch_slug)!.category,
      branch_active: bySlug.get(m.branch_slug)!.is_active,
      group_label: m.group_label,
      sort_order: m.sort_order,
      is_active: m.is_active,
      student_count: Number(use.get(m.branch_slug)?.student_count ?? 0),
    }));

  // A RETIRED pair (is_active = false) still exists so students holding it can save
  // (replace_degree_branches, migration 161) — it just isn't offered any more. It stays
  // in `assigned` so the
  // screen can show it and offer Restore, and it stays out of `available` so it can't
  // be added as a duplicate.
  const assignedSlugs = new Set(assigned.map((a) => a.branch_slug));
  return NextResponse.json({
    degree: degree.data,
    assigned,
    // Everything still addable — active branches not already on this degree.
    available: branchRows
      .filter((b) => b.is_active && !assignedSlugs.has(b.slug))
      .map((b) => ({ slug: b.slug, label: b.label, category: b.category })),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ degreeSlug: string }> }) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });
  const { degreeSlug } = await params;

  let body: { branches?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.branches))
    return NextResponse.json({ error: "branches must be a list" }, { status: 422 });

  // Normalize + de-duplicate: sort_order is taken from the submitted ORDER when
  // absent, so the client can just send the reordered list.
  const seen = new Set<string>();
  const rows: { branch_slug: string; sort_order: number; group_label: string | null }[] = [];
  for (const [i, raw] of (body.branches as unknown[]).entries()) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const branchSlug = String(row.branch_slug ?? "").trim();
    if (!branchSlug || seen.has(branchSlug)) continue;
    seen.add(branchSlug);
    const order = Number(row.sort_order);
    rows.push({
      branch_slug: branchSlug,
      sort_order: Number.isInteger(order) ? order : i + 1,
      group_label: text(row.group_label, 60),
    });
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("ref_degree_branch")
    .select("branch_slug, sort_order, group_label")
    .eq("degree_slug", degreeSlug)
    .order("sort_order");

  const { error } = await supabase.rpc("replace_degree_branches", {
    p_degree: degreeSlug,
    p_rows: rows,
  });
  // The RPC raises for an unknown degree, an unknown branch (FK), or a missing
  // permission; all three are the caller's problem, not a server fault.
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });

  await auditRefChange(supabase, {
    table: "ref_degree_branch",
    rowKey: degreeSlug,
    action: "map",
    before: before ?? [],
    after: rows,
  });
  bustRefCache();
  return NextResponse.json({ ok: true, count: rows.length });
}
