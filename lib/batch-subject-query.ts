// Typed data-access for a batch's subjects + per-subject mentor assignments
// (issue #64; schema in migrations 134/135). The subject taxonomy and
// mentor_profile are RLS-locked away from finance staff, so the cross-boundary
// reads go through the SECURITY DEFINER RPCs in migration 135 (each guarded by
// finance.manage) rather than direct table selects. Mirrors lib/batch-query.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignedMentor = { mentorId: string; fullName: string | null };
export type BatchSubjectRow = {
  subjectId: string;
  name: string;
  sortOrder: number;
  mentors: AssignedMentor[];
};
export type SyllabusSubject = { subjectId: string; name: string; examCode: string | null };
export type EligibleMentor = { mentorId: string; fullName: string | null; email: string };

export type BatchSubjectsData = {
  subjects: BatchSubjectRow[];
  syllabusSubjects: SyllabusSubject[];
  eligibleMentors: EligibleMentor[];
};

export async function fetchBatchSubjectsData(
  supabase: SupabaseClient,
  batchId: string
): Promise<BatchSubjectsData> {
  const [assigned, mentorLinks, syllabus, eligible] = await Promise.all([
    supabase
      .from("batch_subject")
      .select("subject_id, subject_name, sort_order")
      .eq("batch_id", batchId)
      .order("sort_order"),
    supabase
      .from("batch_subject_mentor")
      .select("subject_id, mentor_id, mentor_name")
      .eq("batch_id", batchId),
    supabase.rpc("batch_syllabus_subjects", { p_batch_id: batchId }),
    supabase.rpc("batch_eligible_mentors"),
  ]);

  if (assigned.error) throw new Error(`batch_subject: ${assigned.error.message}`);
  if (mentorLinks.error) throw new Error(`batch_subject_mentor: ${mentorLinks.error.message}`);
  if (syllabus.error) throw new Error(`syllabus: ${syllabus.error.message}`);
  if (eligible.error) throw new Error(`mentors: ${eligible.error.message}`);

  const mentorsBySubject = new Map<string, AssignedMentor[]>();
  for (const m of (mentorLinks.data ?? []) as {
    subject_id: string;
    mentor_id: string;
    mentor_name: string | null;
  }[]) {
    const list = mentorsBySubject.get(m.subject_id) ?? [];
    list.push({ mentorId: m.mentor_id, fullName: m.mentor_name });
    mentorsBySubject.set(m.subject_id, list);
  }

  const subjects: BatchSubjectRow[] = (
    (assigned.data ?? []) as { subject_id: string; subject_name: string | null; sort_order: number }[]
  ).map((s) => ({
    subjectId: s.subject_id,
    name: s.subject_name ?? "Subject",
    sortOrder: s.sort_order,
    mentors: mentorsBySubject.get(s.subject_id) ?? [],
  }));

  const syllabusSubjects: SyllabusSubject[] = (
    (syllabus.data ?? []) as { subject_id: string; subject_name: string; exam_code: string | null }[]
  ).map((s) => ({ subjectId: s.subject_id, name: s.subject_name, examCode: s.exam_code }));

  const eligibleMentors: EligibleMentor[] = (
    (eligible.data ?? []) as { mentor_id: string; full_name: string | null; email: string }[]
  ).map((m) => ({ mentorId: m.mentor_id, fullName: m.full_name, email: m.email }));

  return { subjects, syllabusSubjects, eligibleMentors };
}
