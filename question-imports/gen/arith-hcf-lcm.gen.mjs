// Arithmetic → H.C.F. and L.C.M. of Numbers (200 Qs, ~50/tier). Answers computed.
// Run: node question-imports/gen/arith-hcf-lcm.gen.mjs
import { run } from "./lib.mjs";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const lcm3 = (a, b, c) => lcm(lcm(a, b), c);
const coprime = (ri, k = 2) => { for (;;) { const arr = Array.from({ length: k }, () => ri(2, 12)); let ok = true; for (let i = 0; i < k && ok; i++) for (let j = i + 1; j < k; j++) if (gcd(arr[i], arr[j]) !== 1) ok = false; if (ok && new Set(arr).size === k) return arr; } };

const subtypes = {
  easy: [
    (ri) => { const h = ri(2, 12), [m, n] = coprime(ri), x = h * m, y = h * n; return { stem: `Find the HCF (greatest common divisor) of ${x} and ${y}.`, answer: h, explanation: `${x} = ${h}×${m}, ${y} = ${h}×${n}, and ${m}, ${n} share no common factor, so HCF = ${h}.` }; },
    (ri) => { const h = ri(2, 10), [m, n] = coprime(ri), x = h * m, y = h * n; return { stem: `Find the LCM (least common multiple) of ${x} and ${y}.`, answer: h * m * n, explanation: `LCM = HCF × (${m}×${n}) = ${h}×${m * n} = ${h * m * n}.` }; },
    (ri) => { const h = ri(2, 9), [m, n, p] = coprime(ri, 3); return { stem: `Find the HCF of ${h * m}, ${h * n} and ${h * p}.`, answer: h, explanation: `Each number is a multiple of ${h} and the co-factors ${m}, ${n}, ${p} share no common factor, so HCF = ${h}.` }; },
  ],
  medium: [
    (ri) => { const a = ri(4, 12), b = ri(4, 15), c = ri(4, 18); return { stem: `Find the LCM of ${a}, ${b} and ${c}.`, answer: lcm3(a, b, c), explanation: `LCM(${a}, ${b}, ${c}) = ${lcm3(a, b, c)}.` }; },
    (ri) => { const h = ri(2, 15), [m, n] = coprime(ri); return { stem: `The HCF of two numbers is ${h} and their LCM is ${h * m * n}. If one of the numbers is ${h * m}, find the other number.`, answer: h * n, explanation: `Other number = HCF×LCM/(one number) = ${h}×${h * m * n}/${h * m} = ${h * n}.` }; },
    (ri) => { const h = ri(3, 16), [m, n] = coprime(ri); return { stem: `Find the greatest length (in cm) that can exactly measure lengths of ${h * m} cm and ${h * n} cm.`, answer: h, explanation: `The greatest such length is the HCF of ${h * m} and ${h * n}, which is ${h} cm.`, unit: { post: " cm" } }; },
  ],
  hard: [
    (ri) => { const a = ri(4, 12), b = ri(4, 15), c = ri(4, 18); return { stem: `Find the least number that is exactly divisible by ${a}, ${b} and ${c}.`, answer: lcm3(a, b, c), explanation: `The least such number is LCM(${a}, ${b}, ${c}) = ${lcm3(a, b, c)}.` }; },
    (ri) => { const a = ri(4, 12), b = ri(4, 15), c = ri(4, 18), L = lcm3(a, b, c), ans = Math.floor(9999 / L) * L; if (ans < 1000) return null; return { stem: `Find the greatest four-digit number that is exactly divisible by ${a}, ${b} and ${c}.`, answer: ans, explanation: `LCM = ${L}; greatest 4-digit multiple = ⌊9999/${L}⌋×${L} = ${ans}.` }; },
    (ri) => { const a = ri(4, 20), b = ri(4, 24), c = ri(4, 30), L = lcm3(a, b, c); return { stem: `Three bells ring at intervals of ${a}, ${b} and ${c} seconds respectively. If they ring together now, after how many seconds will they next ring together?`, answer: L, explanation: `They ring together after LCM(${a}, ${b}, ${c}) = ${L} seconds.`, unit: { post: " seconds" } }; },
  ],
  very_hard: [
    (ri) => { const [m, n] = coprime(ri), h = ri(2, 20); return { stem: `Two numbers are in the ratio ${m}:${n} and their HCF is ${h}. Find their LCM.`, answer: h * m * n, explanation: `The numbers are ${h * m} and ${h * n}; LCM = ${h}×${m}×${n} = ${h * m * n}.` }; },
    (ri) => { const a = ri(5, 12), b = ri(5, 15), c = ri(5, 18), k = ri(1, 4), L = lcm3(a, b, c); if (a - k <= 0 || b - k <= 0 || c - k <= 0) return null; return { stem: `Find the least number which, when divided by ${a}, ${b} and ${c}, leaves remainders ${a - k}, ${b - k} and ${c - k} respectively.`, answer: L - k, explanation: `Each divisor exceeds its remainder by ${k}, so the number = LCM(${a}, ${b}, ${c}) − ${k} = ${L} − ${k} = ${L - k}.` }; },
    (ri) => { const hh = ri(2, 18), ll = hh * ri(6, 30); return { stem: `The HCF and LCM of two numbers are ${hh} and ${ll} respectively. Find the product of the two numbers.`, answer: hh * ll, explanation: `Product of two numbers = HCF × LCM = ${hh} × ${ll} = ${hh * ll}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "H.C.F. and L.C.M. of Numbers", file: "arithmetic-hcf-and-lcm-01.json", subtypes });
