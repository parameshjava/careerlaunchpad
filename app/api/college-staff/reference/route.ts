/**
 * Reference-data for the College Staff registration form: every option set
 * served from the public-read `ref_*` tables, so the form never hard-codes them
 * (CLAUDE.md "API design first"). staff_designation / year_of_study / language /
 * mentoring_area / contribution_type map to FK or uuid[] columns and so carry
 * `id`; degree/branch are matched by `slug`.
 *
 * Same shape and caching as /api/mentor/reference — the option-set reads are
 * identical for every user and rarely change, so they come from the shared
 * ref-cache and hit the DB once per hour. The auth gate below still runs
 * per-request.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REF_TABLES } from "@/lib/college-staff-registration";
import { getRefData, getDegreeBranchData } from "@/lib/ref-cache";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    // Subjects live in the exam-staff-only `subject` table, so they can't ride
    // the cookieless ref-cache; fetch them through the SECURITY DEFINER RPC
    // (migration 140) — the same reader the mentor form uses, so a staff
    // member's declared subjects line up with the batch vocabulary.
    const [refData, degreeBranch, subjectsRes] = await Promise.all([
      getRefData(REF_TABLES, "college-staff"),
      // Supersedes refData's degree/branch with the enriched rows: `search_terms`
      // is what makes 143 branches findable by how people actually type ("csc",
      // "comp sci", "E.C.E"), and the generic fixed-column select can't carry it.
      // Spread LAST so it wins (see the note on getDegreeBranchData).
      getDegreeBranchData(),
      // Subjects are TYPE-AHEAD SUGGESTIONS now, not the vocabulary (177): a
      // college syllabus is not in public.subject and its naming is
      // university-specific, so staff type their own and this only helps them
      // land on a platform subject (which links to batches) or on the spelling
      // their colleagues already used.
      supabase.rpc("staff_subject_suggestions"),
    ]);

    const suggestions = (subjectsRes.data ?? []) as
      { subject_id: string | null; name: string; linked: boolean }[];

    // `subject` stays the LINKED platform list, because the summary and roster
    // resolve a stored subject_id to its label through it.
    const subject = suggestions
      .filter((s) => s.linked && s.subject_id)
      .map((s) => ({ id: s.subject_id!, slug: s.subject_id!, label: s.name, category: null }));

    // What the input offers: platform subjects plus names ≥2 other staff typed.
    // A null id means "insert as free text".
    const subject_suggestions = suggestions.map((s) => ({
      id: s.linked ? s.subject_id : null,
      label: s.name,
    }));

    return NextResponse.json({ ...refData, ...degreeBranch, subject, subject_suggestions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
