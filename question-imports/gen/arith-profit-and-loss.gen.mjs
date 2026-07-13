// Arithmetic → Profit and Loss (200 Qs, ~50/tier). Answers computed exactly.
// Run: node question-imports/gen/arith-profit-and-loss.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, PCT = { post: "%" };

const subtypes = {
  easy: [
    (ri) => { const CP = ri(2, 50) * 10, SP = CP + ri(1, 20) * 10; return { stem: `An article is bought for ₹${CP} and sold for ₹${SP}. Find the profit.`, answer: SP - CP, explanation: `Profit = SP − CP = ₹${SP} − ₹${CP} = ₹${SP - CP}.`, unit: M }; },
    (ri) => { const CP = ri(1, 40) * 100, p = ri(5, 40), SP = (CP * (100 + p)) / 100; return { stem: `An article costing ₹${CP} is sold for ₹${SP}. Find the profit percent.`, answer: p, explanation: `Profit% = (SP − CP)/CP × 100 = (${SP} − ${CP})/${CP} × 100 = ${p}%.`, unit: PCT }; },
    (ri) => { const CP = ri(1, 40) * 100, p = ri(5, 50); return { stem: `Find the selling price of an article bought for ₹${CP} and sold at a profit of ${p}%.`, answer: (CP * (100 + p)) / 100, explanation: `SP = CP × (100+${p})/100 = ₹${(CP * (100 + p)) / 100}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const CP = ri(1, 40) * 100, p = ri(5, 50), SP = (CP * (100 + p)) / 100; return { stem: `By selling an article for ₹${SP}, a man gains ${p}%. Find the cost price.`, answer: CP, explanation: `CP = SP × 100/(100+${p}) = ${SP} × 100/${100 + p} = ₹${CP}.`, unit: M }; },
    (ri) => { const CP = ri(2, 40) * 100, l = ri(5, 40), SP = (CP * (100 - l)) / 100; return { stem: `An article costing ₹${CP} is sold for ₹${SP}. Find the loss percent.`, answer: l, explanation: `Loss% = (CP − SP)/CP × 100 = (${CP} − ${SP})/${CP} × 100 = ${l}%.`, unit: PCT }; },
    (ri) => { const CP = ri(2, 40) * 100, l = ri(5, 40), SP = (CP * (100 - l)) / 100; return { stem: `By selling an article for ₹${SP}, a man loses ${l}%. Find the cost price.`, answer: CP, explanation: `CP = SP × 100/(100−${l}) = ${SP} × 100/${100 - l} = ₹${CP}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const CP = ri(2, 30) * 100, P = ri(5, 25), L = ri(5, 25), d = (CP * (P + L)) / 100; return { stem: `By selling an article, a man loses ${L}%. Had he sold it for ₹${d} more, he would have gained ${P}%. Find the cost price.`, answer: CP, explanation: `₹${d} corresponds to (${P}+${L})% = ${P + L}% of CP, so CP = ${d} × 100/${P + L} = ₹${CP}.`, unit: M }; },
    (ri) => { const x = [10, 20, 30, 40, 50][ri(0, 4)]; return { stem: `Two articles are sold at the same price. On one there is a gain of ${x}% and on the other a loss of ${x}%. Find the overall loss percent.`, answer: (x * x) / 100, explanation: `When gain% = loss% = ${x}, there is always a net loss of (${x}/10)² = ${(x * x) / 100}%.`, unit: PCT }; },
    (ri) => { const o = [[25, 20, 25], [12, 10, 20], [15, 12, 25], [6, 5, 20], [21, 20, 5]][ri(0, 4)]; return { stem: `The cost price of ${o[0]} articles is equal to the selling price of ${o[1]} articles. Find the gain percent.`, answer: o[2], explanation: `Gain% = (${o[0]} − ${o[1]})/${o[1]} × 100 = ${o[2]}%.`, unit: PCT }; },
  ],
  very_hard: [
    (ri) => { const o = [[40, 10, 26], [20, 10, 8], [50, 20, 20], [30, 10, 17], [25, 4, 20], [60, 25, 20]][ri(0, 5)]; return { stem: `A shopkeeper marks his goods ${o[0]}% above cost price and then allows a discount of ${o[1]}%. Find his profit percent.`, answer: o[2], explanation: `Profit% = [(100+${o[0]})/100 × (100−${o[1]})/100 − 1] × 100 = ${o[2]}%.`, unit: PCT }; },
    (ri) => { const o = [[800, 25], [625, 60], [500, 100]][ri(0, 2)]; return { stem: `A dishonest dealer sells his goods at cost price but uses a weight of ${o[0]} grams in place of 1 kilogram. Find his gain percent.`, answer: o[1], explanation: `Gain% = (1000 − ${o[0]})/${o[0]} × 100 = ${o[1]}%.`, unit: PCT }; },
    (ri) => { const a = ri(2, 8) * 3, b = ri(2, 8) * 3; if (a === b) return null; return { stem: `A merchant sells one-third of his goods at a profit of ${a}% and the remaining two-thirds at a profit of ${b}%. Find his overall profit percent on the whole lot.`, answer: (a + 2 * b) / 3, explanation: `Overall profit% = (1/3)×${a} + (2/3)×${b} = (${a} + ${2 * b})/3 = ${(a + 2 * b) / 3}%.`, unit: PCT }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Profit and Loss", file: "arithmetic-profit-and-loss-01.json", subtypes });
