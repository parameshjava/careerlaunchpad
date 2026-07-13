#!/usr/bin/env node
// Generator for Reasoning → Letter Series (200 Qs, ~50 per tier). Letters are
// handled as alphabet positions (A=0 … Z=25); each family is a distinct rule,
// answers are computed and every item is self-asserted (letters in range, 4
// distinct options, exactly one correct) before writing. Output:
// reasoning-letter-series-01.json.  Run: node question-imports/gen/letter-series.gen.mjs
import { writeFileSync } from "node:fs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const L = (c) => String.fromCharCode(65 + c);
const ok = (arr) => arr.every((c) => c >= 0 && c <= 25);
const PRIME_POS = [2, 3, 5, 7, 11, 13, 17, 19, 23]; // 1-based positions
const grp = (codes) => codes.map(L).join("");

// Families return { terms:[str], answer:str, rule } or null if params go out of range.
const FAMILIES = {
  easy: [
    () => { const step = ri(1, 3), s = ri(0, 25 - 5 * step); const c = []; for (let i = 0; i < 5; i++) c.push(s + step * i); return { terms: c.map(L), answer: L(s + step * 5), rule: `each letter moves ${step} step(s) forward in the alphabet` }; },
    () => { const step = ri(1, 3), s = ri(5 * step, 25); const c = []; for (let i = 0; i < 5; i++) c.push(s - step * i); return { terms: c.map(L), answer: L(s - step * 5), rule: `each letter moves ${step} step(s) backward in the alphabet` }; },
  ],
  medium: [
    () => { const s = ri(0, 10); const t = [s]; let g = 1; for (let i = 0; i < 4; i++) { t.push(t[t.length - 1] + g); g++; } if (!ok(t)) return null; return { terms: t.map(L), answer: L(t[t.length - 1] + g), rule: `the gap grows by one each time (+1, +2, +3, …)` }; },
    () => { const b = ri(0, 16); const terms = []; for (let i = 0; i < 4; i++) { const a = b + 2 * i; if (!ok([a, a + 1])) return null; terms.push(grp([a, a + 1])); } const a = b + 8; if (!ok([a, a + 1])) return null; return { terms, answer: grp([a, a + 1]), rule: `consecutive letters taken two at a time` }; },
    () => { const step = ri(2, 4), a = ri(0, 6); const terms = []; for (let i = 0; i < 4; i++) { const x = a + step * i; if (!ok([x, x + 1])) return null; terms.push(grp([x, x + 1])); } const x = a + step * 4; if (!ok([x, x + 1])) return null; return { terms, answer: grp([x, x + 1]), rule: `each pair moves ${step} forward` }; },
    () => { const s = ri(0, 8); const t = [s]; const pat = [2, 3, 2, 3]; for (const d of pat) t.push(t[t.length - 1] + d); if (!ok(t)) return null; return { terms: t.slice(0, 5).map(L), answer: L(t[4] + 2), rule: `letters advance alternately by 2 and 3` }; },
  ],
  hard: [
    () => { const a = ri(0, 12); const terms = []; for (let i = 0; i < 4; i++) { const x = a + i; if (!ok([x, 25 - x])) return null; terms.push(grp([x, 25 - x])); } const x = a + 4; if (!ok([x, 25 - x])) return null; return { terms, answer: grp([x, 25 - x]), rule: `the two letters are mirror images — their positions add up to 27` }; },
    () => { const f = ri(1, 3), g = ri(1, 3), a = ri(0, 12), b = ri(13, 25); const terms = []; for (let i = 0; i < 4; i++) { const x = a + f * i, y = b - g * i; if (!ok([x, y])) return null; terms.push(grp([x, y])); } const x = a + f * 4, y = b - g * 4; if (!ok([x, y])) return null; return { terms, answer: grp([x, y]), rule: `first letter +${f}, second letter −${g} per pair` }; },
    () => { const b = ri(0, 13); const terms = []; for (let i = 0; i < 4; i++) { const x = b + 3 * i; if (!ok([x, x + 1, x + 2])) return null; terms.push(grp([x, x + 1, x + 2])); } const x = b + 12; if (!ok([x, x + 1, x + 2])) return null; return { terms, answer: grp([x, x + 1, x + 2]), rule: `consecutive letters in groups of three` }; },
    () => { const start = ri(0, 4); const w = PRIME_POS.slice(start, start + 5); if (w.length < 5 || start + 5 >= PRIME_POS.length) return null; return { terms: w.map((p) => L(p - 1)), answer: L(PRIME_POS[start + 5] - 1), rule: `letters standing at prime positions in the alphabet` }; },
  ],
  very_hard: [
    () => { const sa = ri(1, 3), sb = ri(1, 3), a0 = ri(0, 8), b0 = ri(9, 17); const t = []; for (let i = 0; i < 3; i++) { const x = a0 + sa * i, y = b0 + sb * i; if (!ok([x, y])) return null; t.push(L(x), L(y)); } const ans = a0 + sa * 3; if (!ok([ans])) return null; return { terms: t, answer: L(ans), rule: `two alternating sequences: one advancing by ${sa}, the other by ${sb}` }; },
    () => { const step = ri(6, 7), g = ri(0, 4); const terms = []; for (let i = 0; i < 3; i++) { const x = g + step * i; if (!ok([x, x + 2, x + 4])) return null; terms.push(grp([x, x + 2, x + 4])); } const x = g + step * 3; if (!ok([x, x + 2, x + 4])) return null; return { terms, answer: grp([x, x + 2, x + 4]), rule: `groups of three letters two apart; each group starts ${step} later` }; },
    () => { const f = ri(1, 2), s = ri(2, 3), a = ri(0, 6), b = ri(6, 12); const terms = []; for (let i = 0; i < 4; i++) { const x = a + f * i, y = b + s * i; if (!ok([x, y])) return null; terms.push(grp([x, y])); } const x = a + f * 4, y = b + s * 4; if (!ok([x, y])) return null; return { terms, answer: grp([x, y]), rule: `first letter +${f} and second letter +${s} per group` }; },
    () => { const s = ri(0, 5); const t = [s]; let g = 2; for (let i = 0; i < 4; i++) { t.push(t[t.length - 1] + g); g++; } if (!ok(t)) return null; return { terms: t.slice(0, 5).map(L), answer: L(t[4] + g), rule: `the gap grows by one, starting at +2 (+2, +3, +4, …)` }; },
  ],
};

function distract(ans) {
  const codes = [...ans].map((ch) => ch.charCodeAt(0) - 65);
  const out = new Set();
  const shift = (idx, d) => { const c = [...codes]; c[idx] += d; if (ok(c)) { const s = c.map(L).join(""); if (s !== ans) out.add(s); } };
  for (const d of [1, -1, 2, -2, 3, -3]) { shift(codes.length - 1, d); if (out.size >= 3) break; }
  for (const d of [1, -1, 2, -2]) { if (out.size >= 3) break; shift(0, d); }
  let d = 4;
  while (out.size < 3) { shift(codes.length - 1, d); shift(0, d); d++; if (d > 25) break; }
  return [...out].slice(0, 3);
}

function build(level, fam) {
  const r = fam();
  if (!r) return null;
  const { terms, answer, rule } = r;
  const stem = `Find the next term in the letter series: ${terms.join(", ")}, ?`;
  const ds = distract(answer);
  if (ds.length < 3) return null;
  const opts = [answer, ...ds];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const options = opts.map((v) => ({ label: v, is_correct: v === answer }));
  const q = { chapter: "Letter Series", kind: "standard", difficulty: level, answer_type: "single", stem, explanation: `The pattern: ${rule}. So the next term is ${answer}.`, options };
  if (options.filter((o) => o.is_correct).length !== 1) throw new Error(`correct!=1: ${stem}`);
  if (new Set(options.map((o) => o.label)).size !== 4) throw new Error(`dup opt: ${stem}`);
  return q;
}

const PER_LEVEL = 50;
const questions = [];
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  const seen = new Set();
  let tries = 0;
  while (seen.size < PER_LEVEL && tries < 60000) {
    tries++;
    const q = build(level, FAMILIES[level][ri(0, FAMILIES[level].length - 1)]);
    if (!q || seen.has(q.stem)) continue;
    seen.add(q.stem);
    questions.push(q);
  }
  if (seen.size < PER_LEVEL) throw new Error(`only ${seen.size} unique ${level}`);
}
const path = new URL("../reasoning-letter-series-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Reasoning", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} questions to ${path}`);
