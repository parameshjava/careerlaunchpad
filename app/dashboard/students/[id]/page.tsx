import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_SELECT, REF_TABLES } from "@/lib/registration";
import { EMPTY, type Form, type RefData, type College } from "@/components/students/registration-fields";
import { ProfileSummary } from "@/app/student/register/registration-form";

// Console-side, read-only view of one student's profile — the same layout the
// student sees after submitting registration (ProfileSummary), fetched by id
// (the student_profile.user_id) instead of the session user. RLS bounds the read
// to what the console user may see; intake rows (not yet a profile) show a note.
export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  const { id } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("student_profile")
    .select(
      `${PROFILE_SELECT}, registration_status,
       college:college_id ( id, name, place, state ),
       app_user:user_id ( email )`,
    )
    .eq("user_id", id)
    .maybeSingle();

  if (!row) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <BackLink />
        <p className="text-muted-foreground py-20 text-center text-sm">
          This student hasn’t started registration yet — no profile to show.
        </p>
      </div>
    );
  }

  const r = row as unknown as Record<string, unknown>;
  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : ((v as T) ?? null));
  const college = one<College>(r.college);
  const email = one<{ email: string | null }>(r.app_user)?.email ?? null;

  // Same DB-row → Form mapping the wizard does on load: nulls to "", numbers to
  // strings, arrays/objects defaulted so ProfileSummary can map slugs → labels.
  const f: Form = {
    ...EMPTY,
    full_name: (r.full_name as string) ?? "",
    phone: (r.phone as string) ?? "",
    gender: (r.gender as string) ?? "",
    city_village: (r.city_village as string) ?? "",
    district: (r.district as string) ?? "",
    state: (r.state as string) ?? "",
    college_id: (r.college_id as string) ?? "",
    degree: (r.degree as string) ?? "",
    branch: (r.branch as string) ?? "",
    year_of_study: (r.year_of_study as string) ?? "",
    graduation_year: r.graduation_year != null ? String(r.graduation_year) : "",
    cgpa: r.cgpa != null ? String(r.cgpa) : "",
    career_goal_ids: (r.career_goal_ids as string[]) ?? [],
    primary_career_goal_id: (r.primary_career_goal_id as string) ?? "",
    skill_assessment: (r.skill_assessment as Record<string, number>) ?? {},
    skills: (r.skills as string[]) ?? [],
    interests: (r.interests as string[]) ?? [],
    preferred_mentor_pref_id: (r.preferred_mentor_pref_id as string) ?? "",
    biggest_challenge: (r.biggest_challenge as string) ?? "",
  };

  // Reference option sets (same ref_* tables the registration form reads) so
  // stored slugs/ids render as human labels.
  const refEntries = await Promise.all(
    Object.entries(REF_TABLES).map(async ([key, table]) => {
      const { data } = await supabase
        .from(table)
        .select("id, slug, label, category, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      return [key, data ?? []] as const;
    }),
  );
  const refs = Object.fromEntries(refEntries) as RefData;

  const status = r.registration_status === "submitted" ? "submitted" : "in_progress";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink />
      <ProfileSummary f={f} refs={refs} email={email} college={college} status={status} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
      ← Back to students
    </Link>
  );
}
