// Shared helpers for Arithmetic question generators.
// Each chapter generator defines sub-type functions (distinct problem STRUCTURES)
// per difficulty tier; run() loops them to `perLevel` unique stems per tier, builds
// MCQs with computed answers + plausible numeric distractors, self-asserts each
// (4 distinct options, exactly one correct), and writes the import JSON.
import { writeFileSync } from "node:fs";

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (v, unit) => {
  const s = Number.isInteger(v) ? String(v) : String(round2(v));
  return unit ? `${unit.pre ?? ""}${s}${unit.post ?? ""}` : s;
};

// Three distinct, plausible wrong numbers near `answer`.
function distractors(answer, R) {
  const abs = Math.abs(answer) || 1;
  const step = abs >= 200 ? Math.max(1, Math.round(abs * 0.04)) : abs >= 40 ? 2 : 1;
  const isInt = Number.isInteger(answer);
  const cands = [answer + step, answer - step, answer + 2 * step, answer - 2 * step, answer + 1, answer - 1, round2(answer * 1.1), round2(answer * 0.9), answer + 3 * step];
  const out = [];
  for (let c of cands) {
    if (isInt) c = Math.round(c);
    if (c !== answer && c > 0 && !out.includes(c)) out.push(c);
    if (out.length === 3) break;
  }
  let b = answer + 4 * step + 1;
  while (out.length < 3) { const c = isInt ? Math.round(b) : round2(b); if (c !== answer && c > 0 && !out.includes(c)) out.push(c); b += step; }
  return out;
}

// Build one MCQ; returns null if option labels collide (caller retries).
export function mcq(R, { chapter, difficulty, stem, answer, explanation, unit }) {
  const ds = distractors(answer, R);
  const vals = [answer, ...ds];
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  const options = vals.map((v) => ({ label: fmt(v, unit), is_correct: v === answer }));
  const labels = new Set(options.map((o) => o.label));
  if (labels.size !== 4) return null;
  if (options.filter((o) => o.is_correct).length !== 1) return null;
  return { chapter, kind: "standard", difficulty, answer_type: "single", stem, explanation, options };
}

// subtypes: { easy:[fn(ri,R)->{stem,answer,explanation,unit?}], medium:[...], hard:[...], very_hard:[...] }
export function run({ subject, chapter, file, subtypes, perLevel = 50, seed = 20260713 }) {
  const R = rng(seed);
  const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const questions = [];
  const seen = new Set(); // global: import validator forbids duplicate stems across the file
  for (const level of ["easy", "medium", "hard", "very_hard"]) {
    const fns = subtypes[level];
    let added = 0, tries = 0;
    while (added < perLevel && tries < 200000) {
      tries++;
      let spec;
      try { spec = fns[Math.floor(R() * fns.length)](ri, R); } catch { continue; }
      if (!spec) continue;
      const q = mcq(R, { chapter, difficulty: level, ...spec });
      if (!q || seen.has(q.stem)) continue;
      seen.add(q.stem); questions.push(q); added++;
    }
    if (added < perLevel) throw new Error(`${chapter}: only ${added} unique ${level}`);
  }
  const path = new URL(`../${file}`, import.meta.url).pathname;
  writeFileSync(path, JSON.stringify({ subject, questions }, null, 2) + "\n");
  console.log(`wrote ${questions.length} to ${file}`);
}
