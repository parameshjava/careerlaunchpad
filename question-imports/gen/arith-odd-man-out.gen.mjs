// Arithmetic → Odd Man Out and Series (200 Qs, ~50/tier). Each item lists four
// numbers, three sharing a property and one that breaks it (the answer). Options
// are the numbers themselves. Run: node question-imports/gen/arith-odd-man-out.gen.mjs
import { writeFileSync } from "node:fs";
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const isSq = (n) => { const r = Math.round(Math.sqrt(n)); return r * r === n; };
const isCube = (n) => { const r = Math.round(Math.cbrt(n)); return r * r * r === n; };
const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
const distinct = (a) => new Set(a).size === a.length;

// each family returns { nums:[4], odd:value, rule }
const FAMILIES = {
  easy: [
    () => { const k = ri(3, 9); const a = [k * ri(2, 6), k * ri(7, 10), k * ri(11, 14)]; const odd = k * ri(15, 18) + ri(1, k - 1); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are multiples of ${k}` } : null; },
    () => { const a = [2 * ri(2, 20), 2 * ri(21, 40), 2 * ri(41, 60)]; const odd = 2 * ri(61, 80) + 1; const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are even numbers` } : null; },
    () => { const a = [2 * ri(2, 20) + 1, 2 * ri(21, 40) + 1, 2 * ri(41, 60) + 1]; const odd = 2 * ri(61, 80); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are odd numbers` } : null; },
  ],
  medium: [
    () => { const a = [ri(3, 8) ** 2, ri(9, 14) ** 2, ri(15, 20) ** 2]; let odd; do { odd = ri(3, 20) ** 2 + ri(1, 4); } while (isSq(odd)); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are perfect squares` } : null; },
    () => { const P = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]; const a = [P[ri(0, 3)], P[ri(4, 7)], P[ri(8, 10)]]; let odd; do { odd = ri(10, 50); } while (isPrime(odd) || a.includes(odd)); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are prime numbers` } : null; },
  ],
  hard: [
    () => { const a = [ri(2, 4) ** 3, ri(5, 7) ** 3, ri(8, 10) ** 3]; let odd; do { odd = ri(2, 10) ** 3 + ri(1, 6); } while (isCube(odd)); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are perfect cubes` } : null; },
    () => { const a = [ri(21, 30) ** 2, ri(31, 40) ** 2, ri(41, 50) ** 2]; let odd; do { odd = ri(21, 50) ** 2 + ri(1, 8); } while (isSq(odd)); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are perfect squares` } : null; },
    () => { const P = [53, 59, 61, 67, 71, 73, 79, 83, 89, 97]; const a = [P[ri(0, 3)], P[ri(4, 6)], P[ri(7, 9)]]; let odd; do { odd = ri(51, 99); } while (isPrime(odd) || a.includes(odd)); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are prime numbers` } : null; },
  ],
  very_hard: [
    () => { const a = [ri(12, 18) ** 2, ri(19, 25) ** 2, ri(26, 32) ** 2]; let odd; do { odd = ri(12, 32) ** 2 + (R() < 0.5 ? 1 : -1) * ri(1, 5); } while (isSq(odd) || odd <= 0); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are perfect squares` } : null; },
    () => { const a = [ri(4, 6) ** 3, ri(7, 8) ** 3, ri(9, 11) ** 3]; let odd; do { odd = ri(4, 11) ** 3 + (R() < 0.5 ? 1 : -1) * ri(1, 9); } while (isCube(odd) || odd <= 0); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are perfect cubes` } : null; },
    () => { const k = ri(6, 15); const a = [k * ri(3, 8), k * ri(9, 14), k * ri(15, 20)]; const odd = k * ri(21, 26) + ri(1, k - 1); const nums = [...a, odd]; return distinct(nums) ? { nums, odd, rule: `all except ${odd} are multiples of ${k}` } : null; },
  ],
};

const questions = [];
const seen = new Set();
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  const fns = FAMILIES[level];
  let added = 0, tries = 0;
  while (added < 50 && tries < 200000) {
    tries++;
    const spec = fns[Math.floor(R() * fns.length)]();
    if (!spec) continue;
    const order = [...spec.nums];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const stem = `Find the odd one out: ${order.join(", ")}.`;
    if (seen.has(stem)) continue;
    const options = order.map((v) => ({ label: String(v), is_correct: v === spec.odd }));
    if (options.filter((o) => o.is_correct).length !== 1) continue;
    seen.add(stem);
    questions.push({ chapter: "Odd Man Out and Series", kind: "standard", difficulty: level, answer_type: "single", stem, explanation: `Here ${spec.rule}, so ${spec.odd} is the odd one out.`, options });
    added++;
  }
  if (added < 50) throw new Error(`only ${added} unique ${level}`);
}
const path = new URL("../arithmetic-odd-man-out-and-series-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Arithmetic", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} to arithmetic-odd-man-out-and-series-01.json`);
