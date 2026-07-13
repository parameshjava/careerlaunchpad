#!/usr/bin/env node
// Generator for Reasoning → Syllogism (200 Qs, ~50 per tier). Validity is decided
// by a model checker: 3 categories → 8 Venn regions → enumerate all 256 "worlds"
// (which regions are inhabited) and test each conclusion. An item is emitted only
// when its answer is IDENTICAL under modern (no existential import) and
// Aristotelian (categories non-empty) semantics — so the answer is convention-proof.
// Either/or (complementary) cases are skipped to keep a clean 4-option format.
// Output: reasoning-syllogism-01.json.  Run: node .../syllogism.gen.mjs
import { writeFileSync } from "node:fs";

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));

const NOUNS = ["books", "tables", "chairs", "flowers", "trees", "cars", "birds", "stones", "rivers", "toys", "cups", "boxes", "bags", "roads", "lamps", "doors", "hills", "pens", "fans", "cats"];
const bit = (r, i) => (r >> i) & 1;
const REGIONS = [0, 1, 2, 3, 4, 5, 6, 7];

// statement over sets a,b within a world (bitmask of inhabited regions 0..7)
function holds(st, world) {
  const inhab = REGIONS.filter((r) => (world >> r) & 1);
  const { t, a, b } = st;
  if (t === "all") return inhab.every((r) => !bit(r, a) || bit(r, b));
  if (t === "no") return inhab.every((r) => !(bit(r, a) && bit(r, b)));
  if (t === "some") return inhab.some((r) => bit(r, a) && bit(r, b));
  if (t === "somenot") return inhab.some((r) => bit(r, a) && !bit(r, b));
}
const catNonEmpty = (world, i) => REGIONS.some((r) => ((world >> r) & 1) && bit(r, i));

function worlds(existential) {
  const out = [];
  for (let w = 0; w < 256; w++) {
    if (existential && !(catNonEmpty(w, 0) && catNonEmpty(w, 1) && catNonEmpty(w, 2))) continue;
    out.push(w);
  }
  return out;
}
const MODERN = worlds(false), ARIS = worlds(true);

function analyse(prems, concl, universe) {
  const models = universe.filter((w) => prems.every((p) => holds(p, w)));
  if (models.length === 0) return { sat: false, follows: false };
  return { sat: true, follows: models.every((w) => holds(concl, w)) };
}
// convention-proof status: "yes" / "no" / null(ambiguous or unsat)
function status(prems, concl) {
  const m = analyse(prems, concl, MODERN), a = analyse(prems, concl, ARIS);
  if (!m.sat || !a.sat) return null;
  if (m.follows && a.follows) return "yes";
  if (!m.follows && !a.follows) return "no";
  return null;
}
function orAlwaysHolds(prems, c1, c2) {
  const models = MODERN.filter((w) => prems.every((p) => holds(p, w)));
  return models.length > 0 && models.every((w) => holds(c1, w) || holds(c2, w));
}

const say = (st, X, Y, Z) => {
  const nm = [X, Y, Z];
  const A = nm[st.a], B = nm[st.b];
  if (st.t === "all") return `All ${A} are ${B}`;
  if (st.t === "no") return `No ${A} are ${B}`;
  if (st.t === "some") return `Some ${A} are ${B}`;
  return `Some ${A} are not ${B}`;
};
const TYPES = ["all", "no", "some", "somenot"];

function difficulty(prems, concls) {
  const someCount = prems.filter((p) => p.t === "some" || p.t === "somenot").length;
  const hasNot = prems.some((p) => p.t === "somenot");
  if (someCount === 0) return concls.every((c) => c.t === "all" || c.t === "no") ? "easy" : "medium";
  if (someCount === 2) return "very_hard";
  return hasNot ? "hard" : "medium";
}

function makeItem() {
  // premises: link (X,Y) and (Y,Z). conclusions about (X,Z)/(Z,X).
  const p1 = { t: TYPES[ri(0, 3)], a: 0, b: 1 };
  const p2 = { t: TYPES[ri(0, 3)], a: 1, b: 2 };
  const c1 = { t: TYPES[ri(0, 3)], a: 0, b: 2 };
  const c2 = { t: TYPES[ri(0, 3)], a: 2, b: 0 };
  const prems = [p1, p2];
  const s1 = status(prems, c1), s2 = status(prems, c2);
  if (s1 === null || s2 === null) return null;
  if (s1 === "no" && s2 === "no" && orAlwaysHolds(prems, c1, c2)) return null; // either/or — skip
  const I = s1 === "yes", II = s2 === "yes";
  const answer = I && II ? "Both I and II follow" : I ? "Only conclusion I follows" : II ? "Only conclusion II follows" : "Neither I nor II follows";

  const idx = [];
  while (idx.length < 3) { const n = ri(0, NOUNS.length - 1); if (!idx.includes(n)) idx.push(n); }
  const [X, Y, Z] = idx.map((i) => NOUNS[i]);
  const stem = `Statements (treat as true even if they seem to contradict common facts): 1) ${say(p1, X, Y, Z)}. 2) ${say(p2, X, Y, Z)}. Conclusions: I) ${say(c1, X, Y, Z)}. II) ${say(c2, X, Y, Z)}. Which conclusion(s) logically follow?`;
  const options = ["Only conclusion I follows", "Only conclusion II follows", "Both I and II follow", "Neither I nor II follows"].map((v) => ({ label: v, is_correct: v === answer }));
  const q = { chapter: "Syllogism", kind: "standard", difficulty: difficulty(prems, [c1, c2]), answer_type: "single", stem, explanation: `Testing every possible case: conclusion I ${I ? "must be true" : "can fail"} and conclusion II ${II ? "must be true" : "can fail"} whenever both statements hold — so ${answer.toLowerCase()}.`, options };
  if (options.filter((o) => o.is_correct).length !== 1) throw new Error("correct!=1");
  return q;
}

const PER_LEVEL = 50;
const questions = [];
const seen = new Set();
const counts = { easy: 0, medium: 0, hard: 0, very_hard: 0 };
let tries = 0;
while (Object.values(counts).some((c) => c < PER_LEVEL) && tries < 2_000_000) {
  tries++;
  const q = makeItem();
  if (!q || counts[q.difficulty] >= PER_LEVEL || seen.has(q.stem)) continue;
  seen.add(q.stem); counts[q.difficulty]++; questions.push(q);
}
for (const [lvl, c] of Object.entries(counts)) if (c < PER_LEVEL) throw new Error(`only ${c} ${lvl}`);
const path = new URL("../reasoning-syllogism-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Reasoning", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} questions to ${path}  ${JSON.stringify(counts)}`);
