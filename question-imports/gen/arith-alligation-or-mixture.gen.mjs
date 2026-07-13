// Arithmetic → Alligation or Mixture (200 Qs, ~50/tier). Answers computed exactly.
// Run: node question-imports/gen/arith-alligation-or-mixture.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, L = { post: " litres" }, KG = { post: " kg" };
const ipow = (b, e) => { let r = 1; for (let i = 0; i < e; i++) r *= b; return r; };
const FRAC = [[1, 2], [2, 3], [3, 4], [4, 5], [1, 3], [2, 5], [3, 5], [5, 6]];

const subtypes = {
  easy: [
    (ri) => { const p1 = ri(10, 40), p2 = ri(45, 90), m = ri(1, 6), n = ri(1, 6); if ((m * p1 + n * p2) % (m + n) !== 0) return null; return { stem: `Two varieties of rice costing ₹${p1} and ₹${p2} per kg are mixed in the ratio ${m}:${n}. Find the cost per kg of the mixture.`, answer: (m * p1 + n * p2) / (m + n), explanation: `Mean price = (${m}×${p1} + ${n}×${p2})/(${m}+${n}) = ₹${(m * p1 + n * p2) / (m + n)} per kg.`, unit: M }; },
    (ri) => { const m = ri(2, 9), n = ri(1, 8), V = (m + n) * ri(5, 20); return { stem: `A ${V}-litre mixture contains milk and water in the ratio ${m}:${n}. Find the quantity of milk.`, answer: (V * m) / (m + n), explanation: `Milk = ${V} × ${m}/${m + n} = ${(V * m) / (m + n)} litres.`, unit: L }; },
    (ri) => { const m = ri(1, 6), n = ri(2, 9), T = (m + n) * ri(3, 15); return { stem: `In ${T} kg of a mixture of two grains, the cheaper and the dearer grains are in the ratio ${m}:${n}. Find the quantity of the dearer grain.`, answer: (T * n) / (m + n), explanation: `Dearer grain = ${T} × ${n}/${m + n} = ${(T * n) / (m + n)} kg.`, unit: KG }; },
  ],
  medium: [
    (ri) => { const p1 = ri(10, 30), rd = ri(1, 8), rc = ri(1, 8), mean = p1 + rd, p2 = mean + rc, T = (rc + rd) * ri(2, 10); return { stem: `In what quantity must rice at ₹${p1}/kg be mixed with rice at ₹${p2}/kg so that ${T} kg of the mixture is worth ₹${mean}/kg? Find the quantity of the cheaper rice.`, answer: (T * rc) / (rc + rd), explanation: `By alligation, cheaper:dearer = (${p2}−${mean}):(${mean}−${p1}) = ${rc}:${rd}; cheaper = ${T} × ${rc}/${rc + rd} = ${(T * rc) / (rc + rd)} kg.`, unit: KG }; },
    (ri) => { const m = ri(2, 8), n = ri(1, 7), V = m * ri(3, 15); return { stem: `How much water must be added to ${V} litres of pure milk so that the ratio of milk to water becomes ${m}:${n}?`, answer: (V * n) / m, explanation: `Milk stays ${V} litres = ${m} parts, so 1 part = ${V / m} litres; water = ${n} parts = ${(V * n) / m} litres.`, unit: L }; },
    (ri) => { const a = ri(5, 30), b = ri(5, 30), p1 = ri(20, 40), p2 = ri(41, 70), sp = ri(45, 80); const profit = (a + b) * sp - (a * p1 + b * p2); if (profit <= 0) return null; return { stem: `A shopkeeper mixes ${a} kg of rice at ₹${p1}/kg with ${b} kg at ₹${p2}/kg and sells the whole mixture at ₹${sp}/kg. Find his total profit.`, answer: profit, explanation: `Cost = ${a}×${p1} + ${b}×${p2} = ₹${a * p1 + b * p2}; sale = ${a + b}×${sp} = ₹${(a + b) * sp}; profit = ₹${profit}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const p1 = ri(10, 30), rd = ri(1, 8), rc = ri(1, 8), mean = p1 + rd, p2 = mean + rc, T = (rc + rd) * ri(2, 10); return { stem: `${T} kg of a mixture of two types of tea (costing ₹${p1}/kg and ₹${p2}/kg) is worth ₹${mean}/kg. Find the quantity of the dearer tea in the mixture.`, answer: (T * rd) / (rc + rd), explanation: `By alligation, cheaper:dearer = ${rc}:${rd}; dearer = ${T} × ${rd}/${rc + rd} = ${(T * rd) / (rc + rd)} kg.`, unit: KG }; },
    (ri) => { const a = ri(2, 6), b = ri(1, 5), V = (a + b) * ri(3, 10), milk = (V * a) / (a + b), wOld = (V * b) / (a + b), c = ri(1, 4), d = ri(c + 1, 6); const W = (milk * d) / c - wOld; if (!Number.isInteger(W) || W <= 0) return null; return { stem: `A ${V}-litre mixture contains milk and water in the ratio ${a}:${b}. How much water must be added so that the ratio of milk to water becomes ${c}:${d}?`, answer: W, explanation: `Milk = ${milk} L (unchanged); required water = ${milk}×${d}/${c} − ${wOld} = ${W} litres.`, unit: L }; },
    (ri) => { const a1 = ri(2, 6), b1 = ri(1, 5), a2 = ri(2, 6), b2 = ri(1, 5), V1 = (a1 + b1) * ri(3, 10), V2 = (a2 + b2) * ri(3, 10); const milk = (V1 * a1) / (a1 + b1) + (V2 * a2) / (a2 + b2); return { stem: `Vessel A holds ${V1} litres of a milk-water mixture in the ratio ${a1}:${b1}, and vessel B holds ${V2} litres in the ratio ${a2}:${b2}. If both are poured into one large vessel, find the total quantity of milk.`, answer: milk, explanation: `Milk = ${V1}×${a1}/${a1 + b1} + ${V2}×${a2}/${a2 + b2} = ${milk} litres.`, unit: L }; },
  ],
  very_hard: [
    (ri) => { const [p, q] = FRAC[ri(0, FRAC.length - 1)], n = ri(2, 3), base = ri(1, 4), V = base * ipow(q, n), x = base * ipow(q, n - 1) * (q - p); return { stem: `A vessel contains ${V} litres of pure milk. ${x} litres of milk is drawn out and replaced with water; this operation is performed ${n} times in all. Find the quantity of milk left in the vessel.`, answer: base * ipow(p, n), explanation: `Milk left = ${V} × (1 − ${x}/${V})^${n} = ${V} × (${p}/${q})^${n} = ${base * ipow(p, n)} litres.`, unit: L }; },
    (ri) => { const a = ri(5, 30), b = ri(5, 30), p1 = ri(20, 40), p2 = ri(41, 70); if ((a * p1 + b * p2) % (a + b) !== 0) return null; return { stem: `${a} kg of sugar costing ₹${p1}/kg is mixed with ${b} kg costing ₹${p2}/kg. Find the average price of the mixture per kg.`, answer: (a * p1 + b * p2) / (a + b), explanation: `Average price = (${a}×${p1} + ${b}×${p2})/(${a}+${b}) = ₹${(a * p1 + b * p2) / (a + b)} per kg.`, unit: M }; },
    (ri) => { const [p, q] = FRAC[ri(0, FRAC.length - 1)], n = ri(2, 3), base = ri(1, 4), V = base * ipow(q, n), x = base * ipow(q, n - 1) * (q - p); return { stem: `A vessel is full with ${V} litres of pure milk. Each time, some milk is drawn out and replaced with water; after ${n} such operations the milk left is ${base * ipow(p, n)} litres. Find how many litres were drawn out each time.`, answer: x, explanation: `Milk left = ${V}(1 − x/${V})^${n} = ${base * ipow(p, n)} ⇒ x = ${x} litres each time.`, unit: L }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Alligation or Mixture", file: "arithmetic-alligation-or-mixture-01.json", subtypes });
