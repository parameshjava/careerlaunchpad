// Mentors for the console review grid. Reads `mentor_profile` joined with the
// account email and college name, and resolves the ref ids/slugs to labels so
// the review UI is self-contained. Reads are guarded by RLS (mentor_profile is
// readable by user.manage / Owner '*', and college-scoped for college admins),
// so an unauthorized caller simply gets an empty list.
import type { SupabaseClient } from "@supabase/supabase-js";

export type MentorStatus = "pending_review" | "approved" | "suspended";

export type MentorRow = {
  userId: string;
  name: string | null;
  email: string;
  college: string | null;
  kind: string; // student_alumni | professional | staff
  status: MentorStatus;
  registered: boolean; // registration_status === 'submitted'
  graduationYear: number | null;
  currentRole: string | null; // "Title @ Company"
  industry: string | null;
  experience: number | null;
  mentoringAreas: string[];
  skills: string[];
  mode: string | null;
  contribution: string | null;
  submittedAt: string; // YYYY-MM-DD
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const joinNonEmpty = (parts: (string | null | undefined)[], sep: string) =>
  parts.filter(Boolean).join(sep) || null;

/** Load the id/slug → label maps the review grid needs (public ref tables). */
async function loadRefMaps(supabase: SupabaseClient) {
  const [areas, industries, modes, contributions, skills] = await Promise.all([
    supabase.from("ref_mentoring_area").select("id, label"),
    supabase.from("ref_industry").select("id, label"),
    supabase.from("ref_mentor_mode").select("id, label"),
    supabase.from("ref_contribution_type").select("id, label"),
    supabase.from("ref_skill").select("slug, label"),
  ]);
  const map = <T extends { label: string }>(rows: T[] | null, key: "id" | "slug") =>
    new Map((rows ?? []).map((r) => [(r as Record<string, string>)[key], r.label]));
  return {
    area: map(areas.data as { id: string; label: string }[] | null, "id"),
    industry: map(industries.data as { id: string; label: string }[] | null, "id"),
    mode: map(modes.data as { id: string; label: string }[] | null, "id"),
    contribution: map(contributions.data as { id: string; label: string }[] | null, "id"),
    skill: map(skills.data as { slug: string; label: string }[] | null, "slug"),
  };
}

export async function fetchMentors(supabase: SupabaseClient): Promise<MentorRow[]> {
  const [refs, res] = await Promise.all([
    loadRefMaps(supabase),
    supabase
      .from("mentor_profile")
      .select(
        `user_id, full_name, status, mentor_kind, registration_status, graduation_year,
         current_company, current_title, industry_id, years_experience,
         mentoring_area_ids, skills, mentor_mode_id, contribution_type_id, updated_at,
         college:college_id(name), app_user:user_id(email)`,
      )
      .order("updated_at", { ascending: false }),
  ]);

  if (res.error) throw new Error(`mentor_profile: ${res.error.message}`);

  return (res.data ?? []).map((r) => {
    const college = one<{ name: string | null }>(r.college as never);
    const user = one<{ email: string | null }>(r.app_user as never);
    return {
      userId: r.user_id as string,
      name: (r.full_name as string | null) ?? null,
      email: user?.email ?? "",
      college: college?.name ?? null,
      kind: (r.mentor_kind as string) ?? "professional",
      status: (r.status as MentorStatus) ?? "pending_review",
      registered: r.registration_status === "submitted",
      graduationYear: (r.graduation_year as number | null) ?? null,
      currentRole: joinNonEmpty([r.current_title as string | null, r.current_company as string | null], " @ "),
      industry: refs.industry.get(r.industry_id as string) ?? null,
      experience: (r.years_experience as number | null) ?? null,
      mentoringAreas: ((r.mentoring_area_ids as string[] | null) ?? []).map((id) => refs.area.get(id) ?? id),
      skills: ((r.skills as string[] | null) ?? []).map((s) => refs.skill.get(s) ?? s),
      mode: refs.mode.get(r.mentor_mode_id as string) ?? null,
      contribution: refs.contribution.get(r.contribution_type_id as string) ?? null,
      submittedAt: day(r.updated_at as string | null),
    };
  });
}
