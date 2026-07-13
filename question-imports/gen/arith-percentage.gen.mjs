// Arithmetic → Percentage (200 Qs, ~50/tier). Answers built to be exact.
// Run: node question-imports/gen/arith-percentage.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, PCT = { post: "%" };

const subtypes = {
  easy: [
    (ri) => { const m = ri(2, 50), N = m * 100, x = ri(5, 95); return { stem: `Find ${x}% of ${N}.`, answer: x * m, explanation: `${x}% of ${N} = ${x}/100 × ${N} = ${x * m}.` }; },
    (ri) => { const p = ri(1, 19) * 5, b = ri(2, 25) * 20, a = (p * b) / 100; return { stem: `What percent of ${b} is ${a}?`, answer: p, explanation: `(${a} ÷ ${b}) × 100 = ${p}%.`, unit: PCT }; },
    (ri) => { const m = ri(2, 50), N = m * 100, x = ri(5, 60); return { stem: `If ${N} is increased by ${x}%, what is the new value?`, answer: N + x * m, explanation: `Increase = ${x}% of ${N} = ${x * m}; new value = ${N} + ${x * m} = ${N + x * m}.` }; },
  ],
  medium: [
    (ri) => { const m = ri(2, 50), N = m * 100, x = ri(2, 25), y = x * m; return { stem: `${x}% of a number is ${y}. Find the number.`, answer: N, explanation: `Number = ${y} × 100 / ${x} = ${N}.` }; },
    (ri) => { const mx = ri(2, 10) * 100, x = ri(20, 80), M2 = (x * mx) / 100; if (!Number.isInteger(M2)) return null; return { stem: `A student scored ${x}% in an examination and obtained ${M2} marks. Find the maximum marks.`, answer: mx, explanation: `Maximum marks = ${M2} × 100 / ${x} = ${mx}.` }; },
    (ri) => { const m = ri(2, 40), orig = m * 100, x = ri(5, 50), V = orig + x * m; return { stem: `After an increase of ${x}%, the price of an item became ₹${V}. Find the original price.`, answer: orig, explanation: `Original × (100+${x})/100 = ${V} ⇒ original = ₹${orig}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const N = ri(1, 5) * 10000, x = ri(10, 30), y = ri(10, 30), v = (N * (100 + x) * (100 - y)) / 10000; if (!Number.isInteger(v)) return null; return { stem: `The number ${N} is first increased by ${x}% and then the result is decreased by ${y}%. Find the final value.`, answer: v, explanation: `Final = ${N} × ${100 + x}/100 × ${100 - y}/100 = ${v}.` }; },
    (ri) => { const o = [[25, 20], [100, 50], [150, 60], [300, 75], [400, 80], [900, 90]][ri(0, 5)]; return { stem: `A's income is ${o[0]}% more than B's income. By what percent is B's income less than A's?`, answer: o[1], explanation: `Required % = ${o[0]}/(100+${o[0]}) × 100 = ${o[1]}%.`, unit: PCT }; },
    (ri) => { const o = [[25, 20], [100, 50], [400, 80], [300, 75], [150, 60]][ri(0, 4)]; return { stem: `The price of sugar increases by ${o[0]}%. By what percent must a family reduce its consumption so that its expenditure on sugar remains unchanged?`, answer: o[1], explanation: `Reduction % = ${o[0]}/(100+${o[0]}) × 100 = ${o[1]}%.`, unit: PCT }; },
  ],
  very_hard: [
    (ri) => { const o = [[20, 10, 28], [10, 10, 19], [20, 20, 36], [25, 20, 40], [30, 10, 37], [40, 10, 46], [50, 20, 60]][ri(0, 6)]; return { stem: `Find the single discount that is equivalent to two successive discounts of ${o[0]}% and ${o[1]}%.`, answer: o[2], explanation: `Net = [1 − (1−${o[0]}/100)(1−${o[1]}/100)] × 100 = ${o[2]}%.`, unit: PCT }; },
    (ri) => { const total = ri(2, 20) * 100, x = ri(40, 90), F = ((100 - x) * total) / 100; if (!Number.isInteger(F) || F <= 0) return null; return { stem: `In an examination, ${x}% of the students passed and ${F} students failed. Find the total number of students who appeared.`, answer: total, explanation: `Failures = (100−${x})% of total = ${F} ⇒ total = ${F} × 100 / ${100 - x} = ${total}.` }; },
    (ri) => { const total = ri(5, 40) * 100, x = ri(51, 80), V = ((2 * x - 100) * total) / 100; if (!Number.isInteger(V) || V <= 0) return null; return { stem: `In an election between two candidates, the winner secured ${x}% of the valid votes and won by ${V} votes. Find the total number of valid votes.`, answer: total, explanation: `Margin = (2×${x}−100)% of total = ${V} ⇒ total = ${V} × 100 / ${2 * x - 100} = ${total}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Percentage", file: "arithmetic-percentage-01.json", subtypes });
