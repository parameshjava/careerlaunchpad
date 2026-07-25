// Server data-access for batch chapter progress (migration 143). Reads batch_subject
// (progress columns) + batch_chapter under RLS: a staff user with batch.progress.manage
// sees every subject/chapter; an assigned mentor sees only their subjects' chapters
// (batch_chapter mentor_read policy); an enrolled student sees completed ones. Writes
// go through the set_batch_*_progress RPCs, never these reads.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export type ChapterProgress = {
  chapterId: string;
  chapterName: string | null;
  sortOrder: number;
  status: ProgressStatus;
  completedAt: string | null;
};

export type SubjectProgress = {
  subjectId: string;
  subjectName: string | null;
  progressStatus: ProgressStatus;
  chapters: ChapterProgress[];
};

export type MentorBatchProgress = {
  batchId: string;
  batchName: string;
  batchStatus: string;
  subjects: SubjectProgress[];
};

// All subjects + chapters + status for one batch (staff view).
export async function fetchBatchProgress(
  supabase: SupabaseClient,
  batchId: string,
): Promise<SubjectProgress[]> {
  const [{ data: subs, error: sErr }, { data: chs, error: cErr }] = await Promise.all([
    supabase
      .from("batch_subject")
      .select("subject_id, subject_name, sort_order, progress_status")
      .eq("batch_id", batchId)
      .order("sort_order"),
    supabase
      .from("batch_chapter")
      .select("subject_id, chapter_id, chapter_name, sort_order, status, completed_at")
      .eq("batch_id", batchId)
      .order("sort_order"),
  ]);
  if (sErr) throw new Error(`batch_subject: ${sErr.message}`);
  if (cErr) throw new Error(`batch_chapter: ${cErr.message}`);

  const bySubject = new Map<string, ChapterProgress[]>();
  for (const c of chs ?? []) {
    const key = c.subject_id as string;
    const list = bySubject.get(key) ?? bySubject.set(key, []).get(key)!;
    list.push({
      chapterId: c.chapter_id as string,
      chapterName: (c.chapter_name as string | null) ?? null,
      sortOrder: (c.sort_order as number) ?? 0,
      status: (c.status as ProgressStatus) ?? "not_started",
      completedAt: (c.completed_at as string | null) ?? null,
    });
  }

  return (subs ?? []).map((s) => ({
    subjectId: s.subject_id as string,
    subjectName: (s.subject_name as string | null) ?? null,
    progressStatus: (s.progress_status as ProgressStatus) ?? "not_started",
    chapters: bySubject.get(s.subject_id as string) ?? [],
  }));
}

// The batches → assigned subjects → chapters a mentor teaches. batch_subject_mentor
// is readable by any authenticated user (migration 134), so a mentor reads their own
// rows directly; batch_chapter's mentor_read policy then scopes chapters to those
// same subjects.
export async function fetchMentorProgress(
  supabase: SupabaseClient,
  userId: string,
): Promise<MentorBatchProgress[]> {
  const { data: asg, error } = await supabase
    .from("batch_subject_mentor")
    .select("batch_id, subject_id")
    .eq("mentor_id", userId);
  if (error) throw new Error(`batch_subject_mentor: ${error.message}`);
  const assignments = asg ?? [];
  if (assignments.length === 0) return [];

  const batchIds = [...new Set(assignments.map((a) => a.batch_id as string))];
  const assignedByBatch = new Map<string, Set<string>>();
  for (const a of assignments) {
    const key = a.batch_id as string;
    (assignedByBatch.get(key) ?? assignedByBatch.set(key, new Set()).get(key)!).add(
      a.subject_id as string,
    );
  }

  const { data: batches } = await supabase
    .from("batch")
    .select("id, name, status")
    .in("id", batchIds);
  const batchMap = new Map((batches ?? []).map((b) => [b.id as string, b]));

  const out: MentorBatchProgress[] = [];
  for (const bid of batchIds) {
    const b = batchMap.get(bid);
    if (!b) continue;
    const all = await fetchBatchProgress(supabase, bid);
    const assigned = assignedByBatch.get(bid) ?? new Set<string>();
    const subjects = all.filter((s) => assigned.has(s.subjectId));
    out.push({
      batchId: bid,
      batchName: b.name as string,
      batchStatus: b.status as string,
      subjects,
    });
  }
  // Stable order: by batch name.
  out.sort((a, b) => a.batchName.localeCompare(b.batchName));
  return out;
}
