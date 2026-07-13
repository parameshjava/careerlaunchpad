// Arithmetic → Compound Interest (200 Qs, ~50/tier). Principals are built as
// multiples of the compounding denominator so every amount/CI is an exact integer.
// Run: node question-imports/gen/arith-compound-interest.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, PCT = { post: "%" }, YRS = { post: " years" };
const ipow = (b, e) => { let r = 1; for (let i = 0; i < e; i++) r *= b; return r; };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const step = (num, den) => den / gcd(num, den);
const RATES = [5, 10, 20, 25, 50];

const subtypes = {
  easy: [
    (ri) => { const R = RATES[ri(0, 4)], T = ri(2, 3), den = ipow(100, T), num = ipow(100 + R, T), P = step(num, den) * ri(1, 40); return { stem: `Find the amount on ₹${P} at ${R}% per annum compound interest for ${T} years.`, answer: (P * num) / den, explanation: `Amount = P(1+R/100)^T = ${P}×(1+${R}/100)^${T} = ₹${(P * num) / den}.`, unit: M }; },
    (ri) => { const R = RATES[ri(0, 4)], T = ri(2, 3), den = ipow(100, T), num = ipow(100 + R, T), P = step(num, den) * ri(1, 40); return { stem: `Find the compound interest on ₹${P} at ${R}% per annum for ${T} years.`, answer: (P * num) / den - P, explanation: `CI = P(1+R/100)^T − P = ₹${(P * num) / den} − ₹${P} = ₹${(P * num) / den - P}.`, unit: M }; },
    (ri) => { const R = RATES[ri(0, 4)], den = 10000, num = R * R, P = step(num, den) * ri(1, 60); return { stem: `Find the difference between the compound interest and the simple interest on ₹${P} at ${R}% per annum for 2 years.`, answer: (P * num) / den, explanation: `Difference for 2 years = P(R/100)² = ${P}×(${R}/100)² = ₹${(P * num) / den}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const R = [10, 20][ri(0, 1)], T = ri(1, 2), per = 2 * T, den = ipow(200, per), num = ipow(200 + R, per), P = step(num, den) * ri(1, 30); return { stem: `Find the amount on ₹${P} at ${R}% per annum compounded half-yearly for ${T} year(s).`, answer: (P * num) / den, explanation: `Half-yearly: rate ${R / 2}% for ${per} periods; amount = ${P}(1+${R / 2}/100)^${per} = ₹${(P * num) / den}.`, unit: M }; },
    (ri) => { const o = [[8000, 5, 8820], [10000, 10, 12100], [6250, 20, 9000], [5000, 10, 6050], [16000, 25, 25000], [4000, 5, 4410]][ri(0, 5)]; return { stem: `A sum of ₹${o[0]} amounts to ₹${o[2]} in 2 years at compound interest. Find the rate percent per annum.`, answer: o[1], explanation: `(1+R/100)² = ${o[2]}/${o[0]}, giving R = ${o[1]}%.`, unit: PCT }; },
    (ri) => { const R = RATES[ri(0, 4)], T = ri(2, 3), den = ipow(100, T), num = ipow(100 + R, T), P = step(num, den) * ri(1, 40); return { stem: `A sum amounts to ₹${(P * num) / den} in ${T} years at ${R}% per annum compound interest. Find the principal (the original sum).`, answer: P, explanation: `Principal = amount ÷ (1+R/100)^T = ₹${(P * num) / den} ÷ (1+${R}/100)^${T} = ₹${P}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const R = [5, 10, 20, 25][ri(0, 3)], den = 10000, num = R * R, P = step(num, den) * ri(2, 60), D = (P * num) / den; return { stem: `The difference between the compound interest and the simple interest on a certain sum for 2 years at ${R}% per annum is ₹${D}. Find the sum.`, answer: P, explanation: `Difference = P(${R}/100)² = ₹${D}, so P = ₹${D} × 10000/${num} = ₹${P}.`, unit: M }; },
    (ri) => { const R = RATES[ri(0, 4)], den = ipow(100, 3), num = ipow(100 + R, 3), P = step(num, den) * ri(1, 30); return { stem: `Find the compound interest on ₹${P} at ${R}% per annum for 3 years.`, answer: (P * num) / den - P, explanation: `CI = ${P}(1+${R}/100)³ − ${P} = ₹${(P * num) / den - P}.`, unit: M }; },
    (ri) => { const T = [3, 4, 5, 6, 8][ri(0, 4)], k = ri(2, 4); return { stem: `A sum of money doubles itself in ${T} years at compound interest. In how many years will it become ${ipow(2, k)} times itself?`, answer: T * k, explanation: `Becoming ${ipow(2, k)} = 2^${k} times takes ${k} doubling periods, i.e. ${k}×${T} = ${T * k} years.`, unit: YRS }; },
  ],
  very_hard: [
    (ri) => { const R = RATES[ri(0, 4)], A1 = step(100 + R, 100) * ri(20, 120), A2 = (A1 * (100 + R)) / 100; return { stem: `A sum of money invested at compound interest amounts to ₹${A1} in one year and ₹${A2} the next year. Find the rate percent per annum.`, answer: R, explanation: `Rate = (₹${A2} − ₹${A1})/₹${A1} × 100 = ${R}%.`, unit: PCT }; },
    (ri) => { const R = [10, 20, 5][ri(0, 2)], den = ipow(100, 3), num = R * R * (300 + R), P = step(num, den) * ri(2, 40); return { stem: `Find the difference between the compound interest and the simple interest on ₹${P} at ${R}% per annum for 3 years.`, answer: (P * num) / den, explanation: `Difference for 3 years = P·R²(300+R)/10⁶ = ${P}×${R}²×${300 + R}/1000000 = ₹${(P * num) / den}.`, unit: M }; },
    (ri) => { const R = RATES[ri(0, 4)], T = ri(2, 3), den = ipow(100, T), num = ipow(100 + R, T), P = step(num, den) * ri(2, 40); return { stem: `The population of a town is ${P} and it grows at ${R}% per annum. Find the population after ${T} years.`, answer: (P * num) / den, explanation: `Population = ${P}(1+${R}/100)^${T} = ${(P * num) / den}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Compound Interest", file: "arithmetic-compound-interest-01.json", subtypes });
