/**
 * Reads for the college exam report (/dashboard/reports), all from the RPCs in
 * migration 179 — where the percentage maths lives, because an attempt stores
 * MARKS and each exam has its own total. Averaging marks across exams with
 * different totals would be wrong, so the browser never sees raw marks without
 * the total beside them.
 *
 * Authorization is exam_report_college() inside every RPC: an unscoped
 * exam.results.view_all may ask for any college or all of them, a college-scoped
 * grant is pinned to its own. These helpers add none of their own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** The from/to/college scope every report read shares. */
export type ReportScope = { from: string | null; to: string | null; college: string | null };

export function readReportScope(sp: URLSearchParams): ReportScope {
  return {
    from: sp.get("from") || null,
    to: sp.get("to") || null,
    college: sp.get("college") || null,
  };
}

const args = (s: ReportScope) => ({ p_from: s.from, p_to: s.to, p_college: s.college });

export type ReportSummary = {
  sittings: number;
  students: number;
  attempts: number;
  assigned: number;
  avg_pct: number | null;
  median_pct: number | null;
  best_exam: string | null;
  best_pct: number | null;
  weakest_exam: string | null;
  weakest_pct: number | null;
};

export type TrendPoint = { month: string; avg_pct: number | null; attempts: number; students: number };

export type ExamRow = {
  session_id: string;
  exam_id: string;
  title: string;
  label: string | null;
  college_name: string | null;
  held_on: string | null;
  results_published: boolean;
  assigned: number;
  attempts: number;
  avg_pct: number | null;
  high_pct: number | null;
  low_pct: number | null;
  total_marks: number | null;
};

export type SubjectRow = { subject: string; avg_pct: number | null; questions: number; attempts: number };
export type BandRow = { band: string; lower_pct: number; attempts: number };

/** One (student, sitting) pair — the client pivots these into the matrix. */
export type StudentExamRow = {
  student_id: string;
  student_name: string | null;
  roll_number: string | null;
  college_name: string | null;
  session_id: string;
  exam_title: string;
  session_label: string | null;
  held_on: string | null;
  score: number | null;
  total_marks: number | null;
  pct: number | null;
  submitted_at: string | null;
};

type Client = SupabaseClient;

async function rpc<T>(supabase: Client, fn: string, a: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, a);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchReportSummary(supabase: Client, s: ReportScope): Promise<ReportSummary | null> {
  const d = await rpc<ReportSummary[] | ReportSummary>(supabase, "college_exam_report_summary", args(s));
  return (Array.isArray(d) ? d[0] : d) ?? null;
}

export async function fetchReportTrend(supabase: Client, s: ReportScope): Promise<TrendPoint[]> {
  return (await rpc<TrendPoint[]>(supabase, "college_exam_report_trend", args(s))) ?? [];
}

export async function fetchReportExams(supabase: Client, s: ReportScope): Promise<ExamRow[]> {
  return (await rpc<ExamRow[]>(supabase, "college_exam_report_exams", args(s))) ?? [];
}

export async function fetchReportSubjects(supabase: Client, s: ReportScope): Promise<SubjectRow[]> {
  return (await rpc<SubjectRow[]>(supabase, "college_exam_report_subjects", args(s))) ?? [];
}

export async function fetchReportDistribution(supabase: Client, s: ReportScope): Promise<BandRow[]> {
  return (await rpc<BandRow[]>(supabase, "college_exam_report_distribution", args(s))) ?? [];
}

export async function fetchReportStudents(supabase: Client, s: ReportScope): Promise<StudentExamRow[]> {
  return (await rpc<StudentExamRow[]>(supabase, "college_exam_report_students", args(s))) ?? [];
}
