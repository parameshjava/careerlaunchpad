// Real students for the console grid. The platform tracks students in two places
// (see migration 011): bulk-imported students live in `student_intake` (no account
// yet) until they sign in via their invite, at which point handle_new_user() merges
// them into `student_profile`. This unions both so the grid shows imported students
// immediately (stage Imported/Invited) and registered ones (stage Registered).
//
// Reads are guarded by RLS (student_intake needs student.intake.import; the Owner's
// '*' satisfies it), so an unauthorized caller simply gets an empty list.
import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentStage = "Imported" | "Invited" | "Registered";

export type Student = {
  id: string;
  name: string | null;
  email: string;
  college: string | null;
  course: string | null; // "Degree — Branch" (whichever parts exist)
  stage: StudentStage;
  joinedAt: string; // YYYY-MM-DD
  // Membership fields powering the chart click-to-filter drilldown. Slugs for
  // skills; ref_career_goal ids for goals (matches lib/analytics-query keys).
  skills: string[];
  goalIds: string[];
  primaryGoalId: string | null;
};

// Supabase types a to-one embed as a possible array; normalize to a single row.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const courseOf = (degree: string | null, branch: string | null) =>
  [degree, branch].filter(Boolean).join(" — ") || null;

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export async function fetchStudents(
  supabase: SupabaseClient,
  // Optional college scope for the analytics drilldown. Omit for the full grid;
  // RLS still bounds what any caller can read either way.
  collegeId?: string,
): Promise<Student[]> {
  // Imported / invited students awaiting sign-up (exclude 'claimed' — those now
  // have a student_profile row and are returned by the profile query below).
  let intakeQ = supabase
    .from("student_intake")
    .select(
      "id, email, full_name, degree, branch, status, created_at, skills, career_goal_ids, primary_career_goal_id, college:college_id(name, place)",
    )
    .in("status", ["pending", "invited"])
    .order("created_at", { ascending: false });

  // Registered students.
  let profileQ = supabase
    .from("student_profile")
    .select(
      "user_id, full_name, degree, branch, updated_at, skills, career_goal_ids, primary_career_goal_id, college:college_id(name), app_user:user_id(email)",
    )
    .order("updated_at", { ascending: false });

  if (collegeId) {
    intakeQ = intakeQ.eq("college_id", collegeId);
    profileQ = profileQ.eq("college_id", collegeId);
  }

  const [intake, profiles] = await Promise.all([intakeQ, profileQ]);
  if (intake.error) throw new Error(`student_intake: ${intake.error.message}`);
  if (profiles.error) throw new Error(`student_profile: ${profiles.error.message}`);

  type CollegeRef = { name: string | null } | null;

  const imported: Student[] = (intake.data ?? []).map((r) => {
    const college = one<CollegeRef>(r.college as never);
    return {
      id: r.id as string,
      name: (r.full_name as string | null) ?? null,
      email: r.email as string,
      college: college?.name ?? null,
      course: courseOf(r.degree as string | null, r.branch as string | null),
      stage: (r.status === "invited" ? "Invited" : "Imported") as StudentStage,
      joinedAt: day(r.created_at as string | null),
      skills: (r.skills as string[] | null) ?? [],
      goalIds: (r.career_goal_ids as string[] | null) ?? [],
      primaryGoalId: (r.primary_career_goal_id as string | null) ?? null,
    };
  });

  const registered: Student[] = (profiles.data ?? []).map((r) => {
    const college = one<CollegeRef>(r.college as never);
    const user = one<{ email: string | null }>(r.app_user as never);
    return {
      id: r.user_id as string,
      name: (r.full_name as string | null) ?? null,
      email: user?.email ?? "",
      college: college?.name ?? null,
      course: courseOf(r.degree as string | null, r.branch as string | null),
      stage: "Registered" as StudentStage,
      joinedAt: day(r.updated_at as string | null),
      skills: (r.skills as string[] | null) ?? [],
      goalIds: (r.career_goal_ids as string[] | null) ?? [],
      primaryGoalId: (r.primary_career_goal_id as string | null) ?? null,
    };
  });

  // Registered first, then imported; both already sorted newest-first within group.
  return [...registered, ...imported];
}
