/**
 * Server-side reads/writes shared by the staff-facing registration API and the
 * admin API (phase 3), so "fetch a staff profile" and "replace their subjects"
 * are written once. Everything here runs through the CALLER's client, so RLS
 * (migration 175) is what decides whose rows come back — these helpers add no
 * authorization of their own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_SELECT, type SubjectRow } from "@/lib/college-staff-registration";

export type StaffProfileResponse = {
  registration_status: string;
  last_completed_step: number;
  status: string;
  staff_source: string;
  college: { id: string; name: string; place: string | null; state: string | null } | null;
  profile: Record<string, unknown> | null;
  subjects: SubjectRow[];
  review_notes: { body: string; kind: string; created_at: string; resolved_at: string | null }[];
};

const LIFECYCLE = "registration_status, last_completed_step, status, staff_source";

/**
 * One staff member's full registration payload. Returns null when the caller
 * cannot see the row (no profile, or RLS filtered it) — the caller decides
 * whether that is a 404 or an empty form.
 */
export async function fetchStaffProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<StaffProfileResponse | null> {
  const { data, error } = await supabase
    .from("college_staff_profile")
    .select(`${PROFILE_SELECT}, ${LIFECYCLE}, college:college_id ( id, name, place, state )`)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const [{ data: subjects }, { data: notes }] = await Promise.all([
    supabase
      .from("college_staff_subject")
      .select("subject_id, subject_name, relation, since_year, last_year, is_primary")
      .eq("user_id", userId),
    supabase
      .from("college_staff_review_note")
      .select("body, kind, created_at, resolved_at")
      .eq("staff_user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const row = data as unknown as Record<string, unknown>;
  const {
    registration_status, last_completed_step, status, staff_source, college, ...profile
  } = row;

  return {
    registration_status: registration_status as string,
    last_completed_step: (last_completed_step as number) ?? 0,
    status: status as string,
    staff_source: staff_source as string,
    // PostgREST returns an embedded row as an object, but typings allow an array.
    college: (Array.isArray(college) ? college[0] : college) as StaffProfileResponse["college"],
    profile,
    subjects: (subjects ?? []) as SubjectRow[],
    review_notes: (notes ?? []) as StaffProfileResponse["review_notes"],
  };
}

/**
 * Replace a staff member's subject rows with `rows` (PUT semantics — step 3
 * edits the whole set, and a removed chip must actually disappear).
 *
 * Delete-then-insert rather than an upsert: an upsert cannot express removal,
 * and the natural key is the whole row (user_id, subject_id, relation), so there
 * is nothing to update in place. Both statements are RLS-gated to rows the
 * caller may write.
 */
export async function replaceStaffSubjects(
  supabase: SupabaseClient,
  userId: string,
  rows: SubjectRow[],
): Promise<string | null> {
  const { error: delErr } = await supabase
    .from("college_staff_subject")
    .delete()
    .eq("user_id", userId);
  if (delErr) return delErr.message;

  if (rows.length === 0) return null;

  const { error: insErr } = await supabase.from("college_staff_subject").insert(
    rows.map((r) => ({
      user_id: userId,
      // Exactly one of the two — 177's CHECK rejects both or neither, and
      // validateSubjects has already reduced each row to one.
      subject_id: r.subject_id ?? null,
      subject_name: r.subject_id ? null : (r.subject_name ?? null),
      relation: r.relation,
      since_year: r.since_year ?? null,
      last_year: r.last_year ?? null,
      is_primary: r.is_primary ?? false,
    })),
  );
  return insErr?.message ?? null;
}

/** The subject ids the caller may reference, from the SECURITY DEFINER reader. */
export async function knownSubjectIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.rpc("mentor_teachable_subjects");
  return new Set(((data ?? []) as { id: string }[]).map((s) => s.id));
}
