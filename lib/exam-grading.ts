/**
 * How an exam attempt becomes a percentage, a grade and a verdict — the ONE
 * definition of it.
 *
 * These rules used to live inline in app/student/exams/[sessionId]/result/
 * student-result.tsx, which was fine while the printed Statement of Marks was
 * the only thing that graded. Issue #77 adds a results email that states the
 * same figures, and an email that says PASS beside a page that says FAIL is the
 * worst failure this feature can have — so both now import from here.
 *
 * The pass mark is a flat 40% of the paper. It is deliberately NOT read from
 * chapter_quiz.pass_pct: that column is the per-chapter assessment threshold and
 * has nothing to do with a sitting.
 */

/** Pass mark for an exam sitting, as a percentage of the paper's total marks. */
export const EXAM_PASS_PCT = 40;

/** Percentage scored, or null when the paper carries no marks (nothing to divide by). */
export function examPercentage(marks: number, maxMarks: number): number | null {
  return maxMarks > 0 ? (marks / maxMarks) * 100 : null;
}

/**
 * Letter grade for a percentage. Negative marking can push a percentage below
 * zero, which lands in the same bucket as zero — E.
 */
export function examGrade(percentage: number | null): string {
  if (percentage == null) return "—";
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "E";
}

/** True only for a known percentage at or above the pass mark. */
export function examPassed(percentage: number | null): boolean {
  return percentage != null && percentage >= EXAM_PASS_PCT;
}

/** The verdict as printed on the statement of marks. */
export function examVerdict(percentage: number | null): "PASS" | "FAIL" | "—" {
  if (percentage == null) return "—";
  return examPassed(percentage) ? "PASS" : "FAIL";
}
