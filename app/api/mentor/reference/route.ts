/**
 * Reference-data for the mentor registration form: every option set served from
 * the public-read `ref_*` tables, so the form never hard-codes them (CLAUDE.md
 * "API design first"). career_goal/industry/mentoring_area/mentor_mode/
 * contribution_type include `id` because those map to FK columns; degree/branch/
 * skill are matched by `slug`.
 *
 * The option-set reads are cached (lib/ref-cache.ts) — identical for every user
 * and rarely changing — so this endpoint hits the DB once per hour, not on every
 * form load. The auth gate below still runs per-request.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REF_TABLES } from "@/lib/mentor-registration";
import { getRefData, getDegreeBranchData } from "@/lib/ref-cache";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    // ref_* option sets (cached) + the teachable-subjects list. Subjects live in
    // the exam-staff-only `subject` table, so they can't ride the cookieless
    // ref-cache; fetch them here through the SECURITY DEFINER RPC (per-request,
    // authed) and shape them like a ref row so the form's chip picker reuses.
    const [refData, degreeBranch, subjectsRes] = await Promise.all([
      getRefData(REF_TABLES, "mentor"),
      // Same (degree, branch) mapping the student form uses — one source of truth
      // (issue #99); the mentor form had the identical flat-dropdown defect.
      getDegreeBranchData(),
      supabase.rpc("mentor_teachable_subjects"),
    ]);
    const subject = ((subjectsRes.data ?? []) as { id: string; name: string }[]).map((s) => ({
      id: s.id,
      slug: s.id,
      label: s.name,
      category: null,
    }));
    return NextResponse.json({ ...refData, ...degreeBranch, subject });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
