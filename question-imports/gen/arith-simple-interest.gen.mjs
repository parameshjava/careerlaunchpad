// Arithmetic → Simple Interest (200 Qs, ~50/tier). SI = P·R·T/100; answers built
// to be exact. Run: node question-imports/gen/arith-simple-interest.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, PCT = { post: "%" }, YRS = { post: " years" };

const subtypes = {
  easy: [
    (ri) => { const P = ri(2, 40) * 1000, R = ri(2, 15), T = ri(1, 6), SI = (P * R * T) / 100; return { stem: `Find the simple interest on ₹${P} at ${R}% per annum for ${T} years.`, answer: SI, explanation: `SI = P×R×T/100 = ${P}×${R}×${T}/100 = ₹${SI}.`, unit: M }; },
    (ri) => { const P = ri(2, 40) * 1000, R = ri(2, 15), T = ri(1, 6), SI = (P * R * T) / 100; return { stem: `A sum of ₹${P} is invested at ${R}% per annum simple interest for ${T} years. Find the total amount.`, answer: P + SI, explanation: `SI = ${P}×${R}×${T}/100 = ₹${SI}; amount = ₹${P} + ₹${SI} = ₹${P + SI}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const P = ri(2, 40) * 1000, R = ri(2, 15), T = ri(1, 6), SI = (P * R * T) / 100; return { stem: `A sum lent at ${R}% per annum simple interest earns ₹${SI} as interest in ${T} years. Find the sum.`, answer: P, explanation: `Sum = 100×SI/(R×T) = 100×${SI}/(${R}×${T}) = ₹${P}.`, unit: M }; },
    (ri) => { const P = ri(2, 40) * 1000, R = ri(2, 15), T = ri(1, 6), SI = (P * R * T) / 100; return { stem: `₹${P} lent for ${T} years at simple interest earns ₹${SI}. Find the rate percent per annum.`, answer: R, explanation: `Rate = 100×SI/(P×T) = 100×${SI}/(${P}×${T}) = ${R}%.`, unit: PCT }; },
    (ri) => { const P = ri(2, 40) * 1000, R = ri(2, 12), T = ri(1, 8), SI = (P * R * T) / 100; return { stem: `₹${P} at ${R}% per annum simple interest earns ₹${SI} as interest. Find the time in years.`, answer: T, explanation: `Time = 100×SI/(P×R) = 100×${SI}/(${P}×${R}) = ${T} years.`, unit: YRS }; },
  ],
  hard: [
    (ri) => { const n = ri(2, 4), T = [4, 5, 8, 10, 20, 25, 50][ri(0, 6)]; if ((100 * (n - 1)) % T !== 0) return null; return { stem: `At what rate of simple interest per annum will a sum of money become ${n} times itself in ${T} years?`, answer: (100 * (n - 1)) / T, explanation: `To become ${n} times, the interest must equal ${n - 1} times the principal, so R = 100×${n - 1}/${T} = ${(100 * (n - 1)) / T}%.`, unit: PCT }; },
    (ri) => { const P = ri(2, 30) * 1000, R = ri(2, 12), T = ri(1, 6), A = P + (P * R * T) / 100; return { stem: `A sum of ₹${P} amounts to ₹${A} in ${T} years at simple interest. Find the rate percent per annum.`, answer: R, explanation: `Interest = ₹${A} − ₹${P} = ₹${A - P}; rate = 100×${A - P}/(${P}×${T}) = ${R}%.`, unit: PCT }; },
    (ri) => { const P = ri(2, 30) * 1000, R = ri(2, 12), T = ri(1, 8), A = P + (P * R * T) / 100; return { stem: `In how many years will ₹${P} amount to ₹${A} at ${R}% per annum simple interest?`, answer: T, explanation: `Interest = ₹${A} − ₹${P} = ₹${A - P}; time = 100×${A - P}/(${P}×${R}) = ${T} years.`, unit: YRS }; },
  ],
  very_hard: [
    (ri) => { const P = ri(2, 20) * 1000, s = ri(1, 15) * 100, T1 = ri(2, 4), T2 = T1 + ri(2, 5); return { stem: `A sum of money at simple interest amounts to ₹${P + s * T1} in ${T1} years and to ₹${P + s * T2} in ${T2} years. Find the sum.`, answer: P, explanation: `Interest for (${T2}−${T1}) years = ₹${s * (T2 - T1)}, so annual interest = ₹${s}; sum = ₹${P + s * T1} − ${T1}×₹${s} = ₹${P}.`, unit: M }; },
    (ri) => { const P = ri(2, 20) * 1000, R = ri(2, 12), s = (P * R) / 100, T1 = ri(2, 4), T2 = T1 + ri(2, 5); if (!Number.isInteger(s)) return null; return { stem: `A sum at simple interest amounts to ₹${P + s * T1} in ${T1} years and ₹${P + s * T2} in ${T2} years. Find the rate percent per annum.`, answer: R, explanation: `Annual interest = (₹${P + s * T2} − ₹${P + s * T1})/(${T2}−${T1}) = ₹${s}; sum = ₹${P}; rate = 100×${s}/${P} = ${R}%.`, unit: PCT }; },
    (ri) => { const opt = [[16, 25, 8], [9, 25, 6], [1, 4, 5], [1, 25, 2], [49, 100, 7], [9, 100, 3], [4, 25, 4]][ri(0, 6)]; return { stem: `The simple interest on a certain sum for some years is ${opt[0]}/${opt[1]} of the sum. If the number of years is equal to the rate percent per annum, find the rate percent.`, answer: opt[2], explanation: `SI = P·R·T/100 with R = T gives R² = 100×${opt[0]}/${opt[1]} = ${opt[2] * opt[2]}, so R = ${opt[2]}%.`, unit: PCT }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Simple Interest", file: "arithmetic-simple-interest-01.json", subtypes });
