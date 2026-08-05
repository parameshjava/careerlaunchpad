/**
 * Reference Catalogue — branches (issue #99).
 *
 *   GET  /api/admin/reference/branches[?degree=btech]
 *        -> { branches: [{ …ref_branch, student_count, mentor_count, degree_count }] }
 *        `degree` narrows to the branches mapped to that degree (what a student on
 *        it would actually see) — the Mapping tab's "assigned" list.
 *   POST /api/admin/reference/branches
 *        body { slug, label, category?, family?, search_terms?, sort_order? }
 *        -> { ok, branch }   409 on a duplicate slug OR a duplicate label
 *
 * The label 409 is not fussiness: ref_branch.label carries a unique index because
 * lib/intake-excel.ts resolves an imported Branch cell by label→slug, so two rows
 * sharing a label would import as the wrong branch (migration 161 header).
 * Auth: refdata.manage.
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

const SELECT = "id, slug, label, category, family, sort_order, is_active, search_terms";

export async function GET(req: NextRequest) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });

  const degree = (req.nextUrl.searchParams.get("degree") ?? "").trim();
  const supabase = await createClient();

  const [branches, mapping, usage] = await Promise.all([
    supabase.from("ref_branch").select(SELECT).order("sort_order"),
    supabase.from("ref_degree_branch").select("degree_slug, branch_slug, sort_order, group_label"),
    supabase.rpc("ref_branch_usage"),
  ]);
  if (branches.error) return NextResponse.json({ error: branches.error.message }, { status: 500 });

  const pairs = (mapping.data ?? []) as {
    degree_slug: string; branch_slug: string; sort_order: number; group_label: string | null;
  }[];
  // How many degrees offer each branch — the "shared branch" signal an admin needs
  // before renaming one (a label edit lands on every degree that offers it).
  const degreeCount = new Map<string, number>();
  for (const p of pairs) degreeCount.set(p.branch_slug, (degreeCount.get(p.branch_slug) ?? 0) + 1);

  const use = new Map(
    ((usage.data ?? []) as { branch_slug: string; student_count: number; mentor_count: number }[]).map((r) => [
      r.branch_slug,
      r,
    ]),
  );

  let rows = (branches.data ?? []).map((b) => ({
    ...b,
    student_count: Number(use.get(b.slug)?.student_count ?? 0),
    mentor_count: Number(use.get(b.slug)?.mentor_count ?? 0),
    degree_count: degreeCount.get(b.slug) ?? 0,
  }));

  if (degree) {
    const forDegree = pairs.filter((p) => p.degree_slug === degree);
    const order = new Map(forDegree.map((p) => [p.branch_slug, p]));
    rows = rows
      .filter((b) => order.has(b.slug))
      .map((b) => ({ ...b, mapped_sort_order: order.get(b.slug)!.sort_order, group_label: order.get(b.slug)!.group_label }))
      .sort((a, b) => a.mapped_sort_order - b.mapped_sort_order || a.sort_order - b.sort_order);
  }

  return NextResponse.json({ branches: rows });
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_branch")
    .insert({
      slug,
      label,
      category: text(body.category, 60),
      family: text(body.family, 40),
      search_terms: parseTerms(body.search_terms),
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    })
    .select(SELECT)
    .maybeSingle();

  if (error?.code === "23505") {
    // Two different unique indexes can fire here; say which, because the fix differs.
    const onLabel = /label/i.test(error.message);
    return NextResponse.json(
      {
        error: onLabel
          ? `Another branch is already labelled “${label}”. Labels must be unique — the Excel import resolves a Branch cell by label, so a duplicate would import as the wrong branch. Qualify it, e.g. “${label} (Commerce)”.`
          : `A branch with the slug '${slug}' already exists`,
      },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditRefChange(supabase, { table: "ref_branch", rowKey: slug, action: "create", after: data });
  bustRefCache();
  return NextResponse.json({ ok: true, branch: data });
}
