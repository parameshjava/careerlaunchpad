// Arithmetic → True Discount (200 Qs, ~50/tier). Sums due are built as multiples
// of lcm(100, 100+RT) so present worth, true discount and SI are all exact integers.
// Run: node question-imports/gen/arith-true-discount.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, PCT = { post: "%" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const PAIRS = [[10, 2], [5, 4], [20, 1], [25, 1], [5, 5], [25, 2], [10, 5], [25, 4], [20, 5], [20, 2], [10, 4], [10, 1], [5, 2], [15, 2], [10, 3], [20, 3], [15, 4], [10, 6]];

// Return {R,T,rt,A,PW,TD,SI} for a random pair and multiplier.
function base(ri) {
  const [R, T] = PAIRS[ri(0, PAIRS.length - 1)], rt = R * T, A = lcm(100, 100 + rt) * ri(1, 5);
  const TD = (A * rt) / (100 + rt), PW = A - TD, SI = (A * rt) / 100;
  return { R, T, rt, A, PW, TD, SI };
}

const subtypes = {
  easy: [
    (ri) => { const b = base(ri); return { stem: `A sum of ₹${b.A} is due ${b.T} year(s) hence. Find its present worth at ${b.R}% per annum (true discount method).`, answer: b.PW, explanation: `PW = 100×A/(100+RT) = 100×${b.A}/(100+${b.rt}) = ₹${b.PW}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `Find the true discount on ₹${b.A} due ${b.T} year(s) hence at ${b.R}% per annum.`, answer: b.TD, explanation: `TD = A×RT/(100+RT) = ${b.A}×${b.rt}/(100+${b.rt}) = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The present worth of a sum due later is ₹${b.PW} and the true discount on it is ₹${b.TD}. Find the sum due.`, answer: b.A, explanation: `Sum due = present worth + true discount = ₹${b.PW} + ₹${b.TD} = ₹${b.A}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const b = base(ri); return { stem: `The present worth of a bill is ₹${b.PW}. Find the true discount if the rate is ${b.R}% per annum and the bill is due in ${b.T} year(s).`, answer: b.TD, explanation: `TD = PW×RT/100 = ${b.PW}×${b.rt}/100 = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The true discount on a bill due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.TD}. Find the sum due (face value).`, answer: b.A, explanation: `Sum due = TD×(100+RT)/RT = ${b.TD}×${100 + b.rt}/${b.rt} = ₹${b.A}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The true discount on a certain sum due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.TD}. Find the present worth.`, answer: b.PW, explanation: `PW = TD×100/RT = ${b.TD}×100/${b.rt} = ₹${b.PW}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const b = base(ri); return { stem: `Find the true discount on a bill of ₹${b.A} due ${b.T} year(s) hence, the rate of interest being ${b.R}% per annum.`, answer: b.TD, explanation: `TD = ${b.A}×${b.rt}/(100+${b.rt}) = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `A debt of ₹${b.A} is due ${b.T} year(s) hence. If money is worth ${b.R}% per annum, find the present worth of the debt.`, answer: b.PW, explanation: `PW = 100×${b.A}/(100+${b.rt}) = ₹${b.PW}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The present worth of a debt due ${b.T} year(s) hence at ${b.R}% per annum is ₹${b.PW}. Find the amount of the debt.`, answer: b.A, explanation: `Debt = PW×(100+RT)/100 = ${b.PW}×${100 + b.rt}/100 = ₹${b.A}.`, unit: M }; },
  ],
  very_hard: [
    (ri) => { const b = base(ri); return { stem: `Find the difference between the simple interest and the true discount on ₹${b.A} due ${b.T} year(s) hence at ${b.R}% per annum.`, answer: b.SI - b.TD, explanation: `SI = ₹${b.SI}, TD = ₹${b.TD}, so the difference = ₹${b.SI - b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `The simple interest on a certain sum for ${b.T} year(s) at ${b.R}% per annum is ₹${b.SI}. Find the true discount on the same sum for the same time and rate.`, answer: b.TD, explanation: `TD = SI×100/(100+RT) = ${b.SI}×100/${100 + b.rt} = ₹${b.TD}.`, unit: M }; },
    (ri) => { const b = base(ri); return { stem: `A sum of ₹${b.A} due ${b.T} year(s) hence has a present worth of ₹${b.PW}. Find the rate of interest per annum.`, answer: b.R, explanation: `TD = ₹${b.TD}; rate = TD×100/(PW×T) = ${b.TD}×100/(${b.PW}×${b.T}) = ${b.R}%.`, unit: PCT }; },
  ],
};

run({ subject: "Arithmetic", chapter: "True Discount", file: "arithmetic-true-discount-01.json", subtypes });
