// Arithmetic → Simplification (200 Qs, ~50/tier). Expressions are constructed to
// have exact integer values (computed in code, not string-eval). BODMAS practice.
// Run: node question-imports/gen/arith-simplification.gen.mjs
import { run } from "./lib.mjs";

const subtypes = {
  easy: [
    (ri) => { const a = ri(5, 60), b = ri(2, 12), c = ri(2, 12); return { stem: `Simplify: ${a} + ${b} × ${c}`, answer: a + b * c, explanation: `By BODMAS, ${b}×${c} = ${b * c}, then ${a} + ${b * c} = ${a + b * c}.` }; },
    (ri) => { const a = ri(2, 30), b = ri(2, 30), c = ri(2, 12); return { stem: `Simplify: (${a} + ${b}) × ${c}`, answer: (a + b) * c, explanation: `(${a}+${b}) = ${a + b}; ${a + b} × ${c} = ${(a + b) * c}.` }; },
    (ri) => { const q = ri(2, 6), p = ri(1, q - 1), N = q * ri(3, 20); return { stem: `Simplify: ${p}/${q} of ${N}`, answer: (N * p) / q, explanation: `${p}/${q} × ${N} = ${(N * p) / q}.` }; },
  ],
  medium: [
    (ri) => { const a = ri(4, 20), b = ri(2, 12), d = ri(2, 12), k = ri(2, 12), c = d * k; if (a * b - k <= 0) return null; return { stem: `Simplify: ${a} × ${b} − ${c} ÷ ${d}`, answer: a * b - k, explanation: `${c}÷${d} = ${k} and ${a}×${b} = ${a * b}, so ${a * b} − ${k} = ${a * b - k}.` }; },
    (ri) => { const a = ri(10, 60), b = ri(2, 12), c = ri(2, 12), d = ri(2, 40); if (a + b * c - d <= 0) return null; return { stem: `Simplify: ${a} + ${b} × ${c} − ${d}`, answer: a + b * c - d, explanation: `${b}×${c} = ${b * c}; ${a} + ${b * c} − ${d} = ${a + b * c - d}.` }; },
    (ri) => { const m = ri(2, 20), N = m * 100, x = ri(5, 60), M = ri(10, 100); return { stem: `Simplify: ${x}% of ${N} + ${M}`, answer: (x * N) / 100 + M, explanation: `${x}% of ${N} = ${(x * N) / 100}; adding ${M} gives ${(x * N) / 100 + M}.` }; },
  ],
  hard: [
    (ri) => { const a = ri(10, 50), b = ri(2, 12), c = ri(2, 12), e = ri(2, 12), k = ri(2, 12), d = e * k; if (a + b * c - k <= 0) return null; return { stem: `Simplify: ${a} + ${b} × ${c} − ${d} ÷ ${e}`, answer: a + b * c - k, explanation: `${b}×${c}=${b * c}, ${d}÷${e}=${k}; ${a} + ${b * c} − ${k} = ${a + b * c - k}.` }; },
    (ri) => { const a = ri(3, 15), b = ri(2, 12), c = ri(2, 12); return { stem: `Simplify: ${a}² + ${b} × ${c}`, answer: a * a + b * c, explanation: `${a}² = ${a * a}; ${b}×${c} = ${b * c}; sum = ${a * a + b * c}.` }; },
    (ri) => { const a = ri(2, 20), b = ri(2, 20), c = ri(2, 12), e = ri(2, 12), k = ri(2, 12), d = e * k; if ((a + b) * c - k <= 0) return null; return { stem: `Simplify: (${a} + ${b}) × ${c} − ${d} ÷ ${e}`, answer: (a + b) * c - k, explanation: `(${a}+${b})×${c} = ${(a + b) * c}; ${d}÷${e} = ${k}; result = ${(a + b) * c - k}.` }; },
  ],
  very_hard: [
    (ri) => { const d = ri(2, 12), Q = ri(3, 20), e = ri(1, Q - 1), b = ri(2, 12), c = ri(2, 12), a = d * Q - b * c; if (a <= 0) return null; return { stem: `Simplify: (${a} + ${b} × ${c}) ÷ ${d} − ${e}`, answer: Q - e, explanation: `${b}×${c}=${b * c}; (${a}+${b * c}) = ${a + b * c}; ÷${d} = ${Q}; minus ${e} = ${Q - e}.` }; },
    (ri) => { const a = ri(2, 15), b = ri(2, 15), c = ri(2, 15), d = ri(2, 15), e = ri(2, 12), f = ri(2, 12); if (a * b + c * d - e * f <= 0) return null; return { stem: `Simplify: ${a} × ${b} + ${c} × ${d} − ${e} × ${f}`, answer: a * b + c * d - e * f, explanation: `${a * b} + ${c * d} − ${e * f} = ${a * b + c * d - e * f}.` }; },
    (ri) => { const e = ri(2, 12), Q = ri(3, 15), a = ri(2, 15), b = ri(2, 15), c = ri(2, 12), d = (a + b) * c - e * Q; if (d <= 0) return null; return { stem: `Simplify: [(${a} + ${b}) × ${c} − ${d}] ÷ ${e}`, answer: Q, explanation: `(${a}+${b})×${c} = ${(a + b) * c}; minus ${d} = ${e * Q}; ÷ ${e} = ${Q}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Simplification", file: "arithmetic-simplification-01.json", subtypes });
