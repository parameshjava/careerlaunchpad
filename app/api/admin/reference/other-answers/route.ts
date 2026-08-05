/**
 * GET  /api/admin/reference/other-answers
 *      -> { answers: [{ kind, answer, uses }], unspecified: [{ kind, uses }] }
 * POST /api/admin/reference/other-answers  body { kind, answer, branch_slug|degree_slug }
 *      -> { ok, updated }
 *
 * THE INBOX THAT KEEPS THE CATALOGUE ALIVE (issue #99 §7.6). A seed migration is a
 * snapshot; AP counselling adds branches every admission season (CSBS, CSE—IoT and
 * Data Science all appeared within the last few years). Without a loop that turns
 * "Computer Science and Engineering (AI) ×14" into a real branch, the catalogue
 * rots and everyone lands on "Other" again in two cycles — the exact failure this
 * whole story fixes.
 *
 * POST resolves one write-in: it points the matching profiles at a real slug AND
 * clears their free text, so the same answer doesn't keep reappearing in the inbox.
 * The branch must already be mapped to that profile's degree — otherwise resolving
 * an answer would write back the invalid pairs the migration just cleaned up.
 * Auth: refdata.manage.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditRefChange, bustRefCache, refdataGate } from "@/lib/refdata-admin";
import { isPairAllowed, type DegreeBranchRow } from "@/lib/degree-branch";

export async function GET() {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });

  const supabase = await createClient();
  // Grouping + counting across two tables — an RPC, not a PostgREST query
  // (migration 161 §12). SECURITY DEFINER so the count is platform-wide.
  //
  // `unspecified` is the companion count of profiles sitting on "Other" with NO text
  // (ref_other_unspecified, migration 161): either the student typed nothing, or an
  // earlier backfill parked them there before it preserved the old slug. Reported separately
  // because that bucket is heterogeneous and therefore NOT bulk-resolvable — showing
  // it as a mappable answer would invite exactly the silent rewrite we're fixing.
  const [answers, unspecified] = await Promise.all([
    supabase.rpc("ref_other_answers"),
    supabase.rpc("ref_other_unspecified"),
  ]);
  if (answers.error) return NextResponse.json({ error: answers.error.message }, { status: 500 });
  if (unspecified.error) return NextResponse.json({ error: unspecified.error.message }, { status: 500 });
  return NextResponse.json({
    answers: ((answers.data ?? []) as { kind: string; answer: string; uses: number }[]).map((r) => ({
      ...r,
      uses: Number(r.uses),
    })),
    unspecified: ((unspecified.data ?? []) as { kind: string; uses: number }[]).map((r) => ({
      ...r,
      uses: Number(r.uses),
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

  const kind = String(body.kind ?? "");
  const answer = String(body.answer ?? "").trim();
  const target = String((kind === "branch" ? body.branch_slug : body.degree_slug) ?? "").trim();
  if (kind !== "branch" && kind !== "degree")
    return NextResponse.json({ error: "kind must be branch or degree" }, { status: 422 });
  if (!answer) return NextResponse.json({ error: "answer is required" }, { status: 422 });
  if (!target) return NextResponse.json({ error: `${kind}_slug is required` }, { status: 422 });

  const supabase = await createClient();
  const column = kind === "branch" ? "branch" : "degree";
  const otherColumn = `${column}_other`;

  let updated = 0;
  for (const table of ["student_profile", "mentor_profile"] as const) {
    // Fetch the affected rows first: for a branch we must check each row's DEGREE
    // offers the target branch, so this can't be one blind UPDATE.
    const { data: rows, error } = await supabase
      .from(table)
      .select(`user_id, degree, ${otherColumn}`)
      .eq(otherColumn, answer);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const candidates = (rows ?? []) as unknown as { user_id: string; degree: string | null }[];
    if (!candidates.length) continue;

    let eligible = candidates;
    if (kind === "branch") {
      // A branch is only legal on a degree that offers it, and each row may be on a
      // different degree — so this can't be one blind UPDATE.
      const { data: pairs } = await supabase
        .from("ref_degree_branch")
        .select("degree_slug, branch_slug, sort_order, group_label")
        .eq("branch_slug", target);
      const map = (pairs ?? []) as DegreeBranchRow[];
      eligible = candidates.filter((r) => r.degree && isPairAllowed(r.degree, target, map));
      if (!eligible.length)
        return NextResponse.json(
          {
            error: `'${target}' is not mapped to the degree those profiles are on. Map it to that degree first, then resolve this answer.`,
          },
          { status: 422 },
        );
    }

    const ids = eligible.map((r) => r.user_id);
    if (!ids.length) continue;

    // ONE statement, and the year is safe. A degree resolution does change `degree`
    // (which the anchor trigger watches), but stamp_entry_academic_year() now leaves an
    // already-anchored student alone when their answer is an absolute numbered year —
    // 'year_2' means N=2 under any degree, so the anchor already encodes it. Only
    // 'final_year' is duration-relative and genuinely needs re-deriving. See
    // migration 162; an earlier cut of this route recomputed the anchor here and
    // was both redundant and wrong for mentor_profile, which has no year at all.
    const { error: upErr } = await supabase
      .from(table)
      .update({ [column]: target, [otherColumn]: null })
      .in("user_id", ids);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    updated += ids.length;
  }

  await auditRefChange(supabase, {
    table: kind === "branch" ? "ref_branch" : "ref_degree",
    rowKey: target,
    action: "update",
    before: { other_answer: answer },
    after: { mapped_to: target, profiles_updated: updated },
  });
  bustRefCache();
  return NextResponse.json({ ok: true, updated });
}
