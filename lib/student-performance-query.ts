// Query helpers for the student performance view (#73), mirroring
// lib/analytics-query.ts. The routes under app/api/student/performance/* were
// calling supabase.rpc inline, so the row shapes lived only in the client
// component's type aliases and the range/batch parsing was copy-pasted six times.
//
// Every RPC here is SECURITY DEFINER and filters on auth.uid() internally
// (migrations 147, 153, 154) — these helpers never take a student id, so there is
// no parameter through which one student could read another's scores.
import type { SupabaseClient } from "@supabase/supabase-js";

/** The from/to/batch scope every performance read shares. */
export type PerfScope = {
  from: string | null;
  to: string | null;
  batch: string | null;
};

export type PerfSummary = {
  overall_pct: number | null;
  pass_rate_pct: number | null;
  chapters_assessed: number;
  chapters_completed: number;
  strongest_subject: string | null;
  strongest_pct: number | null;
  weakest_subject: string | null;
  weakest_pct: number | null;
};

export type SubjectScore = {
  subject_id: string;
  subject_name: string;
  score_pct: number | null;
  chapters_assessed: number;
  chapters_completed: number;
  /** The range of pass marks across the subject's chapters. There is no such
   *  thing as a subject-level pass mark in this schema (chapter_quiz is one row
   *  per chapter), so an averaged mark would be an invented number — the UI draws
   *  a guide line only when min === max, and otherwise says the marks vary. */
  pass_pct_min: number;
  pass_pct_max: number;
  /** How many of the subject's assessed chapters are below THEIR OWN pass mark.
   *  This, not a comparison of the mean against an averaged mark, is what makes a
   *  subject "have gaps". */
  chapters_below_pass: number;
};

export type ChapterScore = {
  chapter_id: string;
  chapter_name: string;
  best_pct: number | null;
  first_pct: number | null;
  attempts_used: number;
  attempts_remaining: number;
  pass_pct: number;
  passed: boolean | null;
};

export type TrendPoint = {
  month: string;
  subject_id: string | null;
  subject_name: string | null;
  pct: number;
};

export type MasteryCell = {
  subject_id: string;
  subject_name: string;
  chapter_id: string;
  chapter_name: string;
  best_pct: number | null;
  pass_pct: number;
  attempts_used: number;
};

export type PlanItem = {
  chapter_id: string;
  chapter_name: string;
  subject_name: string;
  best_pct: number | null;
  attempts_used: number;
  attempts_remaining: number;
  pass_pct: number;
  category: "quick_win" | "not_attempted" | "needs_study" | "below_target";
  /** What lifting this one chapter to the target adds to the overall average.
   *  0 when there are no attempts left — an unactionable chapter is not a lever. */
  points_to_target: number;
};

/** The pass-mark floor from 153: every unpassed assessed chapter lifted to its
 *  own pass mark. Deliberately pessimistic; shown beside the ladder. */
export type PlanProjection = {
  target: number | null;
  current_avg: number | null;
  projected_avg: number | null;
  chapters_to_lift: number;
  /** How many of chapters_to_lift can actually be retaken. When this is 0 the
   *  "floor" is unreachable, and saying "just scrape these past the pass mark"
   *  would be advice the student cannot act on. */
  liftable_chapters: number;
  /** Assessed, below its own pass mark, and out of attempts. Counted separately
   *  because clear_below_pass excludes these, and inferring "you passed
   *  everything" from that exclusion produced a false statement. */
  blocked_chapters: number;
  /** The best average still reachable: 100% on everything retakeable or
   *  unattempted, existing best on anything locked. Explains WHY a target is or
   *  is not reachable instead of just asserting it. */
  ceiling_avg: number | null;
  gap_to_target: number | null;
  reaches_target: boolean | null;
};

/** One rung of the route from today's average to the target (migration 154). */
export type LadderStep = {
  key: "today" | "attempt_unassessed" | "clear_below_pass" | "push_to_target";
  chapters: number;
  assumed_pct: number | null;
  avg: number | null;
};

export type StudyPlan = {
  items: PlanItem[];
  projection: PlanProjection | null;
  ladder: LadderStep[];
};

/** Read the shared from/to/batch scope off a request's query string. */
export function readScope(sp: URLSearchParams): PerfScope {
  return {
    from: sp.get("from") || null,
    to: sp.get("to") || null,
    batch: sp.get("batch") || null,
  };
}

const scopeArgs = (s: PerfScope) => ({ p_from: s.from, p_to: s.to, p_batch: s.batch });

// Supabase's generated types aren't wired up in this repo, so rpc() is untyped;
// each helper asserts the row shape its migration declares.
type Client = SupabaseClient;

async function rpc<T>(supabase: Client, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchSummary(supabase: Client, scope: PerfScope): Promise<PerfSummary | null> {
  const data = await rpc<PerfSummary[] | PerfSummary>(supabase, "student_performance_summary", scopeArgs(scope));
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function fetchSubjectScores(supabase: Client, scope: PerfScope): Promise<SubjectScore[]> {
  return (await rpc<SubjectScore[]>(supabase, "student_subject_scores", scopeArgs(scope))) ?? [];
}

export async function fetchChapterScores(
  supabase: Client,
  subjectId: string,
  scope: PerfScope,
): Promise<ChapterScore[]> {
  return (
    (await rpc<ChapterScore[]>(supabase, "student_chapter_scores", {
      p_subject: subjectId,
      ...scopeArgs(scope),
    })) ?? []
  );
}

export async function fetchTrend(
  supabase: Client,
  scope: PerfScope,
  group: "overall" | "subject",
): Promise<TrendPoint[]> {
  return (
    (await rpc<TrendPoint[]>(supabase, "student_score_trend", {
      ...scopeArgs(scope),
      p_group: group,
    })) ?? []
  );
}

export async function fetchMastery(supabase: Client, scope: PerfScope): Promise<MasteryCell[]> {
  return (await rpc<MasteryCell[]>(supabase, "student_mastery_grid", scopeArgs(scope))) ?? [];
}

export async function fetchStudyPlan(
  supabase: Client,
  batch: string | null,
  target: number | null,
): Promise<StudyPlan> {
  const data = await rpc<Partial<StudyPlan> | null>(supabase, "student_study_plan", {
    p_batch: batch,
    p_target: target,
  });
  return {
    items: data?.items ?? [],
    projection: data?.projection ?? null,
    ladder: data?.ladder ?? [],
  };
}

export async function fetchBatches(
  supabase: Client,
): Promise<{ batch_id: string; batch_name: string }[]> {
  return (
    (await rpc<{ batch_id: string; batch_name: string }[]>(
      supabase,
      "student_performance_batches",
      {},
    )) ?? []
  );
}
