// Arithmetic → Probability (200 Qs, ~50/tier). Answers are reduced fractions;
// options are fraction strings. Run: node question-imports/gen/arith-probability.gen.mjs
import { writeFileSync } from "node:fs";
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const fs = (a, b) => { if (a === 0) return "0"; const g = gcd(a, b); const n = a / g, d = b / g; return d === 1 ? String(n) : `${n}/${d}`; };
const cnt = (max, pred) => { let c = 0; for (let i = 1; i <= max; i++) if (pred(i)) c++; return c; };

const DICE = [["an even number", (n) => n % 2 === 0], ["an odd number", (n) => n % 2 === 1], ["a number greater than 4", (n) => n > 4], ["a prime number", (n) => [2, 3, 5].includes(n)], ["a number less than 3", (n) => n < 3], ["a multiple of 3", (n) => n % 3 === 0], ["the number 6", (n) => n === 6], ["a number at most 2", (n) => n <= 2]];
const COIN2 = [["exactly one head", 2], ["exactly two heads", 1], ["at least one head", 3], ["no head", 1], ["at least one tail", 3]];
const CARDS = [["a king", 4], ["a heart", 13], ["a face card", 12], ["a red card", 26], ["an ace", 4], ["a spade", 13], ["a black card", 26], ["a queen", 4], ["a red king", 2], ["a black queen", 2], ["a jack", 4], ["a king or a queen", 8], ["a red face card", 6], ["a ten or a jack", 8]];

function distract(favN, totN) {
  const ans = fs(favN, totN);
  const out = new Set();
  const push = (a, b) => { if (b > 0 && a >= 0) { const s = fs(a, b); if (s !== ans && s !== "0") out.add(s); } };
  push(totN - favN, totN); push(favN + 1, totN); push(favN - 1, totN); push(favN, totN + 1); push(favN * 2, totN); push(favN, totN * 2);
  let k = 2; while (out.size < 3) { push(1, favN + k); push(favN + k, totN); k++; if (k > 40) break; }
  return [...out].slice(0, 3);
}

function make(level, spec) {
  if (!spec) return null;
  const { stem, favN, totN, explanation } = spec;
  const ds = distract(favN, totN);
  if (ds.length < 3) return null;
  const labels = [fs(favN, totN), ...ds];
  if (new Set(labels).size !== 4) return null;
  for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
  const options = labels.map((l) => ({ label: l, is_correct: l === fs(favN, totN) }));
  return { chapter: "Probability", kind: "standard", difficulty: level, answer_type: "single", stem, explanation, options };
}

const SPECS = {
  easy: [
    () => { const [desc, pred] = DICE[ri(0, DICE.length - 1)], f = cnt(6, pred); return { stem: `A fair die is rolled once. Find the probability of getting ${desc}.`, favN: f, totN: 6, explanation: `Favourable outcomes = ${f} out of 6, so the probability is ${fs(f, 6)}.` }; },
    () => { const [desc, f] = COIN2[ri(0, COIN2.length - 1)]; return { stem: `Two fair coins are tossed together. Find the probability of getting ${desc}.`, favN: f, totN: 4, explanation: `Favourable outcomes = ${f} out of 4, so the probability is ${fs(f, 4)}.` }; },
    () => { const r = ri(2, 9), b = ri(2, 9); return { stem: `A bag contains ${r} red and ${b} blue balls. One ball is drawn at random. Find the probability that it is red.`, favN: r, totN: r + b, explanation: `P(red) = ${r}/(${r}+${b}) = ${fs(r, r + b)}.` }; },
  ],
  medium: [
    () => { const [desc, f] = CARDS[ri(0, 10)]; return { stem: `A card is drawn at random from a well-shuffled pack of 52 cards. Find the probability that it is ${desc}.`, favN: f, totN: 52, explanation: `Favourable cards = ${f} out of 52, so the probability is ${fs(f, 52)}.` }; },
    () => { const s = ri(2, 12), f = 6 - Math.abs(s - 7); return { stem: `Two fair dice are thrown together. Find the probability that the sum of the numbers is ${s}.`, favN: f, totN: 36, explanation: `There are ${f} ways to get a sum of ${s} out of 36, so the probability is ${fs(f, 36)}.` }; },
    () => { const r = ri(2, 6), g = ri(2, 6), b = ri(2, 6); return { stem: `A bag has ${r} red, ${g} green and ${b} black balls. One ball is drawn at random. Find the probability that it is green.`, favN: g, totN: r + g + b, explanation: `P(green) = ${g}/${r + g + b} = ${fs(g, r + g + b)}.` }; },
  ],
  hard: [
    () => { const [desc, f] = CARDS[ri(11, CARDS.length - 1)]; return { stem: `A card is drawn at random from a pack of 52 cards. Find the probability that it is ${desc}.`, favN: f, totN: 52, explanation: `Favourable cards = ${f} out of 52, so the probability is ${fs(f, 52)}.` }; },
    () => { const primes = [2, 3, 5, 7, 11]; const f = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((s, sum) => s + (primes.includes(sum) ? 6 - Math.abs(sum - 7) : 0), 0); return { stem: `Two fair dice are thrown. Find the probability that the sum of the numbers shown is a prime number.`, favN: f, totN: 36, explanation: `The prime sums (2,3,5,7,11) occur in ${f} of the 36 outcomes, so the probability is ${fs(f, 36)}.` }; },
    () => { const r = ri(3, 12), b = ri(3, 12), tot = r + b; const favN = (r * (r - 1)) / 2, totN = (tot * (tot - 1)) / 2; return { stem: `A bag contains ${r} red and ${b} white balls. Two balls are drawn at random together. Find the probability that both are red.`, favN, totN, explanation: `P(both red) = C(${r},2)/C(${tot},2) = ${favN}/${totN} = ${fs(favN, totN)}.` }; },
  ],
  very_hard: [
    () => { const f = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((s, sum) => s + (sum > 9 ? 6 - Math.abs(sum - 7) : 0), 0); return { stem: `Two fair dice are thrown together. Find the probability that the sum of the numbers is greater than 9.`, favN: f, totN: 36, explanation: `Sums of 10, 11 and 12 occur in ${f} of the 36 outcomes, so the probability is ${fs(f, 36)}.` }; },
    () => { const r = ri(3, 7), b = ri(3, 7), tot = r + b; const favN = r * b, totN = (tot * (tot - 1)) / 2; return { stem: `A bag contains ${r} red and ${b} black balls. Two balls are drawn at random together. Find the probability that one is red and the other is black.`, favN, totN, explanation: `P(one of each) = (${r}×${b})/C(${tot},2) = ${favN}/${totN} = ${fs(favN, totN)}.` }; },
    () => { const g = ri(3, 8), y = ri(3, 8), tot = g + y; const favN = (g * (g - 1)) / 2 + (y * (y - 1)) / 2, totN = (tot * (tot - 1)) / 2; return { stem: `A box has ${g} green and ${y} yellow balls. Two balls are drawn together at random. Find the probability that both are of the same colour.`, favN, totN, explanation: `P(same colour) = [C(${g},2)+C(${y},2)]/C(${tot},2) = ${favN}/${totN} = ${fs(favN, totN)}.` }; },
  ],
};

const questions = [];
const seen = new Set();
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  const fns = SPECS[level];
  let added = 0, tries = 0;
  while (added < 50 && tries < 300000) {
    tries++;
    const q = make(level, fns[Math.floor(R() * fns.length)]());
    if (!q || seen.has(q.stem)) continue;
    seen.add(q.stem); questions.push(q); added++;
  }
  if (added < 50) throw new Error(`only ${added} unique ${level}`);
}
const path = new URL("../arithmetic-probability-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Arithmetic", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} to arithmetic-probability-01.json`);
