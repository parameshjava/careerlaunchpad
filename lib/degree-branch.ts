/**
 * Degree → Branch: the ONE source of truth for how a degree constrains a branch
 * (issue #99). Deliberately dependency-free (no supabase, no next/*) so the exact
 * same functions run in the student form, the mentor form, the registration API,
 * the mentor API, the Excel intake and the admin catalogue — per CLAUDE.md's
 * "API design first" rule, the form can't drift from what the server accepts.
 *
 * The relation is (degree, branch), not `branch.degree_id`: "Computer Science"
 * under B.Sc, "Computer Science & Engineering (CSE)" under B.Tech and "Computer
 * Engineering (CME)" under Diploma are three different things, while Data Science
 * / AI&ML / Biotechnology legitimately appear under several degrees. See
 * supabase/migrations/161_degree_branch_map.sql for the schema and the seed.
 */

/** A row of ref_degree, enriched with the #99 columns. */
export type DegreeRow = {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  sort_order: number;
  /** 'none' = the degree has no branch at all; the field is not rendered and
   * `branch` is stored as null. 'optional' = shown without a required marker. */
  branch_mode: BranchMode;
  level: "diploma" | "ug" | "pg" | null;
  duration_years: number | null;
  search_terms: string[];
};

export type BranchMode = "required" | "optional" | "none";

/** A row of ref_branch, enriched with the #99 columns. */
export type BranchRow = {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  sort_order: number;
  /** Coarse bucket for mentor matching + analytics. See migration 161. */
  family: string | null;
  search_terms: string[];
};

/** One (degree, branch) pair from ref_degree_branch. */
export type DegreeBranchRow = {
  degree_slug: string;
  branch_slug: string;
  sort_order: number;
  group_label: string | null;
};

/** A branch offered under a specific degree — a BranchRow plus the per-degree
 * ordering and group heading from the mapping row. */
export type OfferedBranch = BranchRow & { group_label: string | null };

/** The write-in escape hatch. Selecting it reveals a free-text field whose value
 * lands in student_profile.branch_other / degree_other, which is what feeds the
 * admin screen's "Other answers" inbox — without it the actual answer is lost,
 * which is exactly what happened to every non-engineering student before #99. */
export const OTHER_SLUG = "other";

export const findDegree = (slug: string, degrees: DegreeRow[]): DegreeRow | null =>
  degrees.find((d) => d.slug === slug) ?? null;

/**
 * How the Branch field should behave for `degreeSlug`. An UNKNOWN or unset degree
 * yields 'required' rather than 'none' so a mis-seeded row can never make the
 * field silently vanish — the caller decides whether to disable it (no degree
 * chosen yet) or render it.
 */
export function branchModeOf(degreeSlug: string, degrees: DegreeRow[]): BranchMode {
  return findDegree(degreeSlug, degrees)?.branch_mode ?? "required";
}

/** True when the Branch field should be rendered at all. */
export const degreeHasBranch = (degreeSlug: string, degrees: DegreeRow[]): boolean =>
  branchModeOf(degreeSlug, degrees) !== "none";

/**
 * The branches offered under `degreeSlug`, in the order the student should see
 * them: mapping sort_order first, then ref_branch.sort_order as a tiebreak, then
 * label. Returns [] for an unmapped degree — the caller shows "no options" rather
 * than falling back to the full list, which is the bug #99 exists to fix.
 */
export function branchesForDegree(
  degreeSlug: string,
  branches: BranchRow[],
  map: DegreeBranchRow[],
): OfferedBranch[] {
  if (!degreeSlug) return [];
  const bySlug = new Map(branches.map((b) => [b.slug, b]));
  return map
    .filter((m) => m.degree_slug === degreeSlug && bySlug.has(m.branch_slug))
    .map((m) => ({ ...bySlug.get(m.branch_slug)!, group_label: m.group_label, _ord: m.sort_order }))
    .sort((a, b) => a._ord - b._ord || a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map(({ _ord, ...row }) => row);
}

/** True if `branchSlug` is offered under `degreeSlug`. The single predicate every
 * validator (student PATCH, mentor PATCH, Excel import) calls. */
export const isPairAllowed = (degreeSlug: string, branchSlug: string, map: DegreeBranchRow[]): boolean =>
  map.some((m) => m.degree_slug === degreeSlug && m.branch_slug === branchSlug);

// ---------------------------------------------------------------------------
// The cross-field rule (shared by every write path)
// ---------------------------------------------------------------------------
/** Free-text "Other" write-ins are capped so a direct API call can't stuff the
 * column; the inputs enforce the same maxLength. */
export const OTHER_TEXT_MAX = 120;

/**
 * Reconcile degree + branch for a PARTIAL save, and produce the extra columns to
 * write. Shared by lib/registration.ts, lib/mentor-registration.ts and the Excel
 * intake so the student form, the mentor form and a bulk import can't disagree
 * about what a legal pair is.
 *
 * `provided` is what the request actually sent (a PATCH of just `{degree}` must
 * still be able to invalidate the STORED branch), `stored` is the row on disk.
 *
 * The four rules, in the order they fire:
 *   1. degree has branch_mode 'none'  → branch := null, SILENTLY. Not an error:
 *      a stale value from an old draft must never block a save, and the student
 *      never saw a Branch field to get wrong.
 *   2. branch set, no degree anywhere → error. The one case we must ask about,
 *      since there is nothing to validate the branch against.
 *   3. pair not in the mapping and the branch came from STORAGE (this request did
 *      not send one) → branch := null, silently. That's "I switched B.Tech → B.Com",
 *      or a stored inconsistency the caller can't see — never their fault to fix.
 *   4. pair not in the mapping and the branch was SENT → error. Someone (or some
 *      script) explicitly asked for an impossible combination.
 * Plus: `*_other` free text is kept only while its field is actually on 'other',
 * so switching away from Other doesn't leave an orphaned write-in behind.
 */
export function resolveBranchPair(opts: {
  provided: Record<string, unknown>;
  clean: Record<string, unknown>;
  stored?: { degree?: string | null; branch?: string | null } | null;
  branchModes: Map<string, BranchMode>;
  pairs: DegreeBranchRow[];
}): { patch: Record<string, unknown>; errors: string[] } {
  const { provided, clean, stored, branchModes, pairs } = opts;
  const patch: Record<string, unknown> = {};
  const errors: string[] = [];

  const degreeSent = "degree" in provided;
  const branchSent = "branch" in provided;
  const otherSent = "degree_other" in provided || "branch_other" in provided;
  // Nothing about the pair is in play, and nothing stored can be affected.
  //
  // `otherSent` has to be part of this test. A PATCH of just `{degree_other: "..."}`
  // passes the STEP_FIELDS gate, so returning here stored a write-in against a
  // student whose degree is a real catalogued value — and the "Other answers" inbox
  // would then resolve it by overwriting that student's actual degree.
  if (!degreeSent && !branchSent && !otherSent) return { patch, errors };

  const asSlug = (v: unknown) => (typeof v === "string" && v ? v : null);
  const degree = degreeSent ? asSlug(clean.degree) : asSlug(stored?.degree);
  const submitted = branchSent ? asSlug(clean.branch) : asSlug(stored?.branch);
  let branch = submitted;

  if (degree && branchModes.get(degree) === "none") {
    branch = null;                                  // rule 1
  } else if (branch && !degree) {
    errors.push("Choose your degree before selecting a branch.");   // rule 2
  } else if (branch && degree && !isPairAllowed(degree, branch, pairs)) {
    // Rule 3 keys off "the branch came from STORAGE", nothing more. Also requiring
    // `degreeSent` meant a request that touched neither field — a lone `{branch_other}`,
    // now that those reach here — got rule 4 and was REJECTED over a stored
    // inconsistency the caller never touched and cannot see.
    if (!branchSent) branch = null;                 // rule 3
    else errors.push("That branch isn't offered for the selected degree.");  // rule 4
  }

  // Only write `branch` when a rule CHANGED it. A payload that sent a valid
  // branch already has it in `clean`; one that never mentioned branch must not
  // have the column rewritten just because another field moved.
  if (branch !== submitted) patch.branch = branch;

  // "Other" write-ins survive only while their field is actually on 'other'.
  if ((degreeSent || "degree_other" in provided) && degree !== OTHER_SLUG) patch.degree_other = null;
  if ((branchSent || "branch_other" in provided) && branch !== OTHER_SLUG) patch.branch_other = null;

  return { patch, errors };
}

// ---------------------------------------------------------------------------
// Year of study
// ---------------------------------------------------------------------------
/**
 * Year-of-study options a student on `degreeSlug` can honestly pick. The flat
 * ref_year_of_study list offers 4th Year to everyone, so a 3-year B.Sc/B.Com/
 * Diploma student could claim a year they don't have; ref_degree.duration_years
 * (seeded in 161) makes the list derivable instead.
 *
 * Only the numbered `year_N` slugs are filtered — `final_year` and `passed_out`
 * apply to every degree, and an unknown degree/duration shows the full list
 * (never fewer options than before this change).
 */
export function yearsForDegree<T extends { slug: string }>(
  degreeSlug: string,
  degrees: DegreeRow[],
  years: T[],
): T[] {
  const duration = findDegree(degreeSlug, degrees)?.duration_years;
  if (!duration) return years;
  const maxYear = Math.ceil(duration);
  return years.filter((y) => {
    const n = /^year_(\d+)$/.exec(y.slug);
    return !n || Number(n[1]) <= maxYear;
  });
}

// ---------------------------------------------------------------------------
// Grouping for the dropdowns
// ---------------------------------------------------------------------------
/** Sentinel bucket for options with no group. */
const UNGROUPED = "\uffff";

/**
 * Reorder so every option group is CONTIGUOUS, without hard-coding the group
 * names. A dropdown emits one sticky heading per group change, so an interleaved
 * list ("UG, PG, UG, PG…") repeats headings and reads as broken — which is exactly
 * what ref_degree's sort_order produces today, since the 7 degrees added in
 * migration 161 sort after the 12 from 010 rather than beside their peers.
 *
 * Group order is FIRST APPEARANCE in `rows`, and rows keep their incoming order
 * within a group — so the caller's ordering stays authoritative and this only
 * gathers, never re-sorts.
 *
 * First appearance, NOT each group's lowest sort_order: branchesForDegree() has
 * already applied the per-degree order, while a row's own `sort_order` is a GLOBAL
 * fallback with nothing to do with it. Ranking by min sort_order sent B.Sc's
 * "Single major" block ahead of "Common combinations" purely because it contains
 * `aiml` (global sort 3) — putting the 2025-26 majors above the combinations most
 * current students actually need.
 */
export function groupContiguously<T>(rows: T[], groupOf: (row: T) => string | null): T[] {
  const rank = new Map<string, number>();
  for (const row of rows) {
    const key = groupOf(row) ?? UNGROUPED;
    if (!rank.has(key)) rank.set(key, rank.size);
  }
  // Array.prototype.sort is stable, so equal-group rows keep their incoming order.
  return [...rows].sort((a, b) => {
    const ka = groupOf(a) ?? UNGROUPED;
    const kb = groupOf(b) ?? UNGROUPED;
    return ka === kb ? 0 : (rank.get(ka) ?? 0) - (rank.get(kb) ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Year of study: stored as an ANCHOR, derived on read
// ---------------------------------------------------------------------------
/**
 * Month the academic year starts (1-based). AP/TS run ~June–May.
 *
 * POLICY, NOT PHYSICS: this same 6 appears in the one-time backfill in migration
 * 162. If the policy changes, both must change — that one is historical, this one is
 * live. (The repo already accepts this kind of documented duplication for the navbar
 * clamp() values; see CLAUDE.md.)
 */
export const ACADEMIC_YEAR_START_MONTH = 6;

/** The academic year containing `now`, named by the calendar year it ENDS in. */
export function academicYearEnd(now = new Date()): number {
  return now.getFullYear() + (now.getMonth() + 1 >= ACADEMIC_YEAR_START_MONTH ? 1 : 0);
}

/**
 * `year_of_study` slug → its ordinal. 'final_year' resolves to the degree's
 * duration; 'passed_out' returns null, because a graduate has no current year.
 */
export function yearNumberOf(slug: string, durationYears: number | null): number | null {
  if (slug === "final_year") return durationYears ? Math.ceil(durationYears) : null;
  const m = /^year_(\d+)$/.exec(slug);
  return m ? Number(m[1]) : null;
}

/** Ordinal → slug. Past the degree's length is 'passed_out'; the last year is
 * 'final_year', which students recognise better than "4th Year". */
export function slugForYearNumber(n: number, durationYears: number | null): string {
  const max = durationYears ? Math.ceil(durationYears) : null;
  if (max && n > max) return "passed_out";
  if (max && n === max) return "final_year";
  return `year_${Math.max(1, n)}`;
}

/**
 * ANCHOR from an answer — the capture half of the pair. A student who says "3rd
 * Year" during the academic year ending 2027 started in 2024, and that integer never
 * needs touching again.
 *
 * Returns null when the answer can't be anchored ('passed_out', or a degree with no
 * known duration), which is the signal to keep storing the raw slug.
 */
export function anchorFromAnswer(slug: string, durationYears: number | null, now = new Date()): number | null {
  if (!slug || slug === "passed_out") return null;
  const n = yearNumberOf(slug, durationYears);
  return n == null ? null : academicYearEnd(now) - n;
}

/**
 * DERIVE the current year — the read half. Mirror image of anchorFromAnswer, so
 * answer → anchor → answer is IDEMPOTENT: a student who reopens the form next July
 * sees the derived "4th Year", and saving it re-anchors to the same integer. That
 * property is what makes it safe to show a derived value in an editable field.
 *
 * Falls back to `storedSlug` whenever derivation is impossible — no anchor, no
 * degree, or a degree with no duration — so nothing regresses for a passed-out
 * student or for degree 'other'.
 */
export function currentYearOfStudy(
  entryAcademicYear: number | null | undefined,
  storedSlug: string | null | undefined,
  durationYears: number | null,
  now = new Date(),
): string | null {
  if (entryAcademicYear == null || !durationYears) return storedSlug ?? null;
  const n = academicYearEnd(now) - entryAcademicYear;
  // Anchored in the future (a mis-keyed year, or a student who hasn't started):
  // trust what they typed rather than inventing "year 0".
  if (n < 1) return storedSlug ?? null;
  return slugForYearNumber(n, durationYears);
}

/** The graduation year implied by the anchor. Auto-fills the field but never
 * overwrites a student's own answer — a value that disagrees is MEANINGFUL, flagging
 * a repeat, a gap year or a transfer rather than reading as a typo. */
export function graduationYearFrom(
  entryAcademicYear: number | null | undefined,
  durationYears: number | null,
): number | null {
  if (entryAcademicYear == null || !durationYears) return null;
  return entryAcademicYear + Math.ceil(durationYears);
}

/**
 * What an AUTO-FILLED graduation year should become when the answer moves — the
 * client-side mirror of stamp_entry_academic_year()'s tracking rule (migration 162).
 *
 * Returns the new value, or null to LEAVE THE FIELD ALONE. It only ever moves a value
 * that is empty or still equal to what the previous answer implied; anything else the
 * student typed themselves, and a graduation year that disagrees with the derivation is
 * meaningful (a repeat, a gap year, lateral entry) rather than a stale number.
 *
 * This exists because the two sides had drifted: the DB retracked an auto-filled value
 * but the form only filled a blank one, so changing "3rd Year" to "4th Year" left a
 * visibly stale 2028 on screen that the server then silently corrected to 2027 on save.
 */
export function retrackedGraduationYear(opts: {
  /** The field's current value, as the form holds it (a string). */
  current: string;
  prevYearSlug: string;
  prevDuration: number | null;
  nextYearSlug: string;
  nextDuration: number | null;
  now?: Date;
}): string | null {
  const { current, prevYearSlug, prevDuration, nextYearSlug, nextDuration, now } = opts;
  const next = graduationYearFrom(anchorFromAnswer(nextYearSlug, nextDuration, now), nextDuration);
  if (next == null) return null;                       // can't derive one — leave it
  if (!current.trim()) return String(next);            // blank: fill it
  const prevAuto = graduationYearFrom(anchorFromAnswer(prevYearSlug, prevDuration, now), prevDuration);
  // Hand-typed (or from a degree we can no longer derive): the student's value wins.
  if (prevAuto == null || Number(current) !== prevAuto) return null;
  return String(next);
}

/** Convenience for the read paths that hold the whole degree list. */
export function durationOf(degreeSlug: string | null | undefined, degrees: Pick<DegreeRow, "slug" | "duration_years">[]) {
  return degrees.find((d) => d.slug === degreeSlug)?.duration_years ?? null;
}

/**
 * Resolve what a human typed in a "Year" box to something matchable. The enrolment
 * screen's filter is a free-text input (placeholder "Year (e.g. 4th)"), so it sends
 * "4", "4th", "3rd year" or "final" — never the internal `year_4` slug.
 *
 * Returns `{ n }` for a numbered year, `{ slug }` for the two relative answers, or
 * null when nothing sensible was typed (the caller then applies no year filter, which
 * is the safe reading — better than a filter that silently matches nothing).
 */
export function parseYearInput(raw: string): { n?: number; slug?: "final_year" | "passed_out" } | null {
  const q = normalizeSearch(raw);
  if (!q) return null;
  if (/^(final|final year|finalyear|last|last year)$/.test(q)) return { slug: "final_year" };
  if (/^(passed|passed out|passedout|alumni|graduated|completed)$/.test(q)) return { slug: "passed_out" };
  // "4", "4th", "4th year", "year 4", "year_4" — take the first number present.
  const m = /(\d+)/.exec(q);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) return { n };
  }
  return null;
}

/**
 * Distinct programme lengths, each with the degree slugs that have it. The enrolment
 * filter needs this because "final year" is not one anchor: a student is in their final
 * year when `ayEnd(now) − entry === ceil(duration)`, and duration varies by degree. So
 * the filter is built per length and OR'd together.
 */
export function degreesByDuration(
  degrees: Pick<DegreeRow, "slug" | "duration_years">[],
): { duration: number; slugs: string[] }[] {
  const byLen = new Map<number, string[]>();
  for (const d of degrees) {
    if (!d.duration_years) continue;
    const len = Math.ceil(d.duration_years);
    byLen.set(len, [...(byLen.get(len) ?? []), d.slug]);
  }
  return [...byLen.entries()].map(([duration, slugs]) => ({ duration, slugs }));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
/**
 * Fold a label or query down to what students actually type: lower-cased, accents
 * stripped, and every separator (dots, ampersands, slashes, hyphens) collapsed to
 * a single space. So "E.C.E" matches "ECE", "comp-sci" matches "Comp Sci", and
 * "B.Tech" matches "btech".
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Does `option` match `query`? Matches the label OR any seeded alias
 * (`search_terms`), and requires every whitespace-separated token of the query to
 * appear somewhere — so "comp sci" and "sci comp" both find Computer Science,
 * while "csc" finds CSE through its alias list.
 */
export function matchesQuery(
  option: { label: string; slug: string; search_terms?: string[] | null },
  query: string,
): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystacks = [
    normalizeSearch(option.label),
    normalizeSearch(option.slug),
    ...(option.search_terms ?? []).map(normalizeSearch),
  ];
  return q.split(" ").every((token) => haystacks.some((h) => h.includes(token)));
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
/**
 * The label to SHOW for a stored degree/branch slug, folding in the free-text
 * write-in: an "Other" pick reads as what the student actually typed, which is the
 * whole point of capturing it (#99). Falls back to the raw slug for a value whose
 * ref row has since been removed, so a profile never renders blank.
 */
export function labelWithOther(
  slug: string,
  other: string | null | undefined,
  labels: Map<string, string>,
): string {
  if (!slug) return "";
  const written = other?.trim();
  if (slug === OTHER_SLUG && written) return `${written} (other)`;
  return labels.get(slug) ?? slug;
}

/**
 * "B.Tech — Computer Science & Engineering (CSE)" from the stored slugs. The
 * admin grids used to join the raw slugs (`btech — cse`); with slugs like
 * `com_computers` / `plastics_polymers` / `mgmt_general` in play that stops being
 * a cosmetic wart, so every surface resolves labels through here. Falls back to
 * the slug itself for a value whose ref row was deactivated and pruned.
 */
export function courseLabel(
  degreeSlug: string | null,
  branchSlug: string | null,
  degrees: Pick<DegreeRow, "slug" | "label">[],
  branches: Pick<BranchRow, "slug" | "label">[],
  separator = " — ",
): string | null {
  const degree = degreeSlug ? (degrees.find((d) => d.slug === degreeSlug)?.label ?? degreeSlug) : null;
  const branch = branchSlug ? (branches.find((b) => b.slug === branchSlug)?.label ?? branchSlug) : null;
  return [degree, branch].filter(Boolean).join(separator) || null;
}
