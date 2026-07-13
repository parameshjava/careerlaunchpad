// Arithmetic → Pipes and Cisterns (200 Qs, ~50/tier). Rate-based results use curated
// integer-answer sets. Run: node question-imports/gen/arith-pipes-and-cisterns.gen.mjs
import { run } from "./lib.mjs";
const H = { post: " hours" }, LIT = { post: " litres" };

const PAIRS = [[12, 6, 4], [10, 15, 6], [20, 30, 12], [12, 24, 8], [6, 3, 2], [15, 10, 6], [9, 18, 6], [20, 5, 4], [12, 4, 3], [8, 8, 4], [30, 20, 12], [18, 9, 6], [40, 10, 8], [36, 12, 9], [24, 8, 6], [14, 35, 10], [30, 45, 18], [20, 80, 16]];
const FILLEMPTY = [[6, 12, 12], [10, 15, 30], [4, 6, 12], [8, 12, 24], [9, 18, 18], [12, 24, 24], [15, 30, 30], [6, 18, 9], [8, 24, 12], [20, 30, 60], [9, 12, 36], [10, 30, 15], [6, 24, 8], [12, 36, 18], [10, 20, 20], [15, 20, 60], [8, 16, 16], [12, 20, 30], [9, 36, 12], [14, 42, 21], [6, 10, 15], [12, 15, 60], [8, 10, 40], [18, 24, 72]];
const TRIPLES = [[6, 12, 12, 3], [4, 6, 12, 2], [10, 15, 30, 5], [8, 12, 24, 4], [6, 9, 18, 3], [12, 18, 36, 6], [9, 12, 18, 4], [20, 30, 60, 10], [12, 15, 20, 5], [10, 12, 15, 4], [6, 10, 15, 3], [4, 8, 8, 2], [12, 16, 48, 6], [6, 12, 4, 2]];
const CE = [[12, 15, 20, 10], [6, 12, 8, 8], [20, 30, 60, 15], [8, 12, 24, 6], [10, 20, 20, 10], [10, 15, 12, 12], [8, 24, 12, 12], [12, 15, 10, 20], [6, 8, 24, 4]];

const subtypes = {
  easy: [
    (ri) => { const [a, b, t] = PAIRS[ri(0, PAIRS.length - 1)]; return { stem: `Two pipes can fill a tank in ${a} hours and ${b} hours respectively. If both are opened together, in how many hours will the tank be filled?`, answer: t, explanation: `Combined one-hour work = 1/${a} + 1/${b}, so the tank fills in ${t} hours.`, unit: H }; },
    (ri) => { const k = ri(2, 5), a = k * ri(3, 10); return { stem: `A pipe can fill a tank in ${a} hours. In how many hours can ${k} such identical pipes fill it?`, answer: a / k, explanation: `${k} pipes work ${k} times as fast, so time = ${a}/${k} = ${a / k} hours.`, unit: H }; },
    (ri) => { const h = ri(2, 20); return { stem: `A pipe fills exactly half of a tank in ${h} hours. How long will it take to fill the whole tank?`, answer: 2 * h, explanation: `The full tank takes twice as long: 2 × ${h} = ${2 * h} hours.`, unit: H }; },
  ],
  medium: [
    (ri) => { const [a, b, t] = FILLEMPTY[ri(0, FILLEMPTY.length - 1)]; return { stem: `A pipe can fill a tank in ${a} hours, but a leak can empty the full tank in ${b} hours. If both operate together, in how many hours will the tank be filled?`, answer: t, explanation: `Net one-hour work = 1/${a} − 1/${b}, so the tank fills in ${t} hours.`, unit: H }; },
    (ri) => { const [a, b, c, t] = TRIPLES[ri(0, TRIPLES.length - 1)]; return { stem: `Three pipes can fill a tank in ${a}, ${b} and ${c} hours respectively. If all are opened together, in how many hours will the tank be filled?`, answer: t, explanation: `Combined rate = 1/${a} + 1/${b} + 1/${c}, so the tank fills in ${t} hours.`, unit: H }; },
    (ri) => { const [a, b, net] = FILLEMPTY[ri(0, FILLEMPTY.length - 1)]; return { stem: `A cistern normally fills in ${a} hours, but because of a leak it takes ${net} hours. In how many hours can the leak alone empty the full cistern?`, answer: b, explanation: `Leak's rate = 1/${a} − 1/${net}, so the leak empties the cistern in ${b} hours.`, unit: H }; },
  ],
  hard: [
    (ri) => { const [a, b, c, t] = CE[ri(0, CE.length - 1)]; return { stem: `Two pipes can fill a tank in ${a} and ${b} hours, while a third pipe can empty the full tank in ${c} hours. If all three are opened together, in how many hours will the tank be filled?`, answer: t, explanation: `Net rate = 1/${a} + 1/${b} − 1/${c}, so the tank fills in ${t} hours.`, unit: H }; },
    (ri) => { const [a, b, t] = PAIRS[ri(0, PAIRS.length - 1)]; if (a === b) return null; return { stem: `Two pipes together can fill a tank in ${t} hours. If one pipe alone fills it in ${a} hours, in how many hours can the other pipe alone fill it?`, answer: b, explanation: `Second pipe's rate = 1/${t} − 1/${a}, so it fills the tank in ${b} hours.`, unit: H }; },
    (ri) => { const [a, b, net] = FILLEMPTY[ri(0, FILLEMPTY.length - 1)]; return { stem: `A tank can be filled by a pipe in ${a} hours. A leak can empty the full tank in ${b} hours. How much extra time (in hours) does it take to fill the tank when the leak is also present?`, answer: net - a, explanation: `With the leak it fills in ${net} hours instead of ${a}, i.e. ${net} − ${a} = ${net - a} hours extra.`, unit: H }; },
  ],
  very_hard: [
    (ri) => { const L = ri(6, 20), E = L + ri(2, 10), r = ri(2, 12), C = (r * L * E) / (E - L); if (!Number.isInteger(C)) return null; return { stem: `A leak can empty a full tank in ${L} hours. An inlet pipe admits water at ${r} litres per hour. With the inlet open, the full tank is emptied in ${E} hours. Find the capacity of the tank.`, answer: C, explanation: `C/${L} − ${r} = C/${E} ⇒ C = ${r}×${L}×${E}/(${E}−${L}) = ${C} litres.`, unit: LIT }; },
    (ri) => { const [a, b, c, t] = CE[ri(0, CE.length - 1)]; return { stem: `Two pipes can fill a tank in ${a} and ${b} hours. With all three pipes open (including a waste pipe), the tank fills in ${t} hours. In how many hours can the waste pipe alone empty the full tank?`, answer: c, explanation: `Waste pipe's rate = 1/${a} + 1/${b} − 1/${t}, so it empties the tank in ${c} hours.`, unit: H }; },
    (ri) => { const [a, b, net] = FILLEMPTY[ri(0, FILLEMPTY.length - 1)]; return { stem: `A leak can empty a full tank in ${b} hours. When a filling pipe is also opened, the tank gets filled in ${net} hours. In how many hours can the filling pipe alone fill the tank?`, answer: a, explanation: `Filling pipe's rate = 1/${net} + 1/${b}, so it fills the tank in ${a} hours.`, unit: H }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Pipes and Cisterns", file: "arithmetic-pipes-and-cisterns-01.json", subtypes });
