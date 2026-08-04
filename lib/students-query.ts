// Real students for the console grid. The platform tracks students in two places
// (see migration 011): bulk-imported students live in `student_intake` (no account
// yet) until they sign in via their invite, at which point handle_new_user() merges
// them into `student_profile`. This unions both so the grid shows imported students
// immediately (stage Imported/Invited) and registered ones (stage Registered).
//
// Reads are guarded by RLS (student_intake needs student.intake.import; the Owner's
// '*' satisfies it), so an unauthorized caller simply gets an empty list.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_SELECT, profileCompleteness } from "@/lib/registration";
import type {
  RegistrationAudit,
  RegistrationEvent,
  RegistrationSource,
} from "@/components/students/registration-audit";

export type StudentStage = "Imported" | "Invited" | "Registered";
export type ReviewStatus = "pending_review" | "changes_requested" | "approved" | "suspended";

export type Student = {
  id: string;
  name: string | null;
  email: string;
  college: string | null;
  course: string | null; // "Degree — Branch" (whichever parts exist)
  stage: StudentStage;
  // Approval gate (registered students only). Imported/invited rows have no
  // student_profile yet, so they default to "approved" (auto-approved on sign-in).
  reviewStatus: ReviewStatus;
  registrationStatus: "in_progress" | "submitted";
  joinedAt: string; // YYYY-MM-DD
  // Membership fields powering the chart click-to-filter drilldown. Slugs for
  // skills; ref_career_goal ids for goals (matches lib/analytics-query keys).
  skills: string[];
  goalIds: string[];
  primaryGoalId: string | null;
  // Profile completeness 0–100 for registered students; null for imported/invited
  // rows that have no student_profile yet.
  completeness: number | null;
  // How the record originated (issue #83) — self-signup vs staff vs college
  // import. Distinct from `stage`, which is lifecycle: an imported student who
  // later registers is stage "Registered", source "import".
  source: RegistrationSource;
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

  // Registered students. Selects the full profile (PROFILE_SELECT) so we can
  // compute completeness alongside the grid fields.
  let profileQ = supabase
    .from("student_profile")
    .select(
      `user_id, updated_at, status, registration_status, created_via, ${PROFILE_SELECT}, college:college_id(name), app_user:user_id(email, status)`,
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
      reviewStatus: "approved" as ReviewStatus, // not yet a profile; nothing to approve
      registrationStatus: "in_progress" as const,
      joinedAt: day(r.created_at as string | null),
      skills: (r.skills as string[] | null) ?? [],
      goalIds: (r.career_goal_ids as string[] | null) ?? [],
      primaryGoalId: (r.primary_career_goal_id as string | null) ?? null,
      completeness: null, // no student_profile yet
      // An intake row exists only because staff imported it, whatever the
      // `source` value says about the file it arrived in.
      source: "import" as RegistrationSource,
    };
  });

  // The `${PROFILE_SELECT}` interpolation defeats supabase-js's select-string
  // type parser, so treat profile rows as untyped records.
  const profileRows = (profiles.data ?? []) as unknown as Record<string, unknown>[];
  const registered: Student[] = profileRows
    // Soft-deleted users (app_user.status='deleted') are hidden from the grid.
    .filter((r) => one<{ status?: string }>(r.app_user as never)?.status !== "deleted")
    .map((r) => {
    const college = one<CollegeRef>(r.college as never);
    const user = one<{ email: string | null }>(r.app_user as never);
    return {
      id: r.user_id as string,
      name: (r.full_name as string | null) ?? null,
      email: user?.email ?? "",
      college: college?.name ?? null,
      course: courseOf(r.degree as string | null, r.branch as string | null),
      stage: "Registered" as StudentStage,
      reviewStatus: ((r.status as ReviewStatus | null) ?? "approved") as ReviewStatus,
      registrationStatus: ((r.registration_status as string | null) ?? "in_progress") as "in_progress" | "submitted",
      joinedAt: day(r.updated_at as string | null),
      skills: (r.skills as string[] | null) ?? [],
      goalIds: (r.career_goal_ids as string[] | null) ?? [],
      primaryGoalId: (r.primary_career_goal_id as string | null) ?? null,
      completeness: profileCompleteness(r as Record<string, unknown>),
      source: ((r.created_via as RegistrationSource | null) ?? "unknown") as RegistrationSource,
    };
  });

  // Registered first, then imported; both already sorted newest-first within group.
  return [...registered, ...imported];
}

// Supabase embeds a to-one relation as a possibly-array shape; this is the name
// pair every audit actor resolves to.
type ActorRef = { full_name: string | null; email: string | null } | null;
const actorName = (v: unknown): string | null => {
  const a = one<ActorRef>(v as never);
  return a?.full_name ?? a?.email ?? null;
};

/**
 * The registration audit for one student (issue #83) — the columns stamped by the
 * triggers in migration 160 plus the event timeline.
 *
 * RLS on student_registration_event limits the timeline to staff, so a caller
 * without `student.review` / `student.profile.manage` gets the facts but an empty
 * history. Returns null when the student has no profile row at all.
 *
 * `created_by` and `updated_by` are BOTH FKs to app_user, so each embed is
 * disambiguated by column name (`alias:column(...)`) rather than by table.
 */
export async function fetchRegistrationAudit(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<RegistrationAudit | null> {
  const [profile, events] = await Promise.all([
    supabase
      .from("student_profile")
      .select(
        `created_via, revision, updated_at,
         registration_started_at, registration_completed_at, registration_reopened_at, last_ip,
         creator:created_by ( full_name, email ),
         updater:updated_by ( full_name, email )`,
      )
      .eq("user_id", studentUserId)
      .maybeSingle(),
    supabase
      .from("student_registration_event")
      .select(
        `id, event, revision, actor_kind, on_behalf, ip, created_at,
         actor:actor_user_id ( full_name, email )`,
      )
      .eq("student_user_id", studentUserId)
      .order("created_at", { ascending: false }),
  ]);

  // Log rather than swallow: the `creator:created_by(...)` / `updater:updated_by(...)`
  // embeds disambiguate three FKs to app_user by column name, so a stale PostgREST
  // schema cache after migration 160 shows up here — and a silently missing panel
  // is a miserable thing to debug.
  if (profile.error) {
    console.error(`[audit] registration audit for ${studentUserId}: ${profile.error.message}`);
    return null;
  }
  if (!profile.data) return null;
  if (events.error) {
    console.error(`[audit] registration timeline for ${studentUserId}: ${events.error.message}`);
  }
  const p = profile.data as unknown as Record<string, unknown>;

  const timeline: RegistrationEvent[] = ((events.data ?? []) as unknown as Record<string, unknown>[]).map(
    (e) => ({
      id: e.id as string,
      event: e.event as RegistrationEvent["event"],
      revision: (e.revision as number | null) ?? null,
      actorKind: e.actor_kind as RegistrationEvent["actorKind"],
      actorName: actorName(e.actor),
      onBehalf: Boolean(e.on_behalf),
      ip: (e.ip as string | null) ?? null,
      createdAt: e.created_at as string,
    }),
  );

  return {
    createdVia: (p.created_via as RegistrationSource | null) ?? null,
    createdByName: actorName(p.creator),
    startedAt: (p.registration_started_at as string | null) ?? null,
    completedAt: (p.registration_completed_at as string | null) ?? null,
    reopenedAt: (p.registration_reopened_at as string | null) ?? null,
    updatedAt: (p.updated_at as string | null) ?? null,
    updatedByName: actorName(p.updater),
    lastIp: (p.last_ip as string | null) ?? null,
    revision: Number(p.revision ?? 0),
    events: timeline,
  };
}
