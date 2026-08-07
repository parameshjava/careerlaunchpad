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
import { getRefData } from "@/lib/ref-cache";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    // Subjects live in the exam-staff-only `subject` table, so they can't ride
    // the cookieless ref-cache; fetch them through the SECURITY DEFINER RPC
    // (migration 140) — the same reader the mentor form uses, so a staff
    // member's declared subjects line up with the batch vocabulary.
    const [refData, subjectsRes] = await Promise.all([
      getRefData(REF_TABLES, "college-staff"),
      supabase.rpc("mentor_teachable_subjects"),
    ]);
    const subject = ((subjectsRes.data ?? []) as { id: string; name: string }[]).map((s) => ({
      id: s.id,
      slug: s.id,
      label: s.name,
      category: null,
    }));
    return NextResponse.json({ ...refData, subject });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
