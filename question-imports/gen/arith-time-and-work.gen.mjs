// Arithmetic → Time and Work (200 Qs, ~50/tier). Fraction-based results use curated
// integer-answer sets; the rest are constructed to be exact. Every answer is checked.
// Run: node question-imports/gen/arith-time-and-work.gen.mjs
import { run } from "./lib.mjs";
const D = { post: " days" }, M = { pre: "₹" };

const PAIRS = [[12, 6, 4], [10, 15, 6], [20, 30, 12], [12, 24, 8], [6, 3, 2], [15, 10, 6], [9, 18, 6], [20, 5, 4], [12, 4, 3], [8, 8, 4], [30, 20, 12], [18, 9, 6], [40, 10, 8], [36, 12, 9], [24, 8, 6], [10, 10, 5], [14, 35, 10], [30, 45, 18], [20, 80, 16], [16, 16, 8]];
const TRIPLES = [[6, 12, 12, 3], [4, 6, 12, 2], [10, 15, 30, 5], [8, 12, 24, 4], [6, 9, 18, 3], [12, 18, 36, 6], [9, 12, 18, 4], [20, 30, 60, 10]];
const PAIRSUM = [[12, 15, 20, 10], [20, 30, 60, 20], [10, 15, 30, 10], [6, 9, 18, 6], [8, 12, 24, 8]];

const subtypes = {
  easy: [
    (ri) => { const [a, b, t] = PAIRS[ri(0, PAIRS.length - 1)]; return { stem: `A can do a piece of work in ${a} days and B in ${b} days. Working together, in how many days will they complete it?`, answer: t, explanation: `Together's one-day work = 1/${a} + 1/${b}, so the time taken = ${t} days.`, unit: D }; },
    (ri) => { const k = ri(2, 3), b = k * ri(3, 12); return { stem: `A is ${k} times as efficient as B. If B alone can finish a work in ${b} days, in how many days can A finish it alone?`, answer: b / k, explanation: `A works ${k} times as fast, so A takes ${b}/${k} = ${b / k} days.`, unit: D }; },
    (ri) => { const h = ri(4, 12), h2 = ri(4, 12), d = ri(2, 15); if ((d * h) % h2 !== 0) return null; return { stem: `A man can complete a job in ${d} days working ${h} hours a day. Working ${h2} hours a day, in how many days will he finish the same job?`, answer: (d * h) / h2, explanation: `Total hours = ${d}×${h} = ${d * h}; days at ${h2} h/day = ${d * h}/${h2} = ${(d * h) / h2}.`, unit: D }; },
  ],
  medium: [
    (ri) => { const a = ri(4, 20), b = ri(4, 20), k = ri(5, 40), T = (a + b) * k; if (a === b) return null; return { stem: `A can do a work in ${a} days and B in ${b} days. They complete it together for a total payment of ₹${T}. Find A's share of the payment.`, answer: k * b, explanation: `Payment is shared in the ratio of work done = 1/${a} : 1/${b} = ${b}:${a}; A's share = ₹${T} × ${b}/${a + b} = ₹${k * b}.`, unit: M }; },
    (ri) => { const [a, b, t] = PAIRS[ri(0, PAIRS.length - 1)]; if (a === b) return null; return { stem: `A and B together can finish a work in ${t} days. A alone can finish it in ${a} days. In how many days can B alone finish it?`, answer: b, explanation: `B's one-day work = 1/${t} − 1/${a}, so B alone takes ${b} days.`, unit: D }; },
    (ri) => { const m = ri(4, 40), d = ri(2, 20), m2 = ri(2, 40); if ((m * d) % m2 !== 0 || m2 === m) return null; return { stem: `If ${m} men can do a piece of work in ${d} days, how many days will ${m2} men take to do the same work?`, answer: (m * d) / m2, explanation: `Men and days are inversely proportional: days = ${m}×${d}/${m2} = ${(m * d) / m2}.`, unit: D }; },
  ],
  hard: [
    (ri) => { const m1 = ri(4, 30), h1 = ri(4, 12), d1 = ri(3, 20), m2 = ri(4, 30), h2 = ri(4, 12), num = m1 * h1 * d1; if (num % (m2 * h2) !== 0) return null; return { stem: `If ${m1} men working ${h1} hours a day complete a work in ${d1} days, in how many days will ${m2} men working ${h2} hours a day complete the same work?`, answer: num / (m2 * h2), explanation: `Days = (${m1}×${h1}×${d1})/(${m2}×${h2}) = ${num}/${m2 * h2} = ${num / (m2 * h2)}.`, unit: D }; },
    (ri) => { const [a, b, c, t] = TRIPLES[ri(0, TRIPLES.length - 1)]; return { stem: `A can do a work in ${a} days, B in ${b} days and C in ${c} days. Working together, in how many days will they finish it?`, answer: t, explanation: `Combined one-day work = 1/${a} + 1/${b} + 1/${c}, so the time = ${t} days.`, unit: D }; },
    (ri) => { const a = ri(6, 30), d = ri(1, a - 1), e = ri(2, 15); if ((a * e) % (a - d) !== 0) return null; return { stem: `A can do a work in ${a} days. He works for ${d} days and then leaves. B alone finishes the remaining work in ${e} days. In how many days can B alone complete the entire work?`, answer: (a * e) / (a - d), explanation: `A completed ${d}/${a} of the work; B did the remaining ${a - d}/${a} in ${e} days, so B alone needs ${a}×${e}/${a - d} = ${(a * e) / (a - d)} days.`, unit: D }; },
  ],
  very_hard: [
    (ri) => { const [x, y, z, t] = PAIRSUM[ri(0, PAIRSUM.length - 1)]; return { stem: `A and B can do a work in ${x} days, B and C in ${y} days, and C and A in ${z} days. In how many days can all three working together finish it?`, answer: t, explanation: `Adding the three pair-rates gives twice the combined rate, so all three together take ${t} days.`, unit: D }; },
    (ri) => { const k = ri(2, 4), base = ri(2, 10), t = k * base; return { stem: `A is ${k} times as efficient as B, and together they can finish a work in ${t} days. In how many days can A alone finish it?`, answer: (k + 1) * base, explanation: `A and B together = (${k}+1) times B's rate; A alone takes (${k}+1)×${t}/${k} = ${(k + 1) * base} days.`, unit: D }; },
    (ri) => { const t = ri(4, 15), d = ri(1, t - 1), e = ri(2, 15); if ((t * e) % (t - d) !== 0) return null; return { stem: `A and B together can do a work in ${t} days. They work together for ${d} days, after which A leaves. B alone completes the remaining work in ${e} days. In how many days can B alone do the entire work?`, answer: (t * e) / (t - d), explanation: `Together they finished ${d}/${t} of the work; B did the remaining ${t - d}/${t} in ${e} days, so B alone needs ${t}×${e}/${t - d} = ${(t * e) / (t - d)} days.`, unit: D }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Time and Work", file: "arithmetic-time-and-work-01.json", subtypes });
