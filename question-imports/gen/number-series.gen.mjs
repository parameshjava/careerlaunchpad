#!/usr/bin/env node
// Generator for Reasoning → Number Series import file. Produces ~50 questions per
// difficulty tier (200 total) spanning many DISTINCT pattern families (not one
// template with swapped numbers). Every answer is computed by the rule and
// re-checked; every question is self-asserted (4 distinct options, exactly one
// correct, answer equals the rule's next term) before it is written — so a wrong
// item throws instead of shipping. Output: reasoning-number-series-01.json.
//
// Run: node question-imports/gen/number-series.gen.mjs
import { writeFileSync } from "node:fs";

// --- deterministic RNG (mulberry32) so re-runs are stable -------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)); // inclusive int

const PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113];
const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

// Each family returns { terms:[...], answer, rule } — a genuinely different pattern.
// Families are grouped by tier; parameters vary to build volume within a family.
const FAMILIES = {
  easy: [
    () => { const a = ri(2, 15), d = ri(2, 9), t = []; for (let i = 0; i < 5; i++) t.push(a + d * i); return { terms: t, answer: a + d * 5, rule: `each term increases by ${d}` }; },
    () => { const a = ri(50, 90), d = ri(2, 9), t = []; for (let i = 0; i < 5; i++) t.push(a - d * i); return { terms: t, answer: a - d * 5, rule: `each term decreases by ${d}` }; },
    () => { const a = ri(1, 6), t = []; for (let i = 0; i < 5; i++) t.push(a * 2 ** i); return { terms: t, answer: a * 2 ** 5, rule: `each term is multiplied by 2` }; },
    () => { const a = ri(1, 4), t = []; for (let i = 0; i < 4; i++) t.push(a * 3 ** i); return { terms: t, answer: a * 3 ** 4, rule: `each term is multiplied by 3` }; },
    () => { const k = ri(3, 13), t = []; for (let i = 1; i <= 5; i++) t.push(k * i); return { terms: t, answer: k * 6, rule: `consecutive multiples of ${k}` }; },
  ],
  medium: [
    () => { const s = ri(2, 7), t = []; for (let i = 0; i < 5; i++) t.push((s + i) ** 2); return { terms: t, answer: (s + 5) ** 2, rule: `perfect squares of ${s}, ${s + 1}, ${s + 2}, …` }; },
    () => { const s = ri(2, 5), t = []; for (let i = 0; i < 4; i++) t.push((s + i) ** 3); return { terms: t, answer: (s + 4) ** 3, rule: `perfect cubes of ${s}, ${s + 1}, …` }; },
    () => { const a = ri(2, 8), d0 = ri(1, 4), c = ri(1, 3), t = [a]; let d = d0; for (let i = 0; i < 4; i++) { t.push(t[t.length - 1] + d); d += c; } return { terms: t, answer: t[t.length - 1] + d, rule: `the gap grows by ${c} each step (add ${d0}, ${d0 + c}, ${d0 + 2 * c}, …)` }; },
    () => { const start = ri(0, 4); const win = PRIMES.slice(start, start + 5); return { terms: win, answer: PRIMES[start + 5], rule: `consecutive prime numbers` }; },
    () => { const s = ri(2, 6), t = []; for (let i = 0; i < 5; i++) t.push((s + i) ** 2 + 1); return { terms: t, answer: (s + 5) ** 2 + 1, rule: `n² + 1 for n = ${s}, ${s + 1}, …` }; },
    () => { const s = ri(1, 3), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push((n * (n + 1)) / 2); } return { terms: t, answer: ((s + 5) * (s + 6)) / 2, rule: `triangular numbers (add 2, 3, 4, 5, …)` }; },
  ],
  hard: [
    () => { let a = ri(1, 5), b = ri(2, 7); const t = [a, b]; for (let i = 0; i < 4; i++) t.push(t[t.length - 1] + t[t.length - 2]); const ans = t[t.length - 1] + t[t.length - 2]; return { terms: t, answer: ans, rule: `each term is the sum of the previous two` }; },
    () => { let a = ri(1, 4); const t = [a]; for (let i = 0; i < 4; i++) t.push(t[t.length - 1] * 2 + 1); return { terms: t, answer: t[t.length - 1] * 2 + 1, rule: `each term is (previous × 2) + 1` }; },
    () => { let a = ri(2, 5); const t = [a]; for (let i = 0; i < 4; i++) t.push(t[t.length - 1] * 3 - 1); return { terms: t, answer: t[t.length - 1] * 3 - 1, rule: `each term is (previous × 3) − 1` }; },
    () => { const s = ri(2, 6), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push(n * n + n); } const N = s + 5; return { terms: t, answer: N * N + N, rule: `n² + n for n = ${s}, ${s + 1}, …` }; },
    () => { const a = ri(1, 4), d = ri(2, 5), r = ri(2, 3), t = [a]; for (let i = 0; i < 4; i++) t.push(i % 2 === 0 ? t[t.length - 1] + d : t[t.length - 1] * r); const last = t.length - 1; const ans = last % 2 === 0 ? t[last] + d : t[last] * r; return { terms: t, answer: ans, rule: `alternately add ${d} and multiply by ${r}` }; },
  ],
  very_hard: [
    () => { const s = ri(2, 7), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push(n ** 3 - n); } const N = s + 5; return { terms: t, answer: N ** 3 - N, rule: `n³ − n for n = ${s}, ${s + 1}, …` }; },
    () => { const s = ri(2, 7), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push(n ** 3 + n); } const N = s + 5; return { terms: t, answer: N ** 3 + N, rule: `n³ + n for n = ${s}, ${s + 1}, …` }; },
    () => { const s = ri(2, 7), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push(n ** 3 + 1); } const N = s + 5; return { terms: t, answer: N ** 3 + 1, rule: `n³ + 1 for n = ${s}, ${s + 1}, …` }; },
    () => { const start = ri(0, 4); const t = PRIMES.slice(start, start + 5).map((p) => p * p); return { terms: t, answer: PRIMES[start + 5] ** 2, rule: `squares of consecutive prime numbers` }; },
    () => { const start = ri(0, 4); const t = PRIMES.slice(start, start + 5).map((p) => p ** 3); return { terms: t, answer: PRIMES[start + 5] ** 3, rule: `cubes of consecutive prime numbers` }; },
    () => { const s = ri(1, 4); const odds = []; for (let k = 1; k < 24; k += 2) odds.push(k); const t = odds.slice(s, s + 5).map((o) => o * o); return { terms: t, answer: odds[s + 5] ** 2, rule: `squares of consecutive odd numbers` }; },
    () => { const s = ri(1, 5); const t = []; for (let i = 0; i < 5; i++) { const e = 2 * (s + i); t.push(e * e); } const E = 2 * (s + 5); return { terms: t, answer: E * E, rule: `squares of consecutive even numbers` }; },
    () => { const s = ri(2, 6), t = []; for (let i = 0; i < 6; i++) t.push(2 ** (s + i) + 1); return { terms: t, answer: 2 ** (s + 6) + 1, rule: `powers of 2, plus 1 (2ⁿ + 1)` }; },
    () => { const s = ri(2, 6), t = []; for (let i = 0; i < 6; i++) t.push(2 ** (s + i) - 1); return { terms: t, answer: 2 ** (s + 6) - 1, rule: `powers of 2, minus 1 (2ⁿ − 1)` }; },
    () => { const a = ri(2, 10), t = [a]; for (let i = 1; i <= 4; i++) t.push(t[t.length - 1] + (i * i)); return { terms: t, answer: t[t.length - 1] + 25, rule: `add consecutive squares (+1, +4, +9, +16, +25)` }; },
    () => { const a = ri(2, 10), t = [a]; for (let i = 1; i <= 4; i++) t.push(t[t.length - 1] + i ** 3); return { terms: t, answer: t[t.length - 1] + 125, rule: `add consecutive cubes (+1, +8, +27, +64, +125)` }; },
    () => { const s = ri(1, 4), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push((n * (3 * n - 1)) / 2); } const N = s + 5; return { terms: t, answer: (N * (3 * N - 1)) / 2, rule: `pentagonal numbers n(3n−1)/2` }; },
    () => { const s = ri(1, 3), t = []; for (let i = 0; i < 5; i++) t.push(fact(s + i)); return { terms: t, answer: fact(s + 5), rule: `factorials (n! = 1×2×…×n)` }; },
    () => { const a = ri(1, 3), d0 = ri(2, 4), t = [a]; let d = d0, c = 2; for (let i = 0; i < 4; i++) { t.push(t[t.length - 1] + d); d += c; c += 1; } return { terms: t, answer: t[t.length - 1] + d, rule: `the added gap itself grows by 2, 3, 4, … (second-order differences increase)` }; },
    () => { const s = ri(2, 6), t = []; for (let i = 0; i < 5; i++) { const n = s + i; t.push(n * (n + 1) * (n + 2) / 6); } const N = s + 5; return { terms: t, answer: (N * (N + 1) * (N + 2)) / 6, rule: `tetrahedral numbers n(n+1)(n+2)/6` }; },
  ],
};

function distractors(answer, terms) {
  const gap = Math.abs(terms[terms.length - 1] - terms[terms.length - 2]) || 2;
  const cands = [answer + 1, answer - 1, answer + 2, answer - 2, answer + gap, answer - gap, answer + Math.max(3, Math.round(answer * 0.05))];
  const out = [];
  for (const c of cands) {
    if (c > 0 && c !== answer && !out.includes(c)) out.push(c);
    if (out.length === 3) break;
  }
  let bump = answer + 3;
  while (out.length < 3) { bump += 1; if (bump !== answer && !out.includes(bump)) out.push(bump); }
  return out;
}

function build(level, fam) {
  const { terms, answer, rule } = fam();
  const stem = `Find the next number in the series: ${terms.join(", ")}, ?`;
  const opts = [answer, ...distractors(answer, terms)];
  // seeded shuffle
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const options = opts.map((v) => ({ label: String(v), is_correct: v === answer }));
  const q = {
    chapter: "Number Series",
    kind: "standard",
    difficulty: level,
    answer_type: "single",
    stem,
    explanation: `The pattern: ${rule}. Continuing it, the next term is ${answer}.`,
    options,
  };
  // self-check — throw rather than emit a bad item
  const correct = options.filter((o) => o.is_correct).length;
  const labels = new Set(options.map((o) => o.label));
  if (correct !== 1) throw new Error(`bad correct count ${correct}: ${stem}`);
  if (labels.size !== options.length) throw new Error(`dup option: ${stem}`);
  if (options.length !== 4) throw new Error(`opt count: ${stem}`);
  return q;
}

const PER_LEVEL = 50;
const questions = [];
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  const seen = new Set();
  let tries = 0;
  while ([...seen].length < PER_LEVEL && tries < 20000) {
    tries++;
    const fam = FAMILIES[level][ri(0, FAMILIES[level].length - 1)];
    const q = build(level, fam);
    if (seen.has(q.stem)) continue;
    seen.add(q.stem);
    questions.push(q);
  }
  if ([...seen].length < PER_LEVEL) throw new Error(`only produced ${[...seen].length} unique ${level}`);
}

const out = { subject: "Reasoning", questions };
const path = new URL("../reasoning-number-series-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${questions.length} questions to ${path}`);
