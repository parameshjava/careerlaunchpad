// "My batches" — the signed-in student's own enrolments (issue: students had no
// single place that said which batches they are in).
//
// NO NEW RLS OR RPC IS NEEDED, and that is worth stating because it isn't obvious:
//   • student_enrollment  — `enrollment_self_read` (125) scopes rows to auth.uid().
//   • batch / course / batch_subject / batch_subject_mentor — `select true` for any
//     authenticated user, so names and mentor names come along for free.
//   • batch_chapter — `batch_chapter_student_read` (143) allows an ENROLLED student,
//     which is what makes real "12 of 40 chapters done" progress possible here.
//   • batch_session — `batch_session_self_read` (134), same, for the next class.
// Every query below is therefore a plain table read under the student's own session.
//
// THE STATUS RULE (previously implicit and inconsistent per surface)
//   Assessments counts pending/active/completed; My fees shows every status
//   including cancelled; the #84 feedback RPCs count only pending/active. This page
//   is the one that has to show a student their WHOLE history, so it lists all
//   enrolments and groups them:
//     current  — enrolment pending or active   (what you are doing now)
//     finished — enrolment completed           (what you have done)
//     closed   — enrolment cancelled           (with the reason, if staff gave one)
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnrollmentStatus = "pending" | "active" | "completed" | "cancelled";
export type BatchGroup = "current" | "finished" | "closed";

export type MyBatchSubject = {
  subjectId: string;
  subjectName: string | null;
  mentors: string[];
};

export type MyBatch = {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  batchCode: string | null;
  batchStatus: string;
  courseName: string | null;
  academicYear: string | null;
  deliveryMode: string | null;
  startDate: string | null;
  endDate: string | null;
  enrollmentStatus: EnrollmentStatus;
  enrolledOn: string | null;
  rejectionReason: string | null;
  group: BatchGroup;
  chaptersTotal: number;
  chaptersCompleted: number;
  subjects: MyBatchSubject[];
  nextSession: { title: string; startsAt: string; deliveryMode: string | null } | null;
};

export type MyBatchSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  deliveryMode: string | null;
  status: string;
  joinUrl: string | null;
};

function groupFor(status: EnrollmentStatus): BatchGroup {
  if (status === "cancelled") return "closed";
  if (status === "completed") return "finished";
  return "current";
}

export const GROUP_LABELS: Record<BatchGroup, string> = {
  current: "Current",
  finished: "Finished",
  closed: "Not enrolled",
};

export async function fetchMyBatches(
  supabase: SupabaseClient,
  studentId: string,
): Promise<MyBatch[]> {
  const { data: enr, error } = await supabase
    .from("student_enrollment")
    .select("id, batch_id, status, enrolled_on, rejection_reason")
    .eq("student_id", studentId)
    .order("enrolled_on", { ascending: false });
  if (error) throw new Error(`student_enrollment: ${error.message}`);

  const rows = (enr ?? []) as {
    id: string;
    batch_id: string;
    status: EnrollmentStatus;
    enrolled_on: string | null;
    rejection_reason: string | null;
  }[];
  if (rows.length === 0) return [];

  const batchIds = [...new Set(rows.map((r) => r.batch_id))];

  // One round trip per table rather than per batch — a student may be in several.
  const [batchRes, subjRes, mentorRes, chapterRes, sessionRes] = await Promise.all([
    supabase
      .from("batch")
      .select("id, name, code, status, academic_year, delivery_mode, start_date, end_date, course:course_id(name)")
      .in("id", batchIds),
    supabase
      .from("batch_subject")
      .select("batch_id, subject_id, subject_name, sort_order")
      .in("batch_id", batchIds)
      .order("sort_order"),
    supabase
      .from("batch_subject_mentor")
      .select("batch_id, subject_id, mentor_name")
      .in("batch_id", batchIds),
    supabase
      .from("batch_chapter")
      .select("batch_id, status")
      .in("batch_id", batchIds),
    // Only what's ahead: the "next class" line is the one thing here a student
    // checks repeatedly, so past sessions are not worth fetching.
    supabase
      .from("batch_session")
      .select("batch_id, title, starts_at, delivery_mode, status")
      .in("batch_id", batchIds)
      .gte("starts_at", new Date().toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(200),
  ]);
  if (batchRes.error) throw new Error(`batch: ${batchRes.error.message}`);

  type BatchRow = {
    id: string;
    name: string;
    code: string | null;
    status: string;
    academic_year: string | null;
    delivery_mode: string | null;
    start_date: string | null;
    end_date: string | null;
    course: { name: string | null } | { name: string | null }[] | null;
  };
  const batchMap = new Map(((batchRes.data ?? []) as BatchRow[]).map((b) => [b.id, b]));

  // Mentors per (batch, subject) — several mentors may share one subject.
  const mentorsBySubject = new Map<string, string[]>();
  for (const m of (mentorRes.data ?? []) as { batch_id: string; subject_id: string; mentor_name: string | null }[]) {
    if (!m.mentor_name) continue;
    const key = `${m.batch_id}:${m.subject_id}`;
    (mentorsBySubject.get(key) ?? mentorsBySubject.set(key, []).get(key)!).push(m.mentor_name);
  }

  const subjectsByBatch = new Map<string, MyBatchSubject[]>();
  for (const s of (subjRes.data ?? []) as { batch_id: string; subject_id: string; subject_name: string | null }[]) {
    const list = subjectsByBatch.get(s.batch_id) ?? subjectsByBatch.set(s.batch_id, []).get(s.batch_id)!;
    list.push({
      subjectId: s.subject_id,
      subjectName: s.subject_name,
      mentors: mentorsBySubject.get(`${s.batch_id}:${s.subject_id}`) ?? [],
    });
  }

  const progressByBatch = new Map<string, { total: number; done: number }>();
  for (const c of (chapterRes.data ?? []) as { batch_id: string; status: string }[]) {
    const p = progressByBatch.get(c.batch_id) ?? { total: 0, done: 0 };
    p.total += 1;
    if (c.status === "completed") p.done += 1;
    progressByBatch.set(c.batch_id, p);
  }

  // Sessions arrive ordered, so the first hit per batch is the soonest.
  const nextByBatch = new Map<string, MyBatch["nextSession"]>();
  for (const s of (sessionRes.data ?? []) as {
    batch_id: string;
    title: string;
    starts_at: string;
    delivery_mode: string | null;
  }[]) {
    if (nextByBatch.has(s.batch_id)) continue;
    nextByBatch.set(s.batch_id, {
      title: s.title,
      startsAt: s.starts_at,
      deliveryMode: s.delivery_mode,
    });
  }

  const out: MyBatch[] = [];
  for (const r of rows) {
    const b = batchMap.get(r.batch_id);
    // A batch the student can't read (or that was deleted) is skipped rather than
    // rendered as a blank card.
    if (!b) continue;
    const course = Array.isArray(b.course) ? b.course[0] : b.course;
    const p = progressByBatch.get(r.batch_id) ?? { total: 0, done: 0 };
    out.push({
      enrollmentId: r.id,
      batchId: r.batch_id,
      batchName: b.name,
      batchCode: b.code,
      batchStatus: b.status,
      courseName: course?.name ?? null,
      academicYear: b.academic_year,
      deliveryMode: b.delivery_mode,
      startDate: b.start_date,
      endDate: b.end_date,
      enrollmentStatus: r.status,
      enrolledOn: r.enrolled_on,
      rejectionReason: r.rejection_reason,
      group: groupFor(r.status),
      chaptersTotal: p.total,
      chaptersCompleted: p.done,
      subjects: subjectsByBatch.get(r.batch_id) ?? [],
      nextSession: nextByBatch.get(r.batch_id) ?? null,
    });
  }
  return out;
}

/** One batch a student is enrolled in, or null if they aren't in it. The null is
 *  the authorization: `enrollment_self_read` returns no row for someone else's
 *  batch, so a guessed URL yields "not found" rather than another batch's syllabus. */
export async function fetchMyBatch(
  supabase: SupabaseClient,
  studentId: string,
  batchId: string,
): Promise<MyBatch | null> {
  const all = await fetchMyBatches(supabase, studentId);
  return all.find((b) => b.batchId === batchId) ?? null;
}

/** This batch's class sessions for the calendar-ish tab.
 *
 *  start_url IS DELIBERATELY NOT SELECTED. It is the Zoom HOST link — migration 134
 *  says outright that students must never receive it, and `/api/calendar/sessions`
 *  exists in the same shape for the same reason. Adding it to this select would hand
 *  every student the ability to open the class as its host. */
export async function fetchMyBatchSessions(
  supabase: SupabaseClient,
  batchId: string,
): Promise<MyBatchSession[]> {
  const { data, error } = await supabase
    .from("batch_session")
    .select("id, title, starts_at, ends_at, delivery_mode, status, join_url")
    .eq("batch_id", batchId)
    .neq("status", "cancelled")
    .order("starts_at")
    .limit(500);
  if (error) throw new Error(`batch_session: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    startsAt: s.starts_at as string,
    endsAt: s.ends_at as string,
    deliveryMode: (s.delivery_mode as string | null) ?? null,
    status: s.status as string,
    joinUrl: (s.join_url as string | null) ?? null,
  }));
}
