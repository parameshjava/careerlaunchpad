/**
 * The "My college" overview (#111) — one read per thing a staff member walks in
 * wanting to know: where the students are, how far the batches have got, what is
 * coming up, and what needs attention.
 *
 * Composed from EXISTING tables and the phase-1 scoped read policies, not a new
 * activity-event table. An event stream would be a bigger build and a worse
 * answer: "what's going on" for a college is a handful of current states, not a
 * log of everything that ever happened.
 *
 * No authorization of its own — every read runs as the caller, so RLS decides
 * what comes back. A `collegeId` narrows it further for the platform-side picker.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CollegeOverview = {
  students: { registered: number; pendingApproval: number; awaitingSignup: number; drafts: number };
  batches: {
    batchId: string;
    name: string;
    status: string;
    enrolled: number;
    subjects: number;
    chaptersDone: number;
    chaptersTotal: number;
  }[];
  upcoming: {
    sessionId: string;
    batchName: string | null;
    subjectName: string | null;
    title: string | null;
    startsAt: string;
  }[];
  staff: { approved: number; pending: number };
};

const EMPTY: CollegeOverview = {
  students: { registered: 0, pendingApproval: 0, awaitingSignup: 0, drafts: 0 },
  batches: [],
  upcoming: [],
  staff: { approved: 0, pending: 0 },
};

export async function fetchCollegeOverview(
  supabase: SupabaseClient,
  collegeId: string | null,
): Promise<CollegeOverview> {
  if (!collegeId) return EMPTY;

  const [profiles, intake, batchLinks, staff] = await Promise.all([
    supabase
      .from("student_profile")
      .select("user_id, status, registration_status")
      .eq("college_id", collegeId),
    // Imported/invited students who haven't signed in yet have no profile row.
    supabase
      .from("student_intake")
      .select("id, status")
      .eq("college_id", collegeId)
      .in("status", ["pending", "invited"]),
    supabase.from("batch_college").select("batch_id").eq("college_id", collegeId),
    supabase.from("college_staff_profile").select("user_id, status").eq("college_id", collegeId),
  ]);

  const rows = (profiles.data ?? []) as { status: string; registration_status: string }[];
  const students = {
    // A registered student who hasn't pressed Submit is a draft, whatever their
    // review status — the same rule the Students console uses (dashboard/page.tsx).
    drafts: rows.filter((r) => r.registration_status === "in_progress").length,
    pendingApproval: rows.filter(
      (r) =>
        r.registration_status === "submitted" &&
        (r.status === "pending_review" || r.status === "changes_requested"),
    ).length,
    registered: rows.filter((r) => r.status === "approved").length,
    awaitingSignup: (intake.data ?? []).length,
  };

  const staffRows = (staff.data ?? []) as { status: string }[];
  const staffCounts = {
    approved: staffRows.filter((s) => s.status === "approved").length,
    pending: staffRows.filter((s) => s.status === "pending_review" || s.status === "changes_requested").length,
  };

  const batchIds = ((batchLinks.data ?? []) as { batch_id: string }[]).map((b) => b.batch_id);
  if (batchIds.length === 0) {
    return { students, batches: [], upcoming: [], staff: staffCounts };
  }

  // batch_chapter and batch_session are readable here only because of the
  // college-scoped policies added in migration 175 §8 — before those, a
  // college-scoped grant saw nothing at all.
  const [batches, chapters, enrolments, subjects, sessions] = await Promise.all([
    supabase.from("batch").select("id, name, status").in("id", batchIds),
    supabase.from("batch_chapter").select("batch_id, status").in("batch_id", batchIds),
    supabase
      .from("student_enrollment")
      .select("batch_id, status")
      .in("batch_id", batchIds)
      .in("status", ["pending", "active", "completed"]),
    supabase.from("batch_subject").select("batch_id, subject_id, subject_name").in("batch_id", batchIds),
    supabase
      .from("batch_session")
      .select("id, batch_id, subject_id, title, starts_at, status")
      .in("batch_id", batchIds)
      .gte("starts_at", new Date().toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(8),
  ]);

  const count = <T extends { batch_id: string }>(list: T[] | null, pred?: (r: T) => boolean) => {
    const m = new Map<string, number>();
    for (const r of list ?? []) {
      if (pred && !pred(r)) continue;
      m.set(r.batch_id, (m.get(r.batch_id) ?? 0) + 1);
    }
    return m;
  };

  const chapterTotals = count(chapters.data as { batch_id: string; status: string }[] | null);
  const chapterDone = count(
    chapters.data as { batch_id: string; status: string }[] | null,
    (r) => r.status === "completed",
  );
  const enrolled = count(enrolments.data as { batch_id: string }[] | null);
  const subjectCount = count(subjects.data as { batch_id: string }[] | null);

  const batchName = new Map(
    ((batches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  );
  const subjectName = new Map(
    ((subjects.data ?? []) as { subject_id: string }[]).map((s) => [s.subject_id, s.subject_id]),
  );
  // batch_subject carries the denormalised name (134) — use it when present.
  for (const s of (subjects.data ?? []) as { subject_id: string; subject_name?: string | null }[]) {
    if (s.subject_name) subjectName.set(s.subject_id, s.subject_name);
  }

  return {
    students,
    staff: staffCounts,
    batches: ((batches.data ?? []) as { id: string; name: string; status: string }[])
      .map((b) => ({
        batchId: b.id,
        name: b.name,
        status: b.status,
        enrolled: enrolled.get(b.id) ?? 0,
        subjects: subjectCount.get(b.id) ?? 0,
        chaptersDone: chapterDone.get(b.id) ?? 0,
        chaptersTotal: chapterTotals.get(b.id) ?? 0,
      }))
      // Most-complete last: the ones still in flight are what need looking at.
      .sort((a, b) => a.name.localeCompare(b.name)),
    upcoming: ((sessions.data ?? []) as {
      id: string; batch_id: string; subject_id: string; title: string | null; starts_at: string;
    }[]).map((s) => ({
      sessionId: s.id,
      batchName: batchName.get(s.batch_id) ?? null,
      subjectName: subjectName.get(s.subject_id) ?? null,
      title: s.title,
      startsAt: s.starts_at,
    })),
  };
}
