/**
 * College Staff roster for the console (/dashboard/college-staff and the Team
 * hub's tab). Reads college_staff_profile joined with the account email and
 * college name, and resolves ref ids/slugs to labels so the review UI is
 * self-contained — the same shape lib/mentors-query.ts has for mentors.
 *
 * Authorization is RLS (migration 175 §7), not code: a college admin's
 * college.staff.view grant is scoped, so an unauthorized caller simply gets an
 * empty list. `collegeId` is an optional NARROWING filter for the platform-side
 * college picker — it can only ever subtract from what RLS already allowed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffStatus =
  | "pending_review" | "changes_requested" | "approved" | "suspended" | "rejected";

export type StaffRow = {
  userId: string;
  name: string | null;
  email: string;
  collegeId: string;
  college: string | null;
  designation: string | null;
  department: string | null;
  status: StaffStatus;
  source: "self" | "invited";
  /** registration_status === 'submitted' — the form is finished. */
  submitted: boolean;
  yearsTeaching: number | null;
  yearsAtCollege: number | null;
  teachingSubjects: string[];
  otherSubjects: string[];
  phone: string | null;
  officeEmail: string | null;
  updatedAt: string; // YYYY-MM-DD
};

/** A staff invite that hasn't been signed into yet. */
export type StaffInviteRow = {
  inviteId: string;
  email: string;
  collegeId: string | null;
  college: string | null;
  name: string | null;
  createdAt: string;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

async function loadRefMaps(supabase: SupabaseClient) {
  const [designations, branches, subjects] = await Promise.all([
    supabase.from("ref_staff_designation").select("id, label"),
    supabase.from("ref_branch").select("slug, label"),
    supabase.rpc("mentor_teachable_subjects"),
  ]);
  return {
    designation: new Map(((designations.data ?? []) as { id: string; label: string }[]).map((r) => [r.id, r.label])),
    branch: new Map(((branches.data ?? []) as { slug: string; label: string }[]).map((r) => [r.slug, r.label])),
    subject: new Map(((subjects.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])),
  };
}

export async function fetchCollegeStaff(
  supabase: SupabaseClient,
  collegeId?: string,
): Promise<StaffRow[]> {
  let query = supabase
    .from("college_staff_profile")
    .select(
      `user_id, full_name, phone, office_email, status, staff_source, registration_status,
       designation_id, designation_other, department, department_other,
       years_teaching_total, years_at_this_college, college_id, updated_at,
       college:college_id ( name ),
       app_user:app_user!college_staff_profile_user_id_fkey ( email )`,
    )
    .order("updated_at", { ascending: false });
  if (collegeId) query = query.eq("college_id", collegeId);

  const [refs, res] = await Promise.all([loadRefMaps(supabase), query]);
  if (res.error) throw new Error(`college_staff_profile: ${res.error.message}`);

  const rows = res.data ?? [];
  if (rows.length === 0) return [];

  // Subjects live in their own table; one extra round-trip for the whole page
  // rather than N. Only 'teaching' and 'can_teach' surface in the grid —
  // 'taught' is history and belongs on the detail page.
  const ids = rows.map((r) => r.user_id as string);
  const { data: subjectRows } = await supabase
    .from("college_staff_subject")
    .select("user_id, subject_id, relation")
    .in("user_id", ids);

  const byUser = new Map<string, { teaching: string[]; other: string[] }>();
  for (const s of (subjectRows ?? []) as { user_id: string; subject_id: string; relation: string }[]) {
    const bucket = byUser.get(s.user_id) ?? { teaching: [], other: [] };
    const label = refs.subject.get(s.subject_id) ?? s.subject_id;
    if (s.relation === "teaching") bucket.teaching.push(label);
    else if (s.relation === "can_teach") bucket.other.push(label);
    byUser.set(s.user_id, bucket);
  }

  // An "Other" pick reads back as the typed text, matching the summary views.
  const label = (value: string | null, write: string | null, map: Map<string, string>) => {
    if (!value) return null;
    const found = map.get(value) ?? null;
    return found?.toLowerCase() === "other" && write ? write : found;
  };

  return rows.map((r) => {
    const subjects = byUser.get(r.user_id as string) ?? { teaching: [], other: [] };
    return {
      userId: r.user_id as string,
      name: (r.full_name as string | null) ?? null,
      email: one<{ email: string | null }>(r.app_user as never)?.email ?? "",
      collegeId: r.college_id as string,
      college: one<{ name: string | null }>(r.college as never)?.name ?? null,
      designation: label(r.designation_id as string | null, r.designation_other as string | null, refs.designation),
      department: label(r.department as string | null, r.department_other as string | null, refs.branch),
      status: (r.status as StaffStatus) ?? "pending_review",
      source: (r.staff_source as "self" | "invited") ?? "self",
      submitted: r.registration_status === "submitted",
      yearsTeaching: (r.years_teaching_total as number | null) ?? null,
      yearsAtCollege: (r.years_at_this_college as number | null) ?? null,
      teachingSubjects: subjects.teaching,
      otherSubjects: subjects.other,
      phone: (r.phone as string | null) ?? null,
      officeEmail: (r.office_email as string | null) ?? null,
      updatedAt: day(r.updated_at as string | null),
    };
  });
}

/**
 * Pending college_staff invites — people who've been added but haven't signed in
 * yet, so they have no profile row and don't appear in the roster.
 *
 * Read through the college_staff_invites() RPC rather than the table: `invite`
 * RLS gates SELECT on user.invite / invite.resend (009), and a College Admin
 * deliberately holds neither (giving them user.invite would let them invite an
 * owner — see the note on invite_college_staff). Without the RPC they could
 * create an invite and then never see it. The RPC applies the same scoped check
 * the roster does.
 */
export async function fetchStaffInvites(
  supabase: SupabaseClient,
  collegeId?: string,
): Promise<StaffInviteRow[]> {
  const { data, error } = await supabase.rpc("college_staff_invites", {
    p_college: collegeId ?? null,
  });
  if (error) return [];

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    inviteId: r.id as string,
    email: r.email as string,
    collegeId: (r.scope_college_id as string | null) ?? null,
    college: (r.college_name as string | null) ?? null,
    name: ((r.staged_profile as { full_name?: string } | null)?.full_name) ?? null,
    createdAt: day(r.created_at as string | null),
  }));
}
