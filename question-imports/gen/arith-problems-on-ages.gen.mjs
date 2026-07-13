// Arithmetic → Problems on Ages (200 Qs, ~50/tier). Answers built first, givens
// derived, so every age is a whole number. Run: node .../arith-problems-on-ages.gen.mjs
import { run } from "./lib.mjs";
const Y = { post: " years" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const coprime = (ri) => { let m, n; do { m = ri(2, 9); n = ri(2, 9); } while (m === n || gcd(m, n) !== 1); return [m, n]; };

const subtypes = {
  easy: [
    (ri) => { const A = ri(5, 60), n = ri(1, 20); return { stem: `A person's present age is ${A} years. What will his age be after ${n} years?`, answer: A + n, explanation: `${A} + ${n} = ${A + n} years.`, unit: Y }; },
    (ri) => { const A = ri(20, 70), n = ri(1, 15); return { stem: `A person is ${A} years old today. What was his age ${n} years ago?`, answer: A - n, explanation: `${A} − ${n} = ${A - n} years.`, unit: Y }; },
    (ri) => { const b = ri(5, 50), x = ri(1, 30); return { stem: `A is ${x} years older than B. If B is ${b} years old, find A's age.`, answer: b + x, explanation: `${b} + ${x} = ${b + x} years.`, unit: Y }; },
  ],
  medium: [
    (ri) => { const [m, n] = coprime(ri), S = (m + n) * ri(3, 12); return { stem: `The ages of A and B are in the ratio ${m}:${n} and the sum of their ages is ${S} years. Find the age of the elder.`, answer: (S * Math.max(m, n)) / (m + n), explanation: `Elder's age = ${S} × ${Math.max(m, n)}/${m + n} = ${(S * Math.max(m, n)) / (m + n)} years.`, unit: Y }; },
    (ri) => { const S = ri(5, 25), t = ri(2, 15), F = 2 * S + t; return { stem: `A father is ${F} years old and his son is ${S} years old. In how many years will the father be twice as old as his son?`, answer: t, explanation: `After t years: ${F}+t = 2(${S}+t) ⇒ t = ${F} − 2×${S} = ${t} years.`, unit: Y }; },
    (ri) => { const Yg = ri(5, 40), x = ri(2, 20), E = Yg + x, S = E + Yg; return { stem: `The sum of the ages of A and B is ${S} years and A is ${x} years older than B. Find A's age.`, answer: E, explanation: `A's age = (sum + difference)/2 = (${S} + ${x})/2 = ${E} years.`, unit: Y }; },
  ],
  hard: [
    (ri) => { const y2 = ri(2, 3), x = ri(y2 + 1, 6), t = ri(1, 6), S = t * (y2 - 1), k = (x - y2) * t; if (S < 1 || k < 1) return null; return { stem: `A father is ${x} times as old as his son. After ${k} years, he will be ${y2} times as old as his son. Find the son's present age.`, answer: S, explanation: `Let the son be s. ${x}s + ${k} = ${y2}(s + ${k}) ⇒ s = ${S} years.`, unit: Y }; },
    (ri) => { const [m, n] = coprime(ri), u = ri(2, 8), k = ri(2, 12), g = gcd(m * u + k, n * u + k); return { stem: `The present ages of A and B are in the ratio ${m}:${n}. After ${k} years, their ages will be in the ratio ${(m * u + k) / g}:${(n * u + k) / g}. Find the present age of the elder.`, answer: Math.max(m, n) * u, explanation: `Ages are ${m}×${u} and ${n}×${u}; the elder is ${Math.max(m, n) * u} years.`, unit: Y }; },
    (ri) => { const s = ri(6, 25), y = ri(1, s - 1), x = ri(2, 4), f = x * (s - y) + y, S = f + s; return { stem: `The sum of the present ages of a father and his son is ${S} years. ${y} years ago, the father was ${x} times as old as his son. Find the son's present age.`, answer: s, explanation: `${y} years ago: father = ${x} × son. Solving with sum ${S} gives the son's present age = ${s} years.`, unit: Y }; },
  ],
  very_hard: [
    (ri) => { const a = ri(1, 7), b = ri(1, 7), c = ri(1, 7), S = (a + b + c) * ri(2, 10), mn = Math.min(a, b, c); return { stem: `The ages of three friends are in the ratio ${a}:${b}:${c} and the sum of their ages is ${S} years. Find the age of the youngest.`, answer: (S * mn) / (a + b + c), explanation: `Youngest's age = ${S} × ${mn}/${a + b + c} = ${(S * mn) / (a + b + c)} years.`, unit: Y }; },
    (ri) => { const y2 = ri(2, 3), x = ri(y2 + 1, 6), t = ri(1, 6), S = t * (y2 - 1), k = (x - y2) * t; if (S < 1 || k < 1) return null; return { stem: `A father is ${x} times as old as his son. After ${k} years, he will be ${y2} times as old as his son. Find the father's present age.`, answer: x * S, explanation: `The son is ${S} years old, so the father is ${x} × ${S} = ${x * S} years.`, unit: Y }; },
    (ri) => { const x = ri(3, 30); return { stem: `A is ${x} years older than B and is also twice as old as B. Find A's present age.`, answer: 2 * x, explanation: `If B = b, then b + ${x} = 2b ⇒ b = ${x}; so A = 2 × ${x} = ${2 * x} years.`, unit: Y }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Problems on Ages", file: "arithmetic-problems-on-ages-01.json", subtypes });
