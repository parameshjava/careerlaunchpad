// Typed data-access for the ASSESSMENT question bank (migration 143) — the
// per-chapter quiz bank that mirrors the exam bank (lib/exam-query.ts) but is a
// SEPARATE set of tables (assessment_question / assessment_question_option),
// global (keyed by subject/chapter), and has NO passages. Reads are bounded by
// the RLS in migration 143 (exam staff only). Scalar types + subject/chapter
// reads are shared with the exam bank (same global taxonomy).
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  chapterNameMap,
  type ActiveStatus,
  type AnswerType,
  type Difficulty,
  type QuestionOption,
} from "@/lib/exam-query";

// Assessment questions are standalone MCQs — no passage kind (migration 143 Q10).
export type AssessmentKind = "standard" | "data_sufficiency";

export type AssessmentQuestionListItem = {
  id: string;
  subjectId: string;
  chapterId: string;
  chapterName: string | null;
  kind: AssessmentKind;
  difficulty: Difficulty;
  answerType: AnswerType;
  stem: string;
  status: ActiveStatus;
  version: number;
  /** Provenance (migration 145): the paper/test the question appeared in. */
  source: string | null;
  sourceYear: number | null;
  /** Options in order, with the correct one(s) flagged — for inline answer display. */
  options: { label: string; isCorrect: boolean }[];
};

export type AssessmentQuestionFull = AssessmentQuestionListItem & {
  stemImageUrl: string | null;
  explanation: string | null;
  options: QuestionOption[];
};

export type AssessmentQuestionFilters = {
  subjectId?: string;
  chapterId?: string;
  difficulty?: Difficulty;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export async function fetchAssessmentQuestions(
  supabase: SupabaseClient,
  filters: AssessmentQuestionFilters = {},
): Promise<{ questions: AssessmentQuestionListItem[]; total: number }> {
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  let q = supabase
    .from("assessment_question")
    .select(
      "id, subject_id, chapter_id, kind, difficulty, answer_type, stem, status, version, source, source_year",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (filters.subjectId) q = q.eq("subject_id", filters.subjectId);
  if (filters.chapterId) q = q.eq("chapter_id", filters.chapterId);
  if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
  if (!filters.includeArchived) q = q.eq("status", "active");
  const { data, error, count } = await q;
  if (error) throw new Error(`assessment_question: ${error.message}`);
  const rows = data ?? [];
  const names = await chapterNameMap(supabase, rows.map((r) => r.chapter_id as string));

  const optsByQ = new Map<string, { label: string; isCorrect: boolean; position: number }[]>();
  if (rows.length > 0) {
    const { data: opts } = await supabase
      .from("assessment_question_option")
      .select("question_id, label, is_correct, position")
      .in("question_id", rows.map((r) => r.id as string));
    for (const o of opts ?? []) {
      const key = o.question_id as string;
      (optsByQ.get(key) ?? optsByQ.set(key, []).get(key)!).push({
        label: o.label as string,
        isCorrect: o.is_correct as boolean,
        position: o.position as number,
      });
    }
  }

  const questions = rows.map((r) => {
    const options = (optsByQ.get(r.id as string) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ label: o.label, isCorrect: o.isCorrect }));
    return {
      id: r.id as string,
      subjectId: r.subject_id as string,
      chapterId: r.chapter_id as string,
      chapterName: names.get(r.chapter_id as string) ?? null,
      kind: r.kind as AssessmentKind,
      difficulty: r.difficulty as Difficulty,
      answerType: r.answer_type as AnswerType,
      stem: r.stem as string,
      status: r.status as ActiveStatus,
      version: r.version as number,
      source: (r.source as string | null) ?? null,
      sourceYear: (r.source_year as number | null) ?? null,
      options,
    };
  });
  return { questions, total: count ?? questions.length };
}

export async function fetchAssessmentQuestionFull(
  supabase: SupabaseClient,
  id: string,
): Promise<AssessmentQuestionFull | null> {
  const { data, error } = await supabase
    .from("assessment_question")
    .select(
      "id, subject_id, chapter_id, kind, difficulty, answer_type, stem, stem_image_url, explanation, status, version, source, source_year, assessment_question_option(id, label, is_correct, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`assessment_question: ${error.message}`);
  if (!data) return null;

  const names = await chapterNameMap(supabase, [data.chapter_id as string]);
  const chapterName = names.get(data.chapter_id as string) ?? null;

  const options = ((data.assessment_question_option ?? []) as {
    id: string;
    label: string;
    is_correct: boolean;
    position: number;
  }[])
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ id: o.id, label: o.label, isCorrect: o.is_correct, position: o.position }));

  return {
    id: data.id as string,
    subjectId: data.subject_id as string,
    chapterId: data.chapter_id as string,
    chapterName: chapterName ?? null,
    kind: data.kind as AssessmentKind,
    difficulty: data.difficulty as Difficulty,
    answerType: data.answer_type as AnswerType,
    stem: data.stem as string,
    stemImageUrl: (data.stem_image_url as string | null) ?? null,
    explanation: (data.explanation as string | null) ?? null,
    status: data.status as ActiveStatus,
    version: data.version as number,
    source: (data.source as string | null) ?? null,
    sourceYear: (data.source_year as number | null) ?? null,
    options,
  };
}
