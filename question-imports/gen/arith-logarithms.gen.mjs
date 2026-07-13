// Arithmetic → Logarithms (200 Qs, ~50/tier). Bases/arguments chosen so every log
// is an exact integer. Run: node question-imports/gen/arith-logarithms.gen.mjs
import { run } from "./lib.mjs";

const subtypes = {
  easy: [
    (ri) => { const b = ri(2, 9), n = ri(2, 4); return { stem: `Find the value of log base ${b} of ${b ** n}.`, answer: n, explanation: `${b ** n} = ${b}^${n}, so log_${b} ${b ** n} = ${n}.` }; },
    (ri, R) => { const b = ri(2, 12); return R() < 0.5 ? { stem: `Find the value of log base ${b} of 1.`, answer: 0, explanation: `log of 1 to any base is 0.` } : { stem: `Find the value of log base ${b} of ${b}.`, answer: 1, explanation: `log_${b} ${b} = 1.` }; },
    (ri) => { const n = ri(1, 9); return { stem: `Find the value of log base 10 of ${10 ** n}.`, answer: n, explanation: `${10 ** n} = 10^${n}, so log₁₀ ${10 ** n} = ${n}.` }; },
  ],
  medium: [
    (ri) => { const b = ri(2, 6), n = ri(5, 8); return { stem: `Find the value of log base ${b} of ${b ** n}.`, answer: n, explanation: `${b ** n} = ${b}^${n}, so log_${b} ${b ** n} = ${n}.` }; },
    (ri) => { const b = ri(2, 5), n = ri(2, 5); return { stem: `If log base ${b} of x equals ${n}, find x.`, answer: b ** n, explanation: `x = ${b}^${n} = ${b ** n}.` }; },
    (ri) => { const b = ri(2, 4), m = ri(1, 3), n = ri(1, 3); return { stem: `Find the value of log base ${b} of (${b ** m} × ${b ** n}).`, answer: m + n, explanation: `${b ** m}×${b ** n} = ${b}^(${m}+${n}) = ${b}^${m + n}, so the log is ${m + n}.` }; },
  ],
  hard: [
    (ri) => { const b1 = ri(2, 5), n1 = ri(2, 4), b2 = ri(2, 5), n2 = ri(2, 4); return { stem: `Find the value of log base ${b1} of ${b1 ** n1} + log base ${b2} of ${b2 ** n2}.`, answer: n1 + n2, explanation: `The two logs are ${n1} and ${n2}; their sum is ${n1 + n2}.` }; },
    (ri) => { const b = ri(2, 5), m = ri(3, 6), n = ri(1, m - 1); return { stem: `Find the value of log base ${b} of (${b ** m} ÷ ${b ** n}).`, answer: m - n, explanation: `${b ** m}÷${b ** n} = ${b}^(${m}−${n}) = ${b}^${m - n}, so the log is ${m - n}.` }; },
    (ri) => { const b = ri(2, 9), m = ri(2, 6), n = ri(2, 6); return { stem: `If log base ${b} of x = ${m} and log base ${b} of y = ${n}, find log base ${b} of (x × y).`, answer: m + n, explanation: `log(xy) = log x + log y = ${m} + ${n} = ${m + n}.` }; },
  ],
  very_hard: [
    (ri) => { const b1 = ri(2, 5), m1 = ri(3, 5), b2 = ri(2, 5), m2 = ri(1, 2); return { stem: `Find the value of log base ${b1} of ${b1 ** m1} − log base ${b2} of ${b2 ** m2}.`, answer: m1 - m2, explanation: `The logs are ${m1} and ${m2}; their difference is ${m1 - m2}.` }; },
    (ri) => { const b1 = ri(2, 4), m1 = ri(2, 4), b2 = ri(2, 4), m2 = ri(2, 4); return { stem: `Find the value of (log base ${b1} of ${b1 ** m1}) × (log base ${b2} of ${b2 ** m2}).`, answer: m1 * m2, explanation: `= ${m1} × ${m2} = ${m1 * m2}.` }; },
    (ri) => { const b = ri(2, 4), m = ri(2, 3), k = ri(2, 3); return { stem: `Find the value of log base ${b} of (${b ** m})^${k}.`, answer: m * k, explanation: `(${b ** m})^${k} = ${b}^(${m}×${k}) = ${b}^${m * k}, so the log is ${m * k}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Logarithms", file: "arithmetic-logarithms-01.json", subtypes });
