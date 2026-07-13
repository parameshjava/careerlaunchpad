// Arithmetic → Square Roots and Cube Roots (200 Qs, ~50/tier). Uses perfect
// squares/cubes so every root is an exact integer. Run: node .../arith-square-cube-roots.gen.mjs
import { run } from "./lib.mjs";
const PR = [2, 3, 5, 7, 11, 13];

const subtypes = {
  easy: [
    (ri) => { const n = ri(2, 40); return { stem: `Find the square root of ${n * n}.`, answer: n, explanation: `${n}² = ${n * n}, so √${n * n} = ${n}.` }; },
    (ri) => { const n = ri(2, 20); return { stem: `Find the cube root of ${n * n * n}.`, answer: n, explanation: `${n}³ = ${n * n * n}, so ∛${n * n * n} = ${n}.` }; },
    (ri) => { const a = ri(2, 30), b = ri(2, 30); return { stem: `Find the value of √${a * a} + √${b * b}.`, answer: a + b, explanation: `√${a * a} = ${a} and √${b * b} = ${b}, so the sum is ${a + b}.` }; },
  ],
  medium: [
    (ri) => { const n = ri(41, 99); return { stem: `Find the square root of ${n * n}.`, answer: n, explanation: `${n}² = ${n * n}, so √${n * n} = ${n}.` }; },
    (ri) => { const n = ri(11, 25); return { stem: `Find the cube root of ${n * n * n}.`, answer: n, explanation: `${n}³ = ${n * n * n}, so ∛${n * n * n} = ${n}.` }; },
    (ri) => { const a = ri(2, 25), b = ri(2, 25), c = ri(2, 25); return { stem: `Find the value of √${a * a} + √${b * b} + √${c * c}.`, answer: a + b + c, explanation: `The three square roots are ${a}, ${b} and ${c}; their sum is ${a + b + c}.` }; },
  ],
  hard: [
    (ri) => { const n = ri(100, 200); return { stem: `Find the square root of ${n * n}.`, answer: n, explanation: `${n}² = ${n * n}, so √${n * n} = ${n}.` }; },
    (ri) => { const a = ri(3, 20), b = ri(3, 20); return { stem: `Find the value of √(${a * a} × ${b * b}).`, answer: a * b, explanation: `√(${a * a}×${b * b}) = √${a * a}×√${b * b} = ${a}×${b} = ${a * b}.` }; },
    (ri) => { const b = ri(2, 12), a = b * ri(2, 8); return { stem: `Find the value of √(${a * a} / ${b * b}).`, answer: a / b, explanation: `√(${a * a}/${b * b}) = ${a}/${b} = ${a / b}.` }; },
  ],
  very_hard: [
    (ri) => { const p = PR[ri(0, PR.length - 1)], k = ri(2, 9), N = k * k * p; return { stem: `Find the smallest number by which ${N} must be multiplied to make it a perfect square.`, answer: p, explanation: `${N} = ${k}²×${p}; the factor ${p} appears to an odd power, so multiply by ${p}.` }; },
    (ri) => { const p = PR[ri(0, PR.length - 1)], k = ri(2, 9), N = k * k * p; return { stem: `Find the smallest number by which ${N} must be divided to make it a perfect square.`, answer: p, explanation: `${N} = ${k}²×${p}; dividing by ${p} leaves ${k}², a perfect square.` }; },
    (ri) => { const a = ri(2, 12), b = ri(2, 12), c = ri(2, 12); return { stem: `Find the value of √(${a * a} × ${b * b} × ${c * c}).`, answer: a * b * c, explanation: `√(${a * a}×${b * b}×${c * c}) = ${a}×${b}×${c} = ${a * b * c}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Square Roots and Cube Roots", file: "arithmetic-square-cube-roots-01.json", subtypes });
