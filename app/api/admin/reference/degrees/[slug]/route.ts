/**
 * PATCH /api/admin/reference/degrees/[slug]  (issue #99)
 *   body: any of { label, category, level, branch_mode, duration_years, sort_order,
 *                  search_terms, is_active }
 *   -> { ok, degree }
 *
 * `slug` is NOT patchable — it is the identity student_profile.degree stores (with
 * no FK), so a rename would orphan every row holding it. A genuine rename/merge
 * would have to UPDATE the affected profiles in the same transaction, which is a
 * deliberate action, not a field edit.
 *
 * `is_active: false` is the ONLY removal. There is no DELETE here (and migration
 * 161 grants none for ref_degree), because deleting a row students already hold
 * would silently orphan their data; deactivation hides the option from new
 * pickers while existing students keep their label.
 * Auth: refdata.manage.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  auditRefChange,
  bustRefCache,
  parseTerms,
  refdataGate,
  text,
  type RefAction,
} from "@/lib/refdata-admin";

const BRANCH_MODES = new Set(["required", "optional", "none"]);
const LEVELS = new Set(["diploma", "ug", "pg"]);
const SELECT = "id, slug, label, category, sort_order, is_active, branch_mode, level, duration_years, search_terms";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("label" in body) {
    const label = text(body.label, 120);
    if (!label) return NextResponse.json({ error: "A label is required" }, { status: 422 });
    patch.label = label;
  }
  if ("category" in body) patch.category = text(body.category, 60);
  if ("level" in body) {
    const level = body.level ? String(body.level) : null;
    if (level && !LEVELS.has(level))
      return NextResponse.json({ error: "level must be diploma, ug or pg" }, { status: 422 });
    patch.level = level;
  }
  if ("branch_mode" in body) {
    const mode = String(body.branch_mode);
    if (!BRANCH_MODES.has(mode))
      return NextResponse.json({ error: "branch_mode must be required, optional or none" }, { status: 422 });
    patch.branch_mode = mode;
  }
  if ("duration_years" in body) {
    const d = body.duration_years == null || body.duration_years === "" ? null : Number(body.duration_years);
    if (d != null && (!Number.isFinite(d) || d <= 0 || d > 10))
      return NextResponse.json({ error: "duration_years must be between 0 and 10" }, { status: 422 });
    patch.duration_years = d;
  }
  if ("sort_order" in body) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n)) return NextResponse.json({ error: "sort_order must be a whole number" }, { status: 422 });
    patch.sort_order = n;
  }
  if ("search_terms" in body) patch.search_terms = parseTerms(body.search_terms);
  if ("is_active" in body) patch.is_active = !!body.is_active;

  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = await createClient();
  // Read first so the audit row can carry before → after; also the existence check.
  const { data: before } = await supabase.from("ref_degree").select(SELECT).eq("slug", slug).maybeSingle();
  if (!before) return NextResponse.json({ error: "Unknown degree" }, { status: 404 });

  const { data, error } = await supabase
    .from("ref_degree")
    .update(patch)
    .eq("slug", slug)
    .select(SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deactivation/reactivation is the meaningful audit verb when is_active moves —
  // "update" would bury the one change an admin might need to explain later.
  const action: RefAction =
    "is_active" in patch && patch.is_active !== before.is_active
      ? (patch.is_active ? "activate" : "deactivate")
      : "update";
  await auditRefChange(supabase, { table: "ref_degree", rowKey: slug, action, before, after: data });
  bustRefCache();
  return NextResponse.json({ ok: true, degree: data });
}
