#!/usr/bin/env node
// Generator for Reasoning → Coding and Decoding (200 Qs, ~50 per tier). Each
// question gives one worked example (sample → code) and asks the solver to encode
// a target word under the same rule. Codes are computed (with mod-26 wrap) and
// every item self-asserts (4 distinct options, exactly one correct). Output:
// reasoning-coding-and-decoding-01.json. Run: node .../coding-decoding.gen.mjs
import { writeFileSync } from "node:fs";

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const mod = (n) => ((n % 26) + 26) % 26;
const enc = (word, f) => [...word].map((ch, i) => String.fromCharCode(65 + f(ch.charCodeAt(0) - 65, i))).join("");
const rev = (w) => [...w].reverse().join("");

const WORDS = ["CAT","DOG","SUN","STAR","BOOK","TREE","FISH","BIRD","LAMP","DESK","RAIN","GOLD","KING","LION","RICE","MILK","SHIP","ROAD","WIND","FIRE","LEAF","HAND","DOOR","BELL","CAKE","FROG","NEST","WOLF","DUCK","BEAR","CORN","SALT","SILK","COAL","IRON","ROSE","PALM","REED","MINT","BOAT","CARD","GATE","HILL","JUMP","KNOT","MOON","PArk".toUpperCase(),"QUIZ","VASE","YARN"];

// Each family: pick a shift/transform rule; build(sample)->code, build(target)->answer.
const FAMILIES = {
  easy: [
    () => { const k = ri(1, 3); return { f: (c) => mod(c + k), rule: `each letter is moved ${k} place(s) forward in the alphabet` }; },
    () => { const k = ri(1, 3); return { f: (c) => mod(c - k), rule: `each letter is moved ${k} place(s) backward in the alphabet`, note: "backward" }; },
    () => ({ transform: rev, rule: `the letters are written in reverse order` }),
  ],
  medium: [
    () => { const k = ri(4, 7); return { f: (c) => mod(c + k), rule: `each letter is moved ${k} places forward` }; },
    () => { const k = ri(4, 7); return { f: (c) => mod(c - k), rule: `each letter is moved ${k} places backward` }; },
    () => ({ f: (c) => 25 - c, rule: `each letter is replaced by its opposite (A↔Z, B↔Y, C↔X, …)` }),
  ],
  hard: [
    () => { const k = ri(1, 3); return { transform: (w) => enc(rev(w), (c) => mod(c + k)), rule: `the word is reversed and then each letter is moved ${k} place(s) forward` }; },
    () => ({ f: (c, i) => mod(c + i + 1), rule: `the 1st letter moves 1 place, the 2nd moves 2 places, the 3rd moves 3, and so on` }),
    () => { const k = ri(2, 4); return { f: (c, i) => mod(i % 2 === 0 ? c + k : c - k), rule: `letters in odd positions move ${k} forward, letters in even positions move ${k} backward` }; },
  ],
  very_hard: [
    () => { const k = ri(1, 4); return { f: (c) => mod(25 - c + k), rule: `each letter is replaced by its opposite (A↔Z) and then moved ${k} place(s) forward` }; },
    () => ({ f: (c, i) => mod(c + 2 * (i + 1)), rule: `the 1st letter moves 2 places, the 2nd moves 4, the 3rd moves 6, and so on` }),
    () => ({ transform: (w) => enc(rev(w), (c) => 25 - c), rule: `the word is reversed and then each letter is replaced by its opposite (A↔Z)` }),
    () => { const k = ri(2, 5); return { f: (c, i) => mod(c + (i % 2 === 0 ? k : k + 2)), rule: `letters in odd positions move ${k} forward and letters in even positions move ${k + 2} forward` }; },
  ],
};

const apply = (rule, w) => (rule.transform ? rule.transform(w) : enc(w, rule.f));

function distract(ans) {
  const codes = [...ans].map((ch) => ch.charCodeAt(0) - 65);
  const out = new Set();
  const shift = (idx, d) => { const c = [...codes]; c[idx] = mod(c[idx] + d); const s = c.map((x) => String.fromCharCode(65 + x)).join(""); if (s !== ans) out.add(s); };
  for (const d of [1, -1, 2, -2, 3]) { shift(codes.length - 1, d); if (out.size >= 3) break; }
  for (const d of [1, -1, 2]) { if (out.size >= 3) break; shift(0, d); }
  let d = 3; while (out.size < 3 && d < 26) { shift(Math.floor(codes.length / 2), d); d++; }
  return [...out].slice(0, 3);
}

function build(level) {
  const rule = FAMILIES[level][ri(0, FAMILIES[level].length - 1)]();
  const sample = WORDS[ri(0, WORDS.length - 1)];
  let target = WORDS[ri(0, WORDS.length - 1)];
  if (target === sample) return null;
  const code = apply(rule, sample);
  const answer = apply(rule, target);
  if (answer === code) return null;
  const stem = `In a certain code language, ${sample} is written as ${code}. How is ${target} written in that code?`;
  const ds = distract(answer);
  if (ds.length < 3) return null;
  const opts = [answer, ...ds];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const options = opts.map((v) => ({ label: v, is_correct: v === answer }));
  const q = { chapter: "Coding and Decoding", kind: "standard", difficulty: level, answer_type: "single", stem, explanation: `Rule: ${rule.rule}. Applying it to ${target} gives ${answer}.`, options };
  if (options.filter((o) => o.is_correct).length !== 1) throw new Error(`correct!=1: ${stem}`);
  if (new Set(options.map((o) => o.label)).size !== 4) throw new Error(`dup opt: ${stem}`);
  return q;
}

const PER_LEVEL = 50;
const questions = [];
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  const seen = new Set();
  let tries = 0;
  while (seen.size < PER_LEVEL && tries < 80000) { tries++; const q = build(level); if (!q || seen.has(q.stem)) continue; seen.add(q.stem); questions.push(q); }
  if (seen.size < PER_LEVEL) throw new Error(`only ${seen.size} unique ${level}`);
}
const path = new URL("../reasoning-coding-and-decoding-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Reasoning", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} questions to ${path}`);
