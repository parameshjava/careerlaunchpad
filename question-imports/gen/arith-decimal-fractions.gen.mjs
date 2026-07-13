// Arithmetic → Decimal Fractions (200 Qs, ~50/tier). Operands are integers scaled
// by 10/100 and combined so every answer has at most two decimals (computed via
// integer arithmetic). Run: node question-imports/gen/arith-decimal-fractions.gen.mjs
import { run } from "./lib.mjs";
const d = (n) => String(n); // n is already a JS number with ≤2 decimals
const DENS = [2, 4, 5, 8, 10, 20, 25, 40, 50];

const subtypes = {
  easy: [
    (ri) => { const ha = ri(11, 9999), hb = ri(11, 9999); return { stem: `Simplify: ${d(ha / 100)} + ${d(hb / 100)}`, answer: (ha + hb) / 100, explanation: `${d(ha / 100)} + ${d(hb / 100)} = ${d((ha + hb) / 100)}.` }; },
    (ri) => { const ha = ri(101, 9999), hb = ri(11, ha - 1); return { stem: `Simplify: ${d(ha / 100)} − ${d(hb / 100)}`, answer: (ha - hb) / 100, explanation: `${d(ha / 100)} − ${d(hb / 100)} = ${d((ha - hb) / 100)}.` }; },
    (ri) => { const t = ri(11, 999), n = ri(2, 12); return { stem: `Simplify: ${d(t / 10)} × ${n}`, answer: (t * n) / 10, explanation: `${d(t / 10)} × ${n} = ${d((t * n) / 10)}.` }; },
  ],
  medium: [
    (ri) => { const t1 = ri(11, 99), t2 = ri(11, 99); return { stem: `Simplify: ${d(t1 / 10)} × ${d(t2 / 10)}`, answer: (t1 * t2) / 100, explanation: `${d(t1 / 10)} × ${d(t2 / 10)} = ${d((t1 * t2) / 100)}.` }; },
    (ri) => { const n = ri(2, 12), q = ri(11, 500), ha = q * n; return { stem: `Simplify: ${d(ha / 100)} ÷ ${n}`, answer: q / 100, explanation: `${d(ha / 100)} ÷ ${n} = ${d(q / 100)}.` }; },
    (ri) => { const q = DENS[ri(0, DENS.length - 1)], p = ri(1, q - 1); return { stem: `Express ${p}/${q} as a decimal.`, answer: p / q, explanation: `${p} ÷ ${q} = ${d(p / q)}.` }; },
  ],
  hard: [
    (ri) => { const a = ri(2, 50), t = ri(11, 99), n = ri(2, 9); return { stem: `Simplify: ${a} + ${d(t / 10)} × ${n}`, answer: a + (t * n) / 10, explanation: `${d(t / 10)}×${n} = ${d((t * n) / 10)}; then ${a} + ${d((t * n) / 10)} = ${d(a + (t * n) / 10)}.` }; },
    (ri) => { const ha = ri(11, 999), hb = ri(11, 999), hc = ri(11, 999); return { stem: `Simplify: ${d(ha / 100)} + ${d(hb / 100)} + ${d(hc / 100)}`, answer: (ha + hb + hc) / 100, explanation: `Adding gives ${d((ha + hb + hc) / 100)}.` }; },
    (ri) => { const ha = ri(500, 9999), hb = ri(11, 499), hc = ri(11, 999); return { stem: `Simplify: ${d(ha / 100)} − ${d(hb / 100)} + ${d(hc / 100)}`, answer: (ha - hb + hc) / 100, explanation: `${d(ha / 100)} − ${d(hb / 100)} + ${d(hc / 100)} = ${d((ha - hb + hc) / 100)}.` }; },
  ],
  very_hard: [
    (ri) => { const t1 = ri(11, 99), t2 = ri(11, 99), n = ri(2, 9); return { stem: `Simplify: (${d(t1 / 10)} + ${d(t2 / 10)}) × ${n}`, answer: ((t1 + t2) * n) / 10, explanation: `(${d(t1 / 10)}+${d(t2 / 10)}) = ${d((t1 + t2) / 10)}; ×${n} = ${d(((t1 + t2) * n) / 10)}.` }; },
    (ri) => { const t1 = ri(11, 99), n1 = ri(2, 9), t2 = ri(11, 99), n2 = ri(2, 9); const val = (t1 * n1) / 10 - (t2 * n2) / 10; if (val <= 0) return null; return { stem: `Simplify: ${d(t1 / 10)} × ${n1} − ${d(t2 / 10)} × ${n2}`, answer: Math.round(val * 100) / 100, explanation: `${d((t1 * n1) / 10)} − ${d((t2 * n2) / 10)} = ${d(Math.round(val * 100) / 100)}.` }; },
    (ri) => { const n = ri(2, 9), q = ri(11, 300), ha = q * n, hb = ri(11, 999); return { stem: `Simplify: ${d(ha / 100)} ÷ ${n} + ${d(hb / 100)}`, answer: (q + hb) / 100, explanation: `${d(ha / 100)}÷${n} = ${d(q / 100)}; + ${d(hb / 100)} = ${d((q + hb) / 100)}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Decimal Fractions", file: "arithmetic-decimal-fractions-01.json", subtypes });
