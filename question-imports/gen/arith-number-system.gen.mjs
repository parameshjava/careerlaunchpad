// Arithmetic → Number System (200 Qs, ~50/tier). All answers computed exactly.
// Run: node question-imports/gen/arith-number-system.gen.mjs
import { run } from "./lib.mjs";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const modpow = (b, e, m) => { let r = 1; b %= m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e = Math.floor(e / 2); } return r; };
const trailingZeros = (n) => { let z = 0; for (let p = 5; p <= n; p *= 5) z += Math.floor(n / p); return z; };
const coprime2 = (ri) => { let m, n; do { m = ri(2, 9); n = ri(2, 9); } while (gcd(m, n) !== 1 || m === n); return [m, n]; };

const subtypes = {
  easy: [
    (ri) => { const N = ri(1000, 9999), d = ri(3, 19); return { stem: `Find the remainder when ${N} is divided by ${d}.`, answer: N % d, explanation: `${N} = ${d}×${Math.floor(N / d)} + ${N % d}, so the remainder is ${N % d}.` }; },
    (ri) => { const k = ri(3, 40), ans = Math.floor(999 / k) * k; return { stem: `Find the greatest three-digit number that is exactly divisible by ${k}.`, answer: ans, explanation: `⌊999/${k}⌋ = ${Math.floor(999 / k)}, so the number is ${Math.floor(999 / k)}×${k} = ${ans}.` }; },
    (ri) => { const n = ri(10, 50); return { stem: `Find the sum of the first ${n} even natural numbers.`, answer: n * (n + 1), explanation: `Sum of first n even numbers = n(n+1) = ${n}×${n + 1} = ${n * (n + 1)}.` }; },
    (ri) => { const n = ri(10, 60); return { stem: `Find the sum of the first ${n} odd natural numbers.`, answer: n * n, explanation: `Sum of first n odd numbers = n² = ${n}² = ${n * n}.` }; },
  ],
  medium: [
    (ri) => { const s = ri(5, 40), diff = ri(2, 30), L = ((s + diff) + Math.abs(s - diff)); const big = s > diff ? s : diff; const small = s > diff ? diff : s; const S = big + small, D = big - small; return { stem: `The sum of two numbers is ${S} and their difference is ${D}. Find the larger of the two numbers.`, answer: (S + D) / 2, explanation: `Larger number = (sum + difference)/2 = (${S} + ${D})/2 = ${(S + D) / 2}.` }; },
    (ri) => { const base = ri(2, 9), exp = ri(4, 40); return { stem: `Find the unit (last) digit of ${base}^${exp}.`, answer: modpow(base, exp, 10), explanation: `The last digit of ${base}^${exp} is ${base}^${exp} mod 10 = ${modpow(base, exp, 10)}.` }; },
    (ri) => { const a = ri(1, 3), b = ri(0, 2), c = ri(0, 1), N = 2 ** a * 3 ** b * 5 ** c; const cnt = (a + 1) * (b + 1) * (c + 1); if (N < 6) return null; return { stem: `How many positive factors (divisors) does ${N} have?`, answer: cnt, explanation: `${N} = 2^${a}·3^${b}·5^${c}; number of factors = (${a}+1)(${b}+1)(${c}+1) = ${cnt}.` }; },
  ],
  hard: [
    (ri) => { const h = ri(2, 15), [p, q] = coprime2(ri), P = h * p * h * q; return { stem: `The product of two numbers is ${P} and their HCF is ${h}. Find their LCM.`, answer: P / h, explanation: `LCM = product/HCF = ${P}/${h} = ${P / h}.` }; },
    (ri) => { const d = ri(3, 15), r = ri(1, d - 1), [m1, m2] = coprime2(ri), a = r + d * ri(2, 6), b = a + d * m1, c = b + d * m2; return { stem: `Find the greatest number that divides ${a}, ${b} and ${c} leaving the same remainder in each case.`, answer: d, explanation: `The required number is the HCF of the differences (${b}−${a}) and (${c}−${b}), which is ${d}.` }; },
    (ri) => { const a = ri(4, 9), b = ri(4, 12), c = ri(4, 15), r = ri(1, 3), L = lcm(lcm(a, b), c); return { stem: `Find the least number which, when divided by ${a}, ${b} and ${c}, leaves a remainder of ${r} in each case.`, answer: L + r, explanation: `Least such number = LCM(${a}, ${b}, ${c}) + ${r} = ${L} + ${r} = ${L + r}.` }; },
  ],
  very_hard: [
    (ri) => { const n = ri(15, 120); return { stem: `Find the number of trailing zeros in ${n}! (${n} factorial).`, answer: trailingZeros(n), explanation: `Trailing zeros = ⌊${n}/5⌋ + ⌊${n}/25⌋ + ⌊${n}/125⌋ + … = ${trailingZeros(n)}.` }; },
    (ri) => { const base = ri(2, 9), exp = ri(10, 40), m = ri(5, 17); return { stem: `Find the remainder when ${base}^${exp} is divided by ${m}.`, answer: modpow(base, exp, m), explanation: `Using modular arithmetic, ${base}^${exp} mod ${m} = ${modpow(base, exp, m)}.` }; },
    (ri) => { const b1 = ri(2, 9), e1 = ri(3, 30), b2 = ri(2, 9), e2 = ri(3, 30); const ans = (modpow(b1, e1, 10) + modpow(b2, e2, 10)) % 10; return { stem: `Find the unit (last) digit of ${b1}^${e1} + ${b2}^${e2}.`, answer: ans, explanation: `Last digit of ${b1}^${e1} is ${modpow(b1, e1, 10)} and of ${b2}^${e2} is ${modpow(b2, e2, 10)}; their sum ends in ${ans}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Number System", file: "arithmetic-number-system-01.json", subtypes });
