// Validation for ASSESSMENT question authoring. Reuses the DB-free field checks
// from lib/exam-validation.ts (validateQuestionFields — enums, stem, option
// shape/correct-count, required explanation) so the two banks can't drift, then
// adds the assessment-specific rules: kind is limited to standard/data_sufficiency
// (no passages, migration 143 Q10) and the referential chapter check (no passage).
import type { SupabaseClient } from "@supabase/supabase-js";

import { type AnswerType, type Difficulty } from "@/lib/exam-query";
import { validateQuestionFields, type ValidationResult } from "@/lib/exam-validation";
import { type AssessmentKind } from "@/lib/assessment-query";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

export type CleanAssessmentQuestion = {
  subject_id: string; // derived from the chapter (denormalized); bank is global
  chapter_id: string;
  kind: AssessmentKind;
  difficulty: Difficulty;
  answer_type: AnswerType;
  stem: string;
  stem_image_url: string | null;
  explanation: string | null;
  options: { label: string; is_correct: boolean; position: number }[];
};

export async function validateAssessmentQuestion(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<ValidationResult<CleanAssessmentQuestion>> {
  const { errors: fieldErrors, fields } = validateQuestionFields(data);
  const errors = [...fieldErrors];

  // Assessment questions are standalone MCQs — no passage kind (Q10).
  if (fields && fields.kind === "passage")
    errors.push("kind: passage-based questions are not supported in assessments");

  const chapterId = str(data.chapter_id);
  if (!UUID_RE.test(chapterId)) errors.push("chapter_id: required");

  // Referential: chapter must exist; derive its (global) subject_id, denormalized
  // onto the question (same as the exam bank).
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

  if (errors.length || !subjectId || !fields) return { clean: null, errors };

  return {
    clean: {
      subject_id: subjectId,
      chapter_id: chapterId,
      kind: fields.kind as AssessmentKind,
      difficulty: fields.difficulty,
      answer_type: fields.answer_type,
      stem: fields.stem,
      stem_image_url: fields.stem_image_url,
      explanation: fields.explanation,
      options: fields.options,
    },
    errors,
  };
}
