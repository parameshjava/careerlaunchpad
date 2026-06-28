// Manual validation for exam authoring + blueprint building, mirroring the
// field-by-field style of lib/registration.ts (no zod in this codebase). Each
// validator returns { clean, errors }: a normalized payload ready for insert and
// a list of human-readable errors. Referential checks that need the DB (chapter
// exists, passage in same subject) take a SupabaseClient and run under RLS, so
// they also enforce that the referenced rows are visible to the caller's college.
import type { SupabaseClient } from "@supabase/supabase-js";

import { DIFFICULTIES, type AnswerType, type Difficulty, type QuestionKind } from "@/lib/exam-query";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: QuestionKind[] = ["standard", "passage", "data_sufficiency"];
const ANSWER_TYPES: AnswerType[] = ["single", "multi"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

// ----------------------------------------------------------------------------
// Question
// ----------------------------------------------------------------------------

export type QuestionOptionInput = { label: string; is_correct: boolean };

export type CleanQuestion = {
  subject_id: string; // derived from the chapter (denormalized column); bank is global
  chapter_id: string;
  passage_id: string | null;
  kind: QuestionKind;
  difficulty: Difficulty;
  answer_type: AnswerType;
  stem: string;
  stem_image_url: string | null;
  explanation: string | null;
  options: { label: string; is_correct: boolean; position: number }[];
};

export type ValidationResult<T> = { clean: T | null; errors: string[] };

export async function validateQuestion(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<ValidationResult<CleanQuestion>> {
  const errors: string[] = [];

  const chapterId = str(data.chapter_id);
  if (!UUID_RE.test(chapterId)) errors.push("chapter_id: required");

  const passageRaw = data.passage_id == null ? "" : str(data.passage_id);
  const passageId = passageRaw || null;
  if (passageId && !UUID_RE.test(passageId)) errors.push("passage_id: invalid");

  const kind = str(data.kind) || "standard";
  if (!KINDS.includes(kind as QuestionKind)) errors.push("kind: invalid");

  const difficulty = str(data.difficulty);
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) errors.push("difficulty: required");

  const answerType = str(data.answer_type);
  if (!ANSWER_TYPES.includes(answerType as AnswerType)) errors.push("answer_type: required");

  const stem = str(data.stem);
  if (!stem) errors.push("stem: required");

  const stemImageUrl = data.stem_image_url == null ? null : str(data.stem_image_url) || null;
  const explanation = data.explanation == null ? null : str(data.explanation) || null;

  // Options: 4 or 5 (the source bank uses a 5th "None of these"), each labelled,
  // ≥1 correct; single ⇒ exactly 1 correct.
  const rawOptions = Array.isArray(data.options) ? (data.options as unknown[]) : [];
  if (rawOptions.length < 4 || rawOptions.length > 5)
    errors.push("options: 4 or 5 required");
  const options = rawOptions.map((o, i) => {
    const obj = (o ?? {}) as Record<string, unknown>;
    const label = str(obj.label);
    if (!label) errors.push(`options[${i}].label: required`);
    return { label, is_correct: obj.is_correct === true, position: i };
  });
  const correctCount = options.filter((o) => o.is_correct).length;
  if (correctCount < 1) errors.push("options: at least one correct answer required");
  if (answerType === "single" && correctCount !== 1)
    errors.push("answer_type 'single' requires exactly one correct option");

  // Referential: chapter must exist; derive its (global) subject_id, which is
  // denormalized onto the question for the generator's hot query.
  let subjectId = "";
  if (UUID_RE.test(chapterId)) {
    const { data: chapter, error } = await supabase
      .from("chapter")
      .select("id, subject_id")
      .eq("id", chapterId)
      .maybeSingle();
    if (error) errors.push(`chapter: ${error.message}`);
    else if (!chapter) errors.push("chapter_id: not found");
    else subjectId = chapter.subject_id as string;
  }

  // Passage (if set) must belong to the same subject as the chapter.
  if (passageId && UUID_RE.test(passageId) && subjectId) {
    const { data: passage, error } = await supabase
      .from("passage")
      .select("id, subject_id")
      .eq("id", passageId)
      .maybeSingle();
    if (error) errors.push(`passage: ${error.message}`);
    else if (!passage) errors.push("passage_id: not found");
    else if (passage.subject_id !== subjectId)
      errors.push("passage_id: must belong to the same subject as the chapter");
  }

  if (errors.length || !subjectId) return { clean: null, errors };

  return {
    clean: {
      subject_id: subjectId,
      chapter_id: chapterId,
      passage_id: passageId,
      kind: kind as QuestionKind,
      difficulty: difficulty as Difficulty,
      answer_type: answerType as AnswerType,
      stem,
      stem_image_url: stemImageUrl,
      explanation,
      options,
    },
    errors,
  };
}

// ----------------------------------------------------------------------------
// Blueprint
// ----------------------------------------------------------------------------

export type CleanSection = {
  subject_id: string;
  num_questions: number;
  marks_per_question: number;
  pct_easy: number;
  pct_medium: number;
  pct_hard: number;
  pct_very_hard: number;
  position: number;
  chapter_quota: { chapter_id: string; pct: number }[] | null;
};

export type CleanBlueprint = {
  title: string;
  duration_minutes: number;
  generation_strategy: "fixed";
  shuffle_questions: boolean;
  shuffle_options: boolean;
  negative_mark_per_wrong: number;
  sections: CleanSection[];
};

const int = (v: unknown) => {
  const n = typeof v === "number" ? v : parseInt(str(v), 10);
  return Number.isFinite(n) ? n : NaN;
};
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(str(v));
  return Number.isFinite(n) ? n : NaN;
};

// Structural validation only (sums, ranges, shapes). Whether the question bank
// can actually satisfy the quotas is the separate feasibility check (spec §9.4),
// run against the DB before publish.
export function validateBlueprint(data: Record<string, unknown>): ValidationResult<CleanBlueprint> {
  const errors: string[] = [];

  const title = str(data.title);
  if (!title) errors.push("title: required");

  const duration = int(data.duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0) errors.push("duration_minutes: must be > 0");

  const negative = data.negative_mark_per_wrong == null ? 0 : num(data.negative_mark_per_wrong);
  if (!Number.isFinite(negative) || negative < 0) errors.push("negative_mark_per_wrong: must be ≥ 0");

  const rawSections = Array.isArray(data.sections) ? (data.sections as unknown[]) : [];
  if (rawSections.length === 0) errors.push("sections: at least one required");

  const sections: CleanSection[] = rawSections.map((s, i) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    const subjectId = str(obj.subject_id);
    if (!UUID_RE.test(subjectId)) errors.push(`sections[${i}].subject_id: required`);

    const numQ = int(obj.num_questions);
    if (!Number.isFinite(numQ) || numQ < 1) errors.push(`sections[${i}].num_questions: must be ≥ 1`);

    const marks = obj.marks_per_question == null ? 1 : num(obj.marks_per_question);
    if (!Number.isFinite(marks) || marks < 0) errors.push(`sections[${i}].marks_per_question: must be ≥ 0`);

    const mix = (obj.difficulty_mix ?? {}) as Record<string, unknown>;
    const pe = int(mix.easy ?? 0);
    const pm = int(mix.medium ?? 0);
    const ph = int(mix.hard ?? 0);
    const pv = int(mix.very_hard ?? 0);
    const pcts = [pe, pm, ph, pv];
    if (pcts.some((p) => !Number.isFinite(p) || p < 0 || p > 100))
      errors.push(`sections[${i}].difficulty_mix: percentages must be 0–100`);
    else if (pe + pm + ph + pv !== 100)
      errors.push(`sections[${i}].difficulty_mix: must sum to 100`);

    // Optional per-chapter quota.
    let chapterQuota: { chapter_id: string; pct: number }[] | null = null;
    if (Array.isArray(obj.chapter_quota) && (obj.chapter_quota as unknown[]).length > 0) {
      const seen = new Set<string>();
      let sum = 0;
      chapterQuota = (obj.chapter_quota as unknown[]).map((q, j) => {
        const qo = (q ?? {}) as Record<string, unknown>;
        const cid = str(qo.chapter_id);
        const pct = int(qo.pct);
        if (!UUID_RE.test(cid)) errors.push(`sections[${i}].chapter_quota[${j}].chapter_id: invalid`);
        else if (seen.has(cid)) errors.push(`sections[${i}].chapter_quota: duplicate chapter`);
        seen.add(cid);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100)
          errors.push(`sections[${i}].chapter_quota[${j}].pct: must be 0–100`);
        else sum += pct;
        return { chapter_id: cid, pct };
      });
      if (sum !== 100) errors.push(`sections[${i}].chapter_quota: must sum to 100`);
    }

    return {
      subject_id: subjectId,
      num_questions: numQ,
      marks_per_question: marks,
      pct_easy: pe,
      pct_medium: pm,
      pct_hard: ph,
      pct_very_hard: pv,
      position: i,
      chapter_quota: chapterQuota,
    };
  });

  if (errors.length) return { clean: null, errors };

  return {
    clean: {
      title,
      duration_minutes: duration,
      generation_strategy: "fixed",
      shuffle_questions: data.shuffle_questions !== false,
      shuffle_options: data.shuffle_options !== false,
      negative_mark_per_wrong: negative,
      sections,
    },
    errors,
  };
}
