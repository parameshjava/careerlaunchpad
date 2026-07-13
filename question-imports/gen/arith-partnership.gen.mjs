// Arithmetic → Partnership (200 Qs, ~50/tier). Profit shared in the ratio of
// capital×time; profits built as multiples of the weight-sum so shares are exact.
// Run: node question-imports/gen/arith-partnership.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

const subtypes = {
  easy: [
    (ri) => { const ca = ri(2, 9), cb = ri(2, 9), u = ri(1, 20) * 1000, P = (ca + cb) * ri(2, 20) * 100; return { stem: `A and B invest ₹${ca * u} and ₹${cb * u} respectively in a business for the same period. If the total profit is ₹${P}, find A's share.`, answer: (P * ca) / (ca + cb), explanation: `Profit is shared in the ratio of capitals ${ca}:${cb}; A's share = ₹${P} × ${ca}/${ca + cb} = ₹${(P * ca) / (ca + cb)}.`, unit: M }; },
    (ri) => { const ca = ri(2, 9), cb = ri(2, 9), u = ri(1, 20) * 1000, P = (ca + cb) * ri(2, 20) * 100; return { stem: `A and B invest ₹${ca * u} and ₹${cb * u} respectively for the same period. If the total profit is ₹${P}, find B's share.`, answer: (P * cb) / (ca + cb), explanation: `B's share = ₹${P} × ${cb}/${ca + cb} = ₹${(P * cb) / (ca + cb)}.`, unit: M }; },
    (ri) => { const m = ri(2, 9), n = ri(2, 9), P = (m + n) * ri(5, 40) * 10; return { stem: `A and B invest in the ratio ${m}:${n} for the same time. If the total profit is ₹${P}, find A's share.`, answer: (P * m) / (m + n), explanation: `A's share = ₹${P} × ${m}/${m + n} = ₹${(P * m) / (m + n)}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const ca = ri(2, 9), cb = ri(2, 9), cc = ri(2, 9), u = ri(1, 15) * 1000, sum = ca + cb + cc, P = sum * ri(2, 20) * 100; return { stem: `A, B and C invest ₹${ca * u}, ₹${cb * u} and ₹${cc * u} respectively for the same period. If the total profit is ₹${P}, find C's share.`, answer: (P * cc) / sum, explanation: `C's share = ₹${P} × ${cc}/${sum} = ₹${(P * cc) / sum}.`, unit: M }; },
    (ri) => { const ca = ri(2, 20), cb = ri(2, 20), t1 = ri(2, 12), t2 = ri(2, 12), wA = ca * t1, wB = cb * t2, P = (wA + wB) * ri(5, 40); return { stem: `A invests ₹${ca * 1000} for ${t1} months and B invests ₹${cb * 1000} for ${t2} months. If the total profit is ₹${P}, find A's share.`, answer: (P * wA) / (wA + wB), explanation: `Profit ratio = capital×time = ${wA}:${wB}; A's share = ₹${P} × ${wA}/${wA + wB} = ₹${(P * wA) / (wA + wB)}.`, unit: M }; },
    (ri) => { const ca = ri(2, 9), cb = ri(2, 9), u = ri(1, 15) * 1000, X = ri(2, 20) * 100; return { stem: `A and B invest ₹${ca * u} and ₹${cb * u} respectively for the same period. If A's share of the profit is ₹${ca * X}, find the total profit.`, answer: (ca + cb) * X, explanation: `A's share is ${ca}/${ca + cb} of the profit, so total profit = ₹${ca * X} × ${ca + cb}/${ca} = ₹${(ca + cb) * X}.`, unit: M }; },
  ],
  hard: [
    (ri) => { const ca = ri(2, 9), cb = ri(2, 9), cc = ri(2, 9), t1 = ri(2, 12), t2 = ri(2, 12), t3 = ri(2, 12), wA = ca * t1, wB = cb * t2, wC = cc * t3, sum = wA + wB + wC, P = sum * ri(4, 20); return { stem: `A, B and C invest ₹${ca * 1000}, ₹${cb * 1000} and ₹${cc * 1000} for ${t1}, ${t2} and ${t3} months respectively. If the total profit is ₹${P}, find B's share.`, answer: (P * wB) / sum, explanation: `Profit ratio = ${wA}:${wB}:${wC}; B's share = ₹${P} × ${wB}/${sum} = ₹${(P * wB) / sum}.`, unit: M }; },
    (ri) => { const cx = ri(2, 30), cy = ri(2, 30), m = ri(1, 8), wA = cx * 12, wB = cy * (12 - m), P = (wA + wB) * ri(5, 40); return { stem: `A starts a business with ₹${cx * 1000}. After ${m} months, B joins with ₹${cy * 1000}. At the end of the year, the total profit is ₹${P}. Find B's share.`, answer: (P * wB) / (wA + wB), explanation: `Weights = capital×months = ${wA}:${wB}; B's share = ₹${P} × ${wB}/${wA + wB} = ₹${(P * wB) / (wA + wB)}.`, unit: M }; },
    (ri) => { const cx = ri(2, 9), cy = ri(2, 9), p = ri(10, 30), P = (cx + cy) * 100 * ri(2, 10), rem = (P * (100 - p)) / 100; return { stem: `A and B invest ₹${cx * 1000} and ₹${cy * 1000}. As the working partner, A first receives ${p}% of the profit for managing the business, and the remainder is divided in the ratio of their capitals. If the total profit is ₹${P}, find A's total share.`, answer: (P * p) / 100 + (rem * cx) / (cx + cy), explanation: `A's management fee = ${p}% of ₹${P} = ₹${(P * p) / 100}; remaining ₹${rem} split ${cx}:${cy} gives A ₹${(rem * cx) / (cx + cy)}; total = ₹${(P * p) / 100 + (rem * cx) / (cx + cy)}.`, unit: M }; },
  ],
  very_hard: [
    (ri) => { const cx = ri(2, 20), t1 = ri(2, 12), cb = ri(2, 20), t2 = ri(2, 12), wA = cx * t1, wB = cb * t2, g = gcd(wA, wB); return { stem: `A invests ₹${cx * 1000} for ${t1} months and B invests some amount for ${t2} months. If their profits are shared in the ratio ${wA / g}:${wB / g}, find B's investment.`, answer: cb * 1000, explanation: `B's capital×time must give the ratio, so B's investment = ₹${cb * 1000}.`, unit: M }; },
    (ri) => { const cx = ri(2, 20), cy = ri(2, 20), cz = ri(2, 20), m1 = ri(1, 6), m2 = ri(1, 6), wA = cx * 12, wB = cy * (12 - m1), wC = cz * (12 - m2), sum = wA + wB + wC, P = sum * ri(4, 20); return { stem: `A invests ₹${cx * 1000} for the whole year. B joins after ${m1} months with ₹${cy * 1000}, and C joins after ${m2} months with ₹${cz * 1000}. If the annual profit is ₹${P}, find C's share.`, answer: (P * wC) / sum, explanation: `Weights = ${wA}:${wB}:${wC}; C's share = ₹${P} × ${wC}/${sum} = ₹${(P * wC) / sum}.`, unit: M }; },
    (ri) => { const a = ri(2, 6), b = ri(2, 6), c = ri(2, 6), t1 = ri(2, 6), t2 = ri(2, 6), t3 = ri(2, 6), wA = a * t1, wB = b * t2, wC = c * t3, sum = wA + wB + wC, P = sum * ri(4, 20); return { stem: `The capitals of A, B and C are in the ratio ${a}:${b}:${c} and they invest for periods in the ratio ${t1}:${t2}:${t3}. If the total profit is ₹${P}, find A's share.`, answer: (P * wA) / sum, explanation: `Profit ratio = capital×time = ${wA}:${wB}:${wC}; A's share = ₹${P} × ${wA}/${sum} = ₹${(P * wA) / sum}.`, unit: M }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Partnership", file: "arithmetic-partnership-01.json", subtypes });
