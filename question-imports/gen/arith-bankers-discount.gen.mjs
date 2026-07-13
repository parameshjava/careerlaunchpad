// Arithmetic → Banker's Discount (200 Qs, ~50/tier). BD = SI on the face value,
// TD = true discount, BG = BD − TD; all built as exact integers via lcm(100,100+RT).
// Run: node question-imports/gen/arith-bankers-discount.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const PAIRS = [[10, 2], [5, 4], [20, 1], [25, 1], [5, 5], [25, 2], [10, 5], [25, 4], [20, 5], [20, 2], [10, 4], [10, 1], [5, 2], [15, 2], [10, 3], [20, 3], [15, 4], [10, 6]];

function base(ri) {
  const [R, T] = PAIRS[ri(0, PAIRS.length - 1)], rt = R * T, A = lcm(100, 100 + rt) * ri(1, 5);
  const TD = (A * rt) / (100 + rt), BD = (A * rt) / 100, BG = BD - TD, PW = A - TD;
  return { R, T, rt, A, TD, BD, BG, PW };
}

const subtypes = {
  easy: [
    (ri) => { const b = base(ri); return { stem: `Find the banker's discount on a bill of ₹${b.A} due ${b.T} year(s) hence at ${b.R}% per annum.`, answer: b.BD, explanation: `Banker's discount = simple interest on the face value = ${b.A}×${b.rt}/100 = ₹${b.BD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `Find the banker's gain on a bill of ₹${b.A} due ${b.T} year(s) hence at ${b.R}% per annum.`, answer: b.BG, explanation: `Banker's gain = BD − TD = ₹${b.BD} − ₹${b.TD} = ₹${b.BG}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The true discount on a bill is ₹${b.TD} and the banker's gain is ₹${b.BG}. Find the banker's discount.`, answer: b.BD, explanation: `Banker's discount = true discount + banker's gain = ₹${b.TD} + ₹${b.BG} = ₹${b.BD}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const b = base(ri); return { stem: `The true discount on a bill due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.TD}. Find the banker's gain.`, answer: b.BG, explanation: `Banker's gain = SI on the true discount = ${b.TD}×${b.rt}/100 = ₹${b.BG}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The banker's discount on a bill is ₹${b.BD} and the banker's gain is ₹${b.BG}. Find the true discount.`, answer: b.TD, explanation: `True discount = BD − BG = ₹${b.BD} − ₹${b.BG} = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `Find the banker's discount on ₹${b.A} for ${b.T} year(s) at ${b.R}% per annum.`, answer: b.BD, explanation: `BD = ${b.A}×${b.rt}/100 = ₹${b.BD}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const b = base(ri); return { stem: `The banker's discount on a bill due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.BD}. Find the face value of the bill.`, answer: b.A, explanation: `Face value = BD×100/RT = ${b.BD}×100/${b.rt} = ₹${b.A}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The banker's discount on a bill due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.BD}. Find the true discount.`, answer: b.TD, explanation: `TD = BD×100/(100+RT) = ${b.BD}×100/${100 + b.rt} = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `A bill of ₹${b.A} is due ${b.T} year(s) hence at ${b.R}% per annum. Find the banker's gain.`, answer: b.BG, explanation: `BG = BD − TD = ₹${b.BD} − ₹${b.TD} = ₹${b.BG}.`, unit: M }; },
  ],
  very_hard: [
    (ri) => { const b = base(ri); return { stem: `The banker's gain on a bill due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.BG}. Find the face value of the bill.`, answer: b.A, explanation: `From BG = F·(RT)²/[100(100+RT)], the face value F = ₹${b.A}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The banker's gain on a bill due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.BG}. Find the true discount.`, answer: b.TD, explanation: `TD = BG×100/RT = ${b.BG}×100/${b.rt} = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The banker's discount on a bill is ₹${b.BD} and the true discount is ₹${b.TD}. Find the sum due (face value).`, answer: b.A, explanation: `Face value = (BD×TD)/(BD−TD) = (${b.BD}×${b.TD})/(${b.BD}−${b.TD}) = ₹${b.A}.`, unit: M }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Banker's Discount", file: "arithmetic-bankers-discount-01.json", subtypes });
