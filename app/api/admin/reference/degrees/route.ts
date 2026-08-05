/**
 * Reference Catalogue — degrees (issue #99). CLAUDE.md "API design first": the
 * screen at /dashboard/reference talks only to these endpoints.
 *
 *   GET  /api/admin/reference/degrees
 *        -> { degrees: [{ …ref_degree, mapped_count, student_count, mentor_count }] }
 *   POST /api/admin/reference/degrees
 *        body { slug, label, category?, level?, branch_mode?, duration_years?, sort_order? }
 *        -> { ok, degree }   409 if the slug already exists
 *
 * `slug` is the identity everywhere (no uuid round-trips), matching how ref_* is
 * consumed today — and it is accepted ONLY here, on create: student_profile.degree
 * stores the slug with no FK, so changing one later would orphan live rows.
 * Auth: refdata.manage. RLS enforces it again at the database.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  auditRefChange,
  bustRefCache,
  normalizeSlug,
  parseTerms,
  refdataGate,
  text,
} from "@/lib/refdata-admin";

const BRANCH_MODES = new Set(["required", "optional", "none"]);
const LEVELS = new Set(["diploma", "ug", "pg"]);

export async function GET() {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });

  const supabase = await createClient();
  const [degrees, mapping, usage] = await Promise.all([
    supabase
      .from("ref_degree")
      .select("id, slug, label, category, sort_order, is_active, branch_mode, level, duration_years, search_terms")
      .order("sort_order"),
    supabase.from("ref_degree_branch").select("degree_slug"),
    // GROUP BY isn't expressible through PostgREST, and the count gates whether a
    // row may be deactivated — so it comes from an RPC (migration 161).
    supabase.rpc("ref_degree_usage"),
  ]);
  if (degrees.error) return NextResponse.json({ error: degrees.error.message }, { status: 500 });

  const mapped = new Map<string, number>();
  for (const row of (mapping.data ?? []) as { degree_slug: string }[]) {
    mapped.set(row.degree_slug, (mapped.get(row.degree_slug) ?? 0) + 1);
  }
  const use = new Map(
    ((usage.data ?? []) as { degree_slug: string; student_count: number; mentor_count: number }[]).map((r) => [
      r.degree_slug,
      r,
    ]),
  );

  return NextResponse.json({
    degrees: (degrees.data ?? []).map((d) => ({
      ...d,
      mapped_count: mapped.get(d.slug) ?? 0,
      student_count: Number(use.get(d.slug)?.student_count ?? 0),
      mentor_count: Number(use.get(d.slug)?.mentor_count ?? 0),
    })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = normalizeSlug(body.slug);
  const label = text(body.label, 120);
  if (!slug) return NextResponse.json({ error: "A slug of 2–49 letters, digits or _ is required" }, { status: 422 });
  if (!label) return NextResponse.json({ error: "A label is required" }, { status: 422 });

  const branchMode = String(body.branch_mode ?? "required");
  if (!BRANCH_MODES.has(branchMode))
    return NextResponse.json({ error: "branch_mode must be required, optional or none" }, { status: 422 });
  const level = body.level ? String(body.level) : null;
  if (level && !LEVELS.has(level))
    return NextResponse.json({ error: "level must be diploma, ug or pg" }, { status: 422 });
  const duration = body.duration_years == null || body.duration_years === "" ? null : Number(body.duration_years);
  if (duration != null && (!Number.isFinite(duration) || duration <= 0 || duration > 10))
    return NextResponse.json({ error: "duration_years must be between 0 and 10" }, { status: 422 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_degree")
    .insert({
      slug,
      label,
      category: text(body.category, 60),
      level,
      branch_mode: branchMode,
      duration_years: duration,
      search_terms: parseTerms(body.search_terms),
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    })
    .select("id, slug, label, category, sort_order, is_active, branch_mode, level, duration_years, search_terms")
    .maybeSingle();

  // 23505 = unique_violation on ref_degree.slug — a duplicate is the caller's
  // mistake, not a server fault, so it reads as 409 rather than 500.
  if (error?.code === "23505")
    return NextResponse.json({ error: `A degree with the slug '${slug}' already exists` }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditRefChange(supabase, { table: "ref_degree", rowKey: slug, action: "create", after: data });
  bustRefCache();
  return NextResponse.json({ ok: true, degree: data });
}
