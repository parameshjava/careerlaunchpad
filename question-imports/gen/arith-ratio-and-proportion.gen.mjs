// Arithmetic → Ratio and Proportion (200 Qs, ~50/tier). Answers computed exactly.
// Run: node question-imports/gen/arith-ratio-and-proportion.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, L = { post: " litres" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const coprime = (ri) => { let m, n; do { m = ri(2, 9); n = ri(2, 9); } while (m === n || gcd(m, n) !== 1); return [m, n]; };

const subtypes = {
  easy: [
    (ri) => { const m = ri(2, 9), n = ri(2, 9); if (m === n) return null; const A = (m + n) * ri(5, 50); return { stem: `Divide ₹${A} between two persons in the ratio ${m}:${n}. Find the larger share.`, answer: (A * Math.max(m, n)) / (m + n), explanation: `Total parts = ${m + n}; larger share = ₹${A} × ${Math.max(m, n)}/${m + n} = ₹${(A * Math.max(m, n)) / (m + n)}.`, unit: M }; },
    (ri) => { const a = ri(2, 12), b = ri(2, 12), k = ri(2, 10); return { stem: `Find the fourth proportional to ${a}, ${b} and ${a * k}.`, answer: b * k, explanation: `Fourth proportional = (${b} × ${a * k})/${a} = ${b * k}.` }; },
    (ri) => { const m = ri(2, 9), n = ri(2, 9); if (m === n) return null; const S = (m + n) * ri(5, 40); return { stem: `Two numbers are in the ratio ${m}:${n} and their sum is ${S}. Find the larger number.`, answer: (S * Math.max(m, n)) / (m + n), explanation: `Larger = ${S} × ${Math.max(m, n)}/${m + n} = ${(S * Math.max(m, n)) / (m + n)}.` }; },
  ],
  medium: [
    (ri) => { const a = ri(1, 6), b = ri(1, 6), c = ri(1, 6), A = (a + b + c) * ri(5, 40), mx = Math.max(a, b, c); return { stem: `₹${A} is divided among three persons in the ratio ${a}:${b}:${c}. Find the largest share.`, answer: (A * mx) / (a + b + c), explanation: `Largest share = ₹${A} × ${mx}/${a + b + c} = ₹${(A * mx) / (a + b + c)}.`, unit: M }; },
    (ri) => { const a = ri(2, 10), k = ri(2, 8); return { stem: `Find the third proportional to ${a} and ${a * k}.`, answer: a * k * k, explanation: `Third proportional = ${a * k}²/${a} = ${a * k * a * k}/${a} = ${a * k * k}.` }; },
    (ri) => { const a = ri(2, 12), k = ri(2, 6); return { stem: `Find the mean proportional between ${a} and ${a * k * k}.`, answer: a * k, explanation: `Mean proportional = √(${a} × ${a * k * k}) = √${a * a * k * k} = ${a * k}.` }; },
  ],
  hard: [
    (ri) => { const m = ri(1, 4), n = ri(1, 4), p = ri(1, 4), q = ri(1, 4), sum = m * p + n * p + n * q, T = sum * ri(4, 30); return { stem: `If A:B = ${m}:${n} and B:C = ${p}:${q}, and ₹${T} is divided among A, B and C in the combined ratio, find C's share.`, answer: (T * n * q) / sum, explanation: `A:B:C = ${m * p}:${n * p}:${n * q}; C's share = ₹${T} × ${n * q}/${sum} = ₹${(T * n * q) / sum}.`, unit: M }; },
    (ri) => { const m = ri(3, 9), n = ri(1, m - 1), part = ri(5, 40), D = (m - n) * part; return { stem: `Two numbers are in the ratio ${m}:${n} and their difference is ${D}. Find the smaller number.`, answer: n * part, explanation: `The difference is (${m}−${n}) = ${m - n} parts = ${D}, so one part = ${part}; smaller number = ${n} × ${part} = ${n * part}.` }; },
    (ri) => { const m = ri(2, 9), n = ri(1, 8), V = (m + n) * ri(5, 30); return { stem: `A ${V}-litre mixture contains milk and water in the ratio ${m}:${n}. Find the quantity of water in it.`, answer: (V * n) / (m + n), explanation: `Water = ${V} × ${n}/${m + n} = ${(V * n) / (m + n)} litres.`, unit: L }; },
  ],
  very_hard: [
    (ri) => { const [m, n] = coprime(ri), k = ri(2, 9), x = ri(2, 15), a = m * k, b = n * k, g = gcd(a + x, b + x); return { stem: `The ratio of two numbers is ${m}:${n}. When ${x} is added to each, the ratio becomes ${(a + x) / g}:${(b + x) / g}. Find the larger of the two original numbers.`, answer: Math.max(a, b), explanation: `The numbers are ${a} and ${b}; adding ${x} gives ${a + x} and ${b + x}, i.e. ${(a + x) / g}:${(b + x) / g}. The larger original number is ${Math.max(a, b)}.` }; },
    (ri) => { const a = ri(1, 6), b = ri(1, 6), c = ri(1, 6), mx = Math.max(a, b, c), mn = Math.min(a, b, c); if (mx === mn) return null; const part = ri(5, 40), D = (mx - mn) * part, sum = a + b + c; return { stem: `A sum of money is divided among three people in the ratio ${a}:${b}:${c}. If the difference between the largest and the smallest share is ₹${D}, find the total sum.`, answer: sum * part, explanation: `Difference = (${mx}−${mn}) = ${mx - mn} parts = ₹${D}, so one part = ₹${part}; total = ${sum} × ₹${part} = ₹${sum * part}.`, unit: M }; },
    (ri) => { const [m, n] = coprime(ri), k = ri(3, 9), x = ri(1, n * 3), a = m * k, b = n * k; if (b - x <= 0) return null; const g = gcd(a - x, b - x); return { stem: `The ratio of two numbers is ${m}:${n}. When ${x} is subtracted from each, the ratio becomes ${(a - x) / g}:${(b - x) / g}. Find the larger of the two original numbers.`, answer: Math.max(a, b), explanation: `The numbers are ${a} and ${b}; subtracting ${x} gives ${a - x} and ${b - x}, i.e. ${(a - x) / g}:${(b - x) / g}. The larger original number is ${Math.max(a, b)}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Ratio and Proportion", file: "arithmetic-ratio-and-proportion-01.json", subtypes });
