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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Same fields import_student_intake() accepts. Strings here are slugs (gender,
// degree, branch, year_of_study, skills, interests) or ids (career goals,
// mentor preference) — the client already resolves them via the ref data.
type Profile = {
  full_name?: string; phone?: string; gender?: string;
  city_village?: string; district?: string; state?: string;
  degree?: string; branch?: string; year_of_study?: string;
  graduation_year?: string | number; cgpa?: string | number;
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
  setIf("phone", str(p.phone));
  setIf("gender", str(p.gender));
  setIf("city_village", str(p.city_village));
  setIf("district", str(p.district));
  setIf("state", str(p.state));
  setIf("degree", str(p.degree));
  setIf("branch", str(p.branch));
  setIf("year_of_study", str(p.year_of_study));
  setIf("graduation_year", p.graduation_year !== undefined ? Math.trunc(num(p.graduation_year) ?? NaN) || undefined : undefined);
  setIf("cgpa", num(p.cgpa));
  setIf("primary_career_goal_id", str(p.primary_career_goal_id));
  setIf("preferred_mentor_pref_id", str(p.preferred_mentor_pref_id));
  setIf("biggest_challenge", str(p.biggest_challenge));
  if (p.career_goal_ids?.length) row.career_goal_ids = p.career_goal_ids;
  if (p.skills?.length) row.skills = p.skills;
  if (p.interests?.length) row.interests = p.interests;
  if (p.skill_assessment && Object.keys(p.skill_assessment).length) row.skill_assessment = p.skill_assessment;

  const supabase = await createClient();
  const { data: report, error } = await supabase.rpc("import_student_intake", {
    p_college_id: collegeId,
    p_rows: [row],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

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
