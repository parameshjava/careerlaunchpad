/**
 * POST /api/admin/intake/student
 *   body: { college_id, email, profile? }   // profile = the same fields the
 *   student self-registration / Excel template collect (slugs + ids).
 * Stage + invite a SINGLE student with their full profile (the one-off
 * counterpart to the Excel import). Reuses the same import_student_intake() SQL
 * function with a single row, so permission + college-scope checks, invite and
 * upsert behaviour are identical to the bulk import. Auth: student.intake.import.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { sendStudentImportedEmail } from "@/lib/mailer";
import { loadDegreeBranchMapping } from "@/lib/intake-excel";
import { OTHER_TEXT_MAX, resolveBranchPair } from "@/lib/degree-branch";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Same fields import_student_intake() accepts. Strings here are slugs (gender,
// degree, branch, year_of_study, skills, interests) or ids (career goals,
// mentor preference) — the client already resolves them via the ref data.
type Profile = {
  full_name?: string; roll_number?: string; registration_number?: string; apaar_id?: string; phone?: string; gender?: string;
  city_village?: string; district?: string; state?: string;
  degree?: string; branch?: string; year_of_study?: string;
  // The "Other" write-ins (#99). student_intake carries them (migration 161) and
  // merge_student_intake() copies them to the profile on claim (migration 162 §5).
  degree_other?: string; branch_other?: string;
  graduation_year?: string | number; cgpa?: string | number;
  preferred_category_slugs?: string[];
  career_goal_ids?: string[]; primary_career_goal_id?: string;
  skill_assessment?: Record<string, number>;
  skills?: string[]; interests?: string[];
  preferred_mentor_pref_id?: string; biggest_challenge?: string;
};

const num = (v: unknown) => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : s;
};

export async function POST(req: NextRequest) {
  try {
    await requirePermission("student.intake.import");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { college_id?: string; email?: string; profile?: Profile };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const collegeId = String(body.college_id ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!collegeId) return NextResponse.json({ error: "college_id is required" }, { status: 400 });
  // Linear (no-backtracking) email check: domain segments exclude '.', so the
  // two quantifiers can't overlap — avoids the polynomial-ReDoS CodeQL flags on
  // `[^@\s]+\.[^@\s]+` (its class includes '.').
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email))
    return NextResponse.json({ error: "A valid email is required" }, { status: 422 });

  const p = body.profile ?? {};
  // Build the single intake row — only set keys that have a value so empties
  // stay null (the student can fill them in later).
  const row: Record<string, unknown> = { row: 1, email };
  const setIf = (k: string, v: unknown) => { if (v !== undefined) row[k] = v; };
  setIf("full_name", str(p.full_name));
  setIf("roll_number", str(p.roll_number));
  setIf("registration_number", str(p.registration_number));
  // APAAR / ABC ID: normalize to digits-only and require 12 digits (same rule as
  // self-registration, lib/registration.ts) so it's stored consistently whether
  // a student self-registers or an admin stages them.
  const apaar = str(p.apaar_id)?.replace(/[\s-]/g, "");
  if (apaar && !/^\d{12}$/.test(apaar))
    return NextResponse.json({ error: "APAAR / ABC ID must be a 12-digit number" }, { status: 422 });
  setIf("apaar_id", apaar);
  setIf("phone", str(p.phone));
  setIf("gender", str(p.gender));
  setIf("city_village", str(p.city_village));
  setIf("district", str(p.district));
  setIf("state", str(p.state));
  setIf("degree", str(p.degree));
  setIf("branch", str(p.branch));
  setIf("degree_other", str(p.degree_other)?.slice(0, OTHER_TEXT_MAX));
  setIf("branch_other", str(p.branch_other)?.slice(0, OTHER_TEXT_MAX));
  setIf("year_of_study", str(p.year_of_study));
  setIf("graduation_year", p.graduation_year !== undefined ? Math.trunc(num(p.graduation_year) ?? NaN) || undefined : undefined);
  setIf("cgpa", num(p.cgpa));
  setIf("primary_career_goal_id", str(p.primary_career_goal_id));
  setIf("preferred_mentor_pref_id", str(p.preferred_mentor_pref_id));
  setIf("biggest_challenge", str(p.biggest_challenge));
  if (p.preferred_category_slugs?.length) row.preferred_category_slugs = p.preferred_category_slugs;
  if (p.career_goal_ids?.length) row.career_goal_ids = p.career_goal_ids;
  if (p.skills?.length) row.skills = p.skills;
  if (p.interests?.length) row.interests = p.interests;
  if (p.skill_assessment && Object.keys(p.skill_assessment).length) row.skill_assessment = p.skill_assessment;

  const supabase = await createClient();

  // Degree ⇄ Branch (#99). The console's "Add a student" form already filters the
  // Branch list by degree, but this endpoint is reachable directly — and a bad
  // pair staged here becomes a bad student_profile the moment the invite is
  // claimed, so it's rejected at the same gate the wizard and the Excel import use.
  const { degrees, pairs } = await loadDegreeBranchMapping(supabase);
  const branchPair = resolveBranchPair({
    provided: row,
    clean: row,
    stored: null,
    branchModes: new Map(degrees.map((d) => [d.slug, d.branch_mode])),
    pairs,
  });
  if (branchPair.errors.length)
    return NextResponse.json({ error: branchPair.errors[0] }, { status: 422 });
  Object.assign(row, branchPair.patch);

  const { data: report, error } = await supabase.rpc("import_student_intake", {
    p_college_id: collegeId,
    p_rows: [row],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  // import_student_intake() reads a FIXED column list out of the jsonb (migration 133),
  // so the two write-ins can't ride along in `row` — they'd be silently dropped, which
  // is exactly the bug this fixes. Written in a follow-up statement instead of
  // re-declaring that 138-line function; merge_student_intake() carries them on to the
  // profile at claim time (migration 162 §5).
  //
  // Nulls are written too, so clearing a write-in through this endpoint actually clears
  // it rather than leaving a stale value behind.
  if ("degree_other" in row || "branch_other" in row) {
    const { error: otherErr } = await supabase
      .from("student_intake")
      .update({
        degree_other: (row.degree_other as string | undefined) ?? null,
        branch_other: (row.branch_other as string | undefined) ?? null,
      })
      .eq("college_id", collegeId)
      .ilike("email", email);
    // Non-fatal: the student is staged and invited either way, and failing the whole
    // request here would strand an invite that was already sent.
    if (otherErr) console.error("student_intake write-in update failed:", otherErr.message);
  }

  const result = report as {
    created: number; updated: number; invited: number; invite_skipped: number;
    rows: { row: number; email: string | null; result: string; invite: string }[];
    new_invite_emails: string[];
  };

  await Promise.all(
    (result.new_invite_emails ?? []).map((to) =>
      sendStudentImportedEmail({ to, loginUrl: `${SITE_URL}/auth/login` }),
    ),
  );

  const r = result.rows?.[0];
  return NextResponse.json({
    ok: true,
    result: r?.result ?? "ok",
    invite: r?.invite ?? null,
    email: r?.email ?? email,
    created: result.created,
    updated: result.updated,
  });
}
