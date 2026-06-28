// Exam paper generation engine (docs/EXAM_MODULE_SPEC.md §5.2). Pure planning
// (chapter × difficulty target matrix via largest-remainder rounding) plus DB-
// backed feasibility and seeded selection. Runs in TS on a user-scoped server
// client: the admin holds exam.question.manage / exam.paper.generate, so RLS lets
// them read the bank and write the manifest (references only — never content).
import type { SupabaseClient } from "@supabase/supabase-js";

import { DIFFICULTIES, type Blueprint, type Difficulty } from "@/lib/exam-query";

export type Cell = {
  sectionId: string;
  subjectId: string;
  chapterId: string;
  difficulty: Difficulty;
  count: number;
};

export type Shortfall = {
  subjectId: string;
  chapterId: string; // "" for a section-level shortfall (can't reach num_questions)
  difficulty: Difficulty | "all";
  required: number;
  available: number;
};

export type ManifestEntry = {
  questionId: string;
  questionVersion: number;
  sectionId: string;
  position: number;
};

// Integer allocation of `total` across `weights`, summing exactly to `total`
// (largest-remainder / Hamilton method). Used for both the per-chapter split and
// the per-difficulty split so section/chapter totals always reconcile.
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floor = raw.map(Math.floor);
  let remainder = total - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floor];
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    result[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  return result;
}

type SectionLike = {
  id: string;
  subjectId: string;
  numQuestions: number;
  pctEasy: number;
  pctMedium: number;
  pctHard: number;
  pctVeryHard: number;
  chapterQuota: { chapterId: string; pct: number }[];
};

// Build the chapter × difficulty target matrix for one section.
//
// Difficulty-FIRST allocation: split num_questions across the four difficulties
// once (so the section's difficulty mix is honoured exactly), then spread each
// difficulty's quota across chapters by weight (chapter quota, or equal weight
// when no quota is set). Allocating per-chapter-then-difficulty (the old order)
// let each chapter round its mix independently and drift the section-wide mix —
// e.g. 25/25/25/25 over 8 one-question chapters collapsed to all-easy. The user's
// requirement emphasises the difficulty percentages, so they win the rounding.
export function planSection(section: SectionLike, allChapterIds: string[]): Cell[] {
  const mix = [section.pctEasy, section.pctMedium, section.pctHard, section.pctVeryHard];

  const chapterIds = section.chapterQuota.length > 0
    ? section.chapterQuota.map((q) => q.chapterId)
    : allChapterIds;
  const chapterWeights = section.chapterQuota.length > 0
    ? section.chapterQuota.map((q) => q.pct)
    : allChapterIds.map(() => 1);

  if (chapterIds.length === 0) return []; // no chapters → no cells (flagged by checkFeasibility)

  const diffTotals = largestRemainder(section.numQuestions, mix); // [easy, medium, hard, very_hard]

  const cells: Cell[] = [];
  DIFFICULTIES.forEach((difficulty, di) => {
    if (diffTotals[di] <= 0) return;
    const perChapter = largestRemainder(diffTotals[di], chapterWeights);
    chapterIds.forEach((chapterId, ci) => {
      if (perChapter[ci] > 0) {
        cells.push({
          sectionId: section.id,
          subjectId: section.subjectId,
          chapterId,
          difficulty,
          count: perChapter[ci],
        });
      }
    });
  });
  return cells;
}

type Candidate = {
  id: string;
  chapter_id: string;
  difficulty: Difficulty;
  passage_id: string | null;
  version: number;
};

// Fetch active questions for every subject in the blueprint, plus the chapter
// list per subject (for the no-quota even spread). One round-trip each.
async function loadBank(supabase: SupabaseClient, blueprint: Blueprint) {
  const subjectIds = [...new Set(blueprint.sections.map((s) => s.subjectId))];
  const [{ data: qData, error: qErr }, { data: cData, error: cErr }] = await Promise.all([
    supabase
      .from("question")
      .select("id, subject_id, chapter_id, difficulty, passage_id, version")
      .in("subject_id", subjectIds)
      .eq("status", "active"),
    supabase.from("chapter").select("id, subject_id").in("subject_id", subjectIds),
  ]);
  if (qErr) throw new Error(`question: ${qErr.message}`);
  if (cErr) throw new Error(`chapter: ${cErr.message}`);

  const bySubject = new Map<string, Candidate[]>();
  for (const r of qData ?? []) {
    const c: Candidate = {
      id: r.id as string,
      chapter_id: r.chapter_id as string,
      difficulty: r.difficulty as Difficulty,
      passage_id: (r.passage_id as string | null) ?? null,
      version: r.version as number,
    };
    const key = r.subject_id as string;
    (bySubject.get(key) ?? bySubject.set(key, []).get(key)!).push(c);
  }
  const chaptersBySubject = new Map<string, string[]>();
  for (const r of cData ?? []) {
    const key = r.subject_id as string;
    (chaptersBySubject.get(key) ?? chaptersBySubject.set(key, []).get(key)!).push(r.id as string);
  }
  return { bySubject, chaptersBySubject };
}

function countAvailable(pool: Candidate[], chapterId: string, difficulty: Difficulty): number {
  return pool.filter((q) => q.chapter_id === chapterId && q.difficulty === difficulty).length;
}

// Report what the bank cannot satisfy for this blueprint. Empty array ⇒ the
// blueprint is generatable. Two kinds of shortfall:
//   • section-level: the plan can't even reach num_questions (e.g. the subject
//     has no chapters), so the paper would silently come up short — chapterId "".
//   • cell-level: a specific (chapter, difficulty) needs more questions than exist.
export async function checkFeasibility(
  supabase: SupabaseClient,
  blueprint: Blueprint,
): Promise<Shortfall[]> {
  const { bySubject, chaptersBySubject } = await loadBank(supabase, blueprint);
  const shortfalls: Shortfall[] = [];

  for (const section of blueprint.sections) {
    const cells = planSection(section, chaptersBySubject.get(section.subjectId) ?? []);
    const planned = cells.reduce((sum, c) => sum + c.count, 0);
    if (planned < section.numQuestions) {
      shortfalls.push({
        subjectId: section.subjectId,
        chapterId: "",
        difficulty: "all",
        required: section.numQuestions,
        available: planned,
      });
    }
    const pool = bySubject.get(section.subjectId) ?? [];
    for (const cell of cells) {
      const available = countAvailable(pool, cell.chapterId, cell.difficulty);
      if (available < cell.count) {
        shortfalls.push({
          subjectId: cell.subjectId,
          chapterId: cell.chapterId,
          difficulty: cell.difficulty,
          required: cell.count,
          available,
        });
      }
    }
  }
  return shortfalls;
}

// --- seeded PRNG (mulberry32) so generation is reproducible from a stored seed.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Select questions for the blueprint and return the ordered manifest. Throws if
// the bank can't satisfy a cell — callers should run checkFeasibility() first.
// Within a section, passage-bound questions are grouped together so a passage and
// its questions print/render as a block.
export async function generatePaper(
  supabase: SupabaseClient,
  blueprint: Blueprint,
  seed: number,
): Promise<ManifestEntry[]> {
  const { bySubject, chaptersBySubject } = await loadBank(supabase, blueprint);
  const rng = mulberry32(seed);

  // Pre-bucket the bank by (subject, chapter, difficulty) and shuffle each bucket
  // once. Cells consume from a shared bucket via a pointer, so a question is never
  // picked twice — even across two sections that draw the same subject (the source
  // of the duplicate-position bug) — and we avoid rescanning the pool per cell.
  const cellKey = (subjectId: string, chapterId: string, difficulty: Difficulty) =>
    `${subjectId}|${chapterId}|${difficulty}`;
  const buckets = new Map<string, { items: Candidate[]; ptr: number }>();
  for (const [subjectId, pool] of bySubject) {
    for (const q of pool) {
      const k = cellKey(subjectId, q.chapter_id, q.difficulty);
      let b = buckets.get(k);
      if (!b) {
        b = { items: [], ptr: 0 };
        buckets.set(k, b);
      }
      b.items.push(q);
    }
  }
  for (const b of buckets.values()) b.items = shuffle(b.items, rng);

  const entries: ManifestEntry[] = [];
  let position = 0;

  // Preserve section order from the blueprint.
  for (const section of [...blueprint.sections].sort((a, b) => a.position - b.position)) {
    const cells = planSection(section, chaptersBySubject.get(section.subjectId) ?? []);
    const picked: Candidate[] = [];

    for (const cell of cells) {
      const b = buckets.get(cellKey(cell.subjectId, cell.chapterId, cell.difficulty));
      const available = b ? b.items.length - b.ptr : 0;
      if (available < cell.count) {
        throw new Error(
          `Not enough questions for chapter ${cell.chapterId} / ${cell.difficulty}: need ${cell.count}, have ${available}`,
        );
      }
      for (let i = 0; i < cell.count; i++) picked.push(b!.items[b!.ptr++]);
    }

    // Keep passage-bound questions adjacent (passage block), then standalone;
    // optionally shuffle the order within the section (passage blocks stay intact).
    const ordered = groupByPassage(picked);
    const sectionQuestions = blueprint.shuffleQuestions ? shuffleGroups(ordered, rng) : ordered;

    for (const q of sectionQuestions) {
      entries.push({
        questionId: q.id,
        questionVersion: q.version,
        sectionId: section.id,
        position: position++,
      });
    }
  }

  return entries;
}

// Generate a paper for a session and persist it (exam_paper + exam_paper_question
// manifest — references only). Returns the new paper id. Throws if the bank can't
// satisfy the blueprint; the caller should surface that. A seed is stored so the
// exact paper can be re-derived for audit without storing question content.
export async function writePaper(
  supabase: SupabaseClient,
  sessionId: string,
  blueprint: Blueprint,
  seed: number,
): Promise<string> {
  const manifest = await generatePaper(supabase, blueprint, seed);

  const { data: paper, error: pErr } = await supabase
    .from("exam_paper")
    .insert({ session_id: sessionId, seed })
    .select("id")
    .single();
  if (pErr) throw new Error(`exam_paper: ${pErr.message}`);

  const { error: qErr } = await supabase.from("exam_paper_question").insert(
    manifest.map((m) => ({
      paper_id: paper.id,
      question_id: m.questionId,
      question_version: m.questionVersion,
      section_id: m.sectionId,
      position: m.position,
    })),
  );
  if (qErr) {
    await supabase.from("exam_paper").delete().eq("id", paper.id);
    throw new Error(`exam_paper_question: ${qErr.message}`);
  }
  return paper.id as string;
}

// Group questions so those sharing a passage stay together (passage block),
// followed by passage-less questions in their picked order.
function groupByPassage(questions: Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  const loose: Candidate[] = [];
  for (const q of questions) {
    if (q.passage_id) (groups.get(q.passage_id) ?? groups.set(q.passage_id, []).get(q.passage_id)!).push(q);
    else loose.push(q);
  }
  return [...[...groups.values()].flat(), ...loose];
}

// Shuffle while keeping passage blocks intact (shuffle the blocks, not within).
function shuffleGroups(questions: Candidate[], rng: () => number): Candidate[] {
  const blocks = new Map<string, Candidate[]>();
  const order: (Candidate | string)[] = [];
  for (const q of questions) {
    if (q.passage_id) {
      if (!blocks.has(q.passage_id)) {
        blocks.set(q.passage_id, []);
        order.push(q.passage_id);
      }
      blocks.get(q.passage_id)!.push(q);
    } else {
      order.push(q);
    }
  }
  return shuffle(order, rng).flatMap((o) => (typeof o === "string" ? blocks.get(o)! : [o]));
}
