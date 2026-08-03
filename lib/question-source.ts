// Question provenance, rendered for students (issue #87).
//
// A bank question carries two nullable fields (migration 145): `source` — a
// free-text label for the paper it was asked in — and `source_year`. Because the
// label is hand-entered by staff and also arrives from the past-paper importers,
// the two overlap inconsistently in real data:
//
//   ("TS ICET", 2024)                              → year is NOT in the label
//   ("AP ICET 2026 2nd May 2026 Shift 1", 2026)    → year IS in the label (twice)
//   ("ICET 2019 - Slot 2", 2019)                   → year IS in the label
//
// So the year is appended only when the label doesn't already state it —
// otherwise every ICET paper would read "… 2026 Shift 1 (2026)". Everything
// student-facing (both runners and the printed answer key) formats through here,
// so one bank of labels reads the same everywhere.
export type QuestionSource = {
  source?: string | null;
  sourceYear?: number | null;
};

/** "Asked in" label for one question, or null when it has no recorded source. */
export function formatQuestionSource(
  source?: string | null,
  sourceYear?: number | null,
): string | null {
  const label = source?.trim();
  if (!label) return null; // a year alone isn't a provenance a student can trust
  if (sourceYear == null) return label;
  // \b won't do: labels like "ICET-2019" and "2019)" must both count as stating it.
  return label.includes(String(sourceYear)) ? label : `${label} ${sourceYear}`;
}

export type SourceSummary = {
  /** Questions with a recorded source. */
  sourced: number;
  total: number;
  /** Distinct formatted labels, in first-appearance (paper) order. */
  labels: string[];
  /** Distinct years, ascending — from source_year, else parsed out of the label. */
  years: number[];
};

/** Paper-level provenance: how much of this paper came from real past papers. */
export function summarizeQuestionSources(items: QuestionSource[]): SourceSummary {
  const labels: string[] = [];
  const seen = new Set<string>();
  const years = new Set<number>();
  let sourced = 0;

  for (const it of items) {
    const label = formatQuestionSource(it.source, it.sourceYear);
    if (!label) continue;
    sourced += 1;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
    // Prefer the explicit year; fall back to the first plausible year in the label
    // so ("ICET 2019 - Slot 2", null) still contributes to the range.
    const year = it.sourceYear ?? Number(label.match(/\b(19|20)\d{2}\b/)?.[0]);
    if (year) years.add(year);
  }

  return { sourced, total: items.length, labels, years: [...years].sort((a, b) => a - b) };
}

/**
 * One-line description of the papers a summary covers — "TS ICET 2024",
 * "TS ICET 2023 · TS ICET 2024", or "6 past papers, 2023–2026" once naming them
 * all would be longer than a student wants to read. Null when nothing is sourced.
 */
export function describeSourceSummary(s: SourceSummary): string | null {
  if (s.sourced === 0) return null;
  if (s.labels.length <= 3) return s.labels.join(" · ");
  const [first] = s.years;
  const last = s.years[s.years.length - 1];
  const span = s.years.length === 0 ? "" : first === last ? `, ${first}` : `, ${first}–${last}`;
  return `${s.labels.length} past papers${span}`;
}
