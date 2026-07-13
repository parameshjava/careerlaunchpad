// Arithmetic → Surds and Indices (200 Qs, ~50/tier). Laws of exponents evaluated
// to exact integers (exponents kept small). Run: node .../arith-surds-and-indices.gen.mjs
import { run } from "./lib.mjs";

const subtypes = {
  easy: [
    (ri) => { const b = ri(2, 5), m = ri(1, 3), n = ri(1, 3); return { stem: `Simplify: ${b}^${m} × ${b}^${n}`, answer: b ** (m + n), explanation: `${b}^${m} × ${b}^${n} = ${b}^(${m}+${n}) = ${b}^${m + n} = ${b ** (m + n)}.` }; },
    (ri) => { const b = ri(2, 6), m = ri(3, 6), n = ri(1, m - 1); return { stem: `Simplify: ${b}^${m} ÷ ${b}^${n}`, answer: b ** (m - n), explanation: `${b}^${m} ÷ ${b}^${n} = ${b}^(${m}−${n}) = ${b}^${m - n} = ${b ** (m - n)}.` }; },
    (ri) => { const b = ri(2, 4), m = ri(2, 3), n = ri(2, 3); return { stem: `Simplify: (${b}^${m})^${n}`, answer: b ** (m * n), explanation: `(${b}^${m})^${n} = ${b}^(${m}×${n}) = ${b}^${m * n} = ${b ** (m * n)}.` }; },
  ],
  medium: [
    (ri) => { const b = ri(2, 5), x = ri(2, 5); return { stem: `If ${b}^x = ${b ** x}, find the value of x.`, answer: x, explanation: `${b}^${x} = ${b ** x}, so x = ${x}.` }; },
    (ri) => { const a = ri(2, 4), b = ri(2, 4), m = ri(2, 3); return { stem: `Simplify: ${a}^${m} × ${b}^${m}`, answer: (a * b) ** m, explanation: `${a}^${m} × ${b}^${m} = (${a}×${b})^${m} = ${a * b}^${m} = ${(a * b) ** m}.` }; },
    (ri) => { const a = ri(4, 99); return { stem: `Simplify: √${a} × √${a}`, answer: a, explanation: `√${a} × √${a} = ${a}.` }; },
  ],
  hard: [
    (ri) => { const b = ri(2, 4), m = ri(1, 3), n = ri(1, 3), p = ri(1, m + n - 1); return { stem: `Simplify: (${b}^${m} × ${b}^${n}) ÷ ${b}^${p}`, answer: b ** (m + n - p), explanation: `= ${b}^(${m}+${n}−${p}) = ${b}^${m + n - p} = ${b ** (m + n - p)}.` }; },
    (ri) => { const b = ri(2, 4), m = ri(2, 6), k = ri(1, m - 1); return { stem: `If ${b}^(x + ${k}) = ${b ** m}, find the value of x.`, answer: m - k, explanation: `${b ** m} = ${b}^${m}, so x + ${k} = ${m} ⇒ x = ${m - k}.` }; },
    (ri) => { const x0 = ri(2, 10), n = ri(2, 3); return { stem: `If x^${n} = ${x0 ** n}, find the value of x.`, answer: x0, explanation: `${x0}^${n} = ${x0 ** n}, so x = ${x0}.` }; },
  ],
  very_hard: [
    (ri) => { const b = ri(2, 3), k = ri(2, 3), m = ri(2, 3); return { stem: `If ${b}^x = ${b ** k}^${m}, find the value of x.`, answer: k * m, explanation: `${b ** k} = ${b}^${k}, so ${b}^x = ${b}^(${k}×${m}) = ${b}^${k * m} ⇒ x = ${k * m}.` }; },
    (ri) => { const a = ri(2, 3), x = ri(2, 4), y = ri(2, 4); return { stem: `If ${a}^x = ${a ** x} and ${a}^y = ${a ** y}, find the value of ${a}^(x + y).`, answer: a ** x * a ** y, explanation: `${a}^(x+y) = ${a}^x × ${a}^y = ${a ** x} × ${a ** y} = ${a ** x * a ** y}.` }; },
    (ri) => { const b = ri(2, 3), m = ri(1, 2), n = ri(2, 3), p = ri(1, 3), q = ri(1, m * n + p - 1); return { stem: `Simplify: (${b}^${m})^${n} × ${b}^${p} ÷ ${b}^${q}`, answer: b ** (m * n + p - q), explanation: `= ${b}^(${m}×${n}+${p}−${q}) = ${b}^${m * n + p - q} = ${b ** (m * n + p - q)}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Surds and Indices", file: "arithmetic-surds-and-indices-01.json", subtypes });
