// Arithmetic → Problems on Numbers (200 Qs, ~50/tier). Word problems reducing to
// linear/quadratic relations, answers built to be whole numbers.
// Run: node question-imports/gen/arith-problems-on-numbers.gen.mjs
import { run } from "./lib.mjs";

const subtypes = {
  easy: [
    (ri) => { const S = ri(20, 200), a = ri(5, S - 5); return { stem: `The sum of two numbers is ${S}. If one of them is ${a}, find the other number.`, answer: S - a, explanation: `Other number = ${S} − ${a} = ${S - a}.` }; },
    (ri) => { const k = ri(2, 12), num = ri(3, 50); return { stem: `When a number is multiplied by ${k}, the result is ${k * num}. Find the number.`, answer: num, explanation: `Number = ${k * num} ÷ ${k} = ${num}.` }; },
    (ri) => { const D = ri(5, 100), sm = ri(5, 100); return { stem: `The difference between two numbers is ${D} and the smaller number is ${sm}. Find the larger number.`, answer: sm + D, explanation: `Larger = ${sm} + ${D} = ${sm + D}.` }; },
  ],
  medium: [
    (ri) => { const sm = ri(5, 60), L = sm + ri(2, 60); return { stem: `The sum of two numbers is ${L + sm} and their difference is ${L - sm}. Find the larger number.`, answer: L, explanation: `Larger = (sum + difference)/2 = (${L + sm} + ${L - sm})/2 = ${L}.` }; },
    (ri) => { const k = ri(2, 6), part = ri(5, 40); return { stem: `One number is ${k} times another. If their sum is ${(k + 1) * part}, find the larger number.`, answer: k * part, explanation: `Smaller = ${(k + 1) * part}/(${k}+1) = ${part}; larger = ${k}×${part} = ${k * part}.` }; },
    (ri) => { const x = ri(3, 40), b = ri(2, 50), a = 3 * x - b; if (a <= 0) return null; return { stem: `Three times a number exceeds ${a} by ${b}. Find the number.`, answer: x, explanation: `3×number = ${a} + ${b} = ${a + b}, so the number = ${a + b}/3 = ${x}.` }; },
  ],
  hard: [
    (ri) => { const dd = ri(1, 8); return { stem: `The difference between a two-digit number and the number obtained by reversing its digits is ${9 * dd}. Find the difference between the two digits of the number.`, answer: dd, explanation: `For a two-digit number, (number − reversed) = 9 × (difference of digits) = ${9 * dd}, so the digits differ by ${dd}.` }; },
    (ri) => { const x = ri(2, 40); return { stem: `One-third of a number is ${x} more than one-fourth of the same number. Find the number.`, answer: 12 * x, explanation: `(1/3 − 1/4) of the number = 1/12 of it = ${x}, so the number = 12 × ${x} = ${12 * x}.` }; },
    (ri) => { const mid = ri(3, 80); return { stem: `The sum of three consecutive whole numbers is ${3 * mid}. Find the middle number.`, answer: mid, explanation: `The middle number = ${3 * mid} ÷ 3 = ${mid}.` }; },
  ],
  very_hard: [
    (ri) => { const r1 = ri(3, 30), r2 = ri(3, 30); if (r1 === r2) return null; return { stem: `The sum of two numbers is ${r1 + r2} and their product is ${r1 * r2}. Find the larger number.`, answer: Math.max(r1, r2), explanation: `The two numbers are ${Math.min(r1, r2)} and ${Math.max(r1, r2)}; the larger is ${Math.max(r1, r2)}.` }; },
    (ri) => { const a = ri(3, 25), b = ri(3, 25); return { stem: `The sum of two numbers is ${a + b} and the sum of their squares is ${a * a + b * b}. Find the product of the two numbers.`, answer: a * b, explanation: `Product = [(sum)² − (sum of squares)]/2 = [${(a + b) ** 2} − ${a * a + b * b}]/2 = ${a * b}.` }; },
    (ri) => { const x = ri(3, 60), a = ri(2, 40), b = 2 * x + a; return { stem: `If ${a} is added to twice a number, the result is ${b}. Find the number.`, answer: x, explanation: `2×number + ${a} = ${b} ⇒ number = (${b} − ${a})/2 = ${x}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Problems on Numbers", file: "arithmetic-problems-on-numbers-01.json", subtypes });
