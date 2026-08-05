/**
 * PATCH /api/admin/reference/branches/[slug]  (issue #99)
 *   body: any of { label, category, family, search_terms, sort_order, is_active }
 *   -> { ok, branch, student_count, mentor_count }
 *
 * As with degrees: `slug` is immutable (student_profile.branch stores it with no
 * FK) and there is no DELETE — `is_active: false` is the only removal, and the
 * response echoes the live usage counts so the UI can say exactly how many
 * students still hold a branch it has just hidden from new pickers.
 *
 * A LABEL edit is global: a shared branch (Data Science under B.Tech, B.Sc, M.Sc
 * and BCA) has one row, so renaming it renames it everywhere. The GET on the
 * collection returns `degree_count` for precisely this warning.
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

const SELECT = "id, slug, label, category, family, sort_order, is_active, search_terms";

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
  if ("family" in body) patch.family = text(body.family, 40);
  if ("search_terms" in body) patch.search_terms = parseTerms(body.search_terms);
  if ("sort_order" in body) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n)) return NextResponse.json({ error: "sort_order must be a whole number" }, { status: 422 });
    patch.sort_order = n;
  }
  if ("is_active" in body) patch.is_active = !!body.is_active;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = await createClient();
  const { data: before } = await supabase.from("ref_branch").select(SELECT).eq("slug", slug).maybeSingle();
  if (!before) return NextResponse.json({ error: "Unknown branch" }, { status: 404 });

  const { data, error } = await supabase
    .from("ref_branch")
    .update(patch)
    .eq("slug", slug)
    .select(SELECT)
    .maybeSingle();
  if (error?.code === "23505")
    return NextResponse.json(
      {
        error:
          "Another branch already uses that label. Labels must be unique — the Excel import resolves a Branch cell by label, so a duplicate would import as the wrong branch.",
      },
      { status: 409 },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: usage } = await supabase.rpc("ref_branch_usage");
  const mine = ((usage ?? []) as { branch_slug: string; student_count: number; mentor_count: number }[]).find(
    (r) => r.branch_slug === slug,
  );

  const action: RefAction =
    "is_active" in patch && patch.is_active !== before.is_active
      ? (patch.is_active ? "activate" : "deactivate")
      : "update";
  await auditRefChange(supabase, { table: "ref_branch", rowKey: slug, action, before, after: data });
  bustRefCache();
  return NextResponse.json({
    ok: true,
    branch: data,
    student_count: Number(mine?.student_count ?? 0),
    mentor_count: Number(mine?.mentor_count ?? 0),
  });
}
