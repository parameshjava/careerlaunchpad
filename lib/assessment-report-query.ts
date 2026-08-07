/**
 * Reads for the college chapter-ASSESSMENT report, from the RPCs in migration 180.
 *
 * Distinct from lib/exam-report-query.ts because the two instruments are
 * different: a chapter quiz is retakeable and its attempt carries total_marks and
 * a `passed` flag against the chapter's own pass mark, so a PASS RATE is a fact
 * here — whereas an exam has no pass mark at all and 179 deliberately reports
 * none. One score per (student, chapter) = their BEST submitted attempt, matching
 * what the student sees of themselves (147/155).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportScope } from "@/lib/exam-report-query";

const args = (s: ReportScope) => ({ p_from: s.from, p_to: s.to, p_college: s.college });

export type AssessmentSummary = {
  students: number;
  chapters_assessed: number;
  attempts: number;
  avg_pct: number | null;
  median_pct: number | null;
  pass_rate_pct: number | null;
  best_subject: string | null;
  best_pct: number | null;
  weakest_subject: string | null;
  weakest_pct: number | null;
};

export type AssessmentTrendPoint = {
  month: string;
  avg_pct: number | null;
  pass_rate_pct: number | null;
  chapters: number;
  students: number;
};

export type AssessmentSubjectRow = {
  subject_id: string | null;
  subject: string;
  avg_pct: number | null;
  pass_rate_pct: number | null;
  chapters: number;
  students: number;
};

export type AssessmentChapterRow = {
  chapter_id: string;
  chapter: string;
  subject: string;
  avg_pct: number | null;
  pass_rate_pct: number | null;
  students: number;
  below_pass: number;
};

/** One (student, subject) cell for the matrix. */
export type AssessmentStudentRow = {
  student_id: string;
  student_name: string | null;
  roll_number: string | null;
  college_name: string | null;
  subject_id: string | null;
  subject: string;
  avg_pct: number | null;
  chapters: number;
  passed_count: number;
  pass_rate_pct: number | null;
};

type Client = SupabaseClient;

async function rpc<T>(supabase: Client, fn: string, a: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, a);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchAssessmentSummary(supabase: Client, s: ReportScope) {
  const d = await rpc<AssessmentSummary[] | AssessmentSummary>(supabase, "college_assessment_summary", args(s));
  return (Array.isArray(d) ? d[0] : d) ?? null;
}
export async function fetchAssessmentTrend(supabase: Client, s: ReportScope) {
  return (await rpc<AssessmentTrendPoint[]>(supabase, "college_assessment_trend", args(s))) ?? [];
}
export async function fetchAssessmentSubjects(supabase: Client, s: ReportScope) {
  return (await rpc<AssessmentSubjectRow[]>(supabase, "college_assessment_subjects", args(s))) ?? [];
}
export async function fetchAssessmentChapters(supabase: Client, s: ReportScope) {
  return (await rpc<AssessmentChapterRow[]>(supabase, "college_assessment_chapters", args(s))) ?? [];
}
export async function fetchAssessmentStudents(supabase: Client, s: ReportScope) {
  return (await rpc<AssessmentStudentRow[]>(supabase, "college_assessment_students", args(s))) ?? [];
}
