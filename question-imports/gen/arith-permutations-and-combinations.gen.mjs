// Arithmetic → Permutations and Combinations (200 Qs, ~50/tier). Exact integer
// counts via factorial/nPr/nCr. Run: node .../arith-permutations-and-combinations.gen.mjs
import { run } from "./lib.mjs";
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const nPr = (n, r) => fact(n) / fact(n - r);
const nCr = (n, r) => fact(n) / (fact(r) * fact(n - r));
const DISTINCT = ["CHAIR", "BLACK", "TABLE", "NUMBER", "PLANET", "GARDEN", "MONKEY", "DANGER"];
const REPEAT = [["BALLOON", 7, [2, 2]], ["LETTER", 6, [2, 2]], ["SUCCESS", 7, [3, 2]], ["BANANA", 6, [3, 2]], ["APPLE", 5, [2]], ["COFFEE", 6, [2, 2]]];

const subtypes = {
  easy: [
    (ri) => { const n = ri(3, 8); return { stem: `Find the value of ${n}! (${n} factorial).`, answer: fact(n), explanation: `${n}! = 1×2×…×${n} = ${fact(n)}.` }; },
    (ri) => { const n = ri(4, 8), r = ri(1, n - 1); return { stem: `Find the number of ways of choosing ${r} objects out of ${n} distinct objects, i.e. C(${n}, ${r}).`, answer: nCr(n, r), explanation: `C(${n},${r}) = ${n}!/(${r}!·${n - r}!) = ${nCr(n, r)}.` }; },
    (ri) => { const n = ri(4, 9), r = ri(1, 4); return { stem: `Find the number of ways of arranging ${r} objects out of ${n} distinct objects, i.e. P(${n}, ${r}).`, answer: nPr(n, r), explanation: `P(${n},${r}) = ${n}!/${n - r}! = ${nPr(n, r)}.` }; },
  ],
  medium: [
    (ri) => { const W = DISTINCT[ri(0, DISTINCT.length - 1)], n = W.length; return { stem: `In how many ways can all the letters of the word ${W} be arranged (all letters are distinct)?`, answer: fact(n), explanation: `${n} distinct letters can be arranged in ${n}! = ${fact(n)} ways.` }; },
    (ri) => { const n = ri(8, 12), r = ri(2, 4); return { stem: `Find the value of C(${n}, ${r}).`, answer: nCr(n, r), explanation: `C(${n},${r}) = ${nCr(n, r)}.` }; },
    (ri) => { const n = ri(6, 12), r = ri(2, 5); return { stem: `In how many ways can a committee of ${r} members be selected from ${n} people?`, answer: nCr(n, r), explanation: `Number of ways = C(${n},${r}) = ${nCr(n, r)}.` }; },
  ],
  hard: [
    (ri) => { const [W, n, reps] = REPEAT[ri(0, REPEAT.length - 1)]; const d = reps.reduce((p, c) => p * fact(c), 1); return { stem: `In how many distinct ways can all the letters of the word ${W} be arranged?`, answer: fact(n) / d, explanation: `${n} letters with repeats give ${n}!/(${reps.map((c) => c + "!").join("·")}) = ${fact(n) / d} arrangements.` }; },
    (ri) => { const x = ri(4, 8), a = ri(1, 3), y = ri(4, 8), b = ri(1, 3); return { stem: `In how many ways can ${a} men be chosen from ${x} men and ${b} women from ${y} women?`, answer: nCr(x, a) * nCr(y, b), explanation: `Ways = C(${x},${a}) × C(${y},${b}) = ${nCr(x, a)} × ${nCr(y, b)} = ${nCr(x, a) * nCr(y, b)}.` }; },
    (ri) => { const n = ri(8, 12), r = ri(2, 4); return { stem: `Find the value of P(${n}, ${r}).`, answer: nPr(n, r), explanation: `P(${n},${r}) = ${n}!/${n - r}! = ${nPr(n, r)}.` }; },
  ],
  very_hard: [
    (ri) => { const n = ri(4, 10); return { stem: `In how many ways can ${n} people be seated around a circular table?`, answer: fact(n - 1), explanation: `Circular arrangements of ${n} people = (${n}−1)! = ${fact(n - 1)}.` }; },
    (ri) => { const n = ri(5, 30); return { stem: `Find the number of diagonals in a polygon of ${n} sides.`, answer: (n * (n - 3)) / 2, explanation: `Diagonals = n(n−3)/2 = ${n}×${n - 3}/2 = ${(n * (n - 3)) / 2}.` }; },
    (ri) => { const n = ri(5, 40); return { stem: `At a party, every person shakes hands with every other person exactly once. If there are ${n} persons, find the total number of handshakes.`, answer: (n * (n - 1)) / 2, explanation: `Handshakes = C(${n},2) = ${n}×${n - 1}/2 = ${(n * (n - 1)) / 2}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Permutations and Combinations", file: "arithmetic-permutations-and-combinations-01.json", subtypes });
