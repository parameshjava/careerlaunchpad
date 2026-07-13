// Arithmetic → Chain Rule (200 Qs, ~50/tier). Direct & inverse proportion, with
// divisibility guards so answers are whole numbers. Run: node .../arith-chain-rule.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, D = { post: " days" }, IT = { post: " items" }, MEN = { post: " men" };

const subtypes = {
  easy: [
    (ri) => { const x = ri(2, 12), per = ri(2, 30), y = ri(2, 20); return { stem: `If ${x} pens cost ₹${x * per}, find the cost of ${y} such pens.`, answer: per * y, explanation: `Cost of one pen = ₹${x * per}/${x} = ₹${per}; cost of ${y} pens = ₹${per * y}.`, unit: M }; },
    (ri) => { const m = ri(4, 40), d = ri(2, 20), m2 = ri(2, 40); if (m2 === m || (m * d) % m2 !== 0) return null; return { stem: `If ${m} men can build a wall in ${d} days, how many days will ${m2} men take to build the same wall?`, answer: (m * d) / m2, explanation: `Men and days are inversely proportional: days = ${m}×${d}/${m2} = ${(m * d) / m2}.`, unit: D }; },
    (ri) => { const rate = ri(2, 20), t = ri(2, 12), t2 = ri(2, 20); return { stem: `A machine produces ${rate * t} items in ${t} minutes. How many items will it produce in ${t2} minutes at the same rate?`, answer: rate * t2, explanation: `Rate = ${rate * t}/${t} = ${rate} items/min; in ${t2} minutes it makes ${rate * t2} items.`, unit: IT }; },
  ],
  medium: [
    (ri) => { const w1 = ri(2, 12), d = ri(2, 15), k = ri(2, 8); return { stem: `A group of workers can produce ${w1} units in ${d} days. Working at the same rate, in how many days can they produce ${w1 * k} units?`, answer: d * k, explanation: `Work and time are directly proportional: days = ${d} × ${w1 * k}/${w1} = ${d * k}.`, unit: D }; },
    (ri) => { const m = ri(6, 30), d = ri(3, 15), a = ri(2, 10), k = ri(2, 6), b = a * k, d2 = ri(2, 15); if ((m * d * b) % (a * d2) !== 0) return null; return { stem: `If ${m} men can dig ${a} metres of trench in ${d} days, how many men are needed to dig ${b} metres in ${d2} days?`, answer: (m * d * b) / (a * d2), explanation: `Men = (${m}×${d}×${b})/(${a}×${d2}) = ${(m * d * b) / (a * d2)}.`, unit: MEN }; },
    (ri) => { const m = ri(20, 60), d = ri(10, 40), extra = ri(5, 40); if ((m * d) % (m + extra) !== 0) return null; return { stem: `A stock of food is enough for ${m} men for ${d} days. If ${extra} more men join before the food is touched, for how many days will the food last?`, answer: (m * d) / (m + extra), explanation: `Total food = ${m}×${d} man-days; with ${m + extra} men it lasts ${m * d}/${m + extra} = ${(m * d) / (m + extra)} days.`, unit: D }; },
  ],
  hard: [
    (ri) => { const m1 = ri(4, 20), h1 = ri(4, 10), d1 = ri(3, 12), w1 = ri(2, 6), m2 = ri(4, 20), h2 = ri(4, 10), w2 = ri(2, 8), num = m1 * h1 * d1 * w2; if (num % (m2 * h2 * w1) !== 0) return null; return { stem: `If ${m1} men working ${h1} hours a day can finish ${w1} units of work in ${d1} days, in how many days can ${m2} men working ${h2} hours a day finish ${w2} units?`, answer: num / (m2 * h2 * w1), explanation: `Days = (${m1}×${h1}×${d1}×${w2})/(${m2}×${h2}×${w1}) = ${num / (m2 * h2 * w1)}.`, unit: D }; },
    (ri) => { const a = ri(3, 15), h = ri(4, 12), d = ri(2, 12), a2 = ri(3, 15), h2 = ri(4, 12), num = a * h * d; if (num % (a2 * h2) !== 0) return null; return { stem: `If ${a} pumps working ${h} hours a day can empty a reservoir in ${d} days, in how many days can ${a2} pumps working ${h2} hours a day empty it?`, answer: num / (a2 * h2), explanation: `Days = (${a}×${h}×${d})/(${a2}×${h2}) = ${num / (a2 * h2)}.`, unit: D }; },
    (ri) => { const m = ri(20, 80), d = ri(20, 60), k = ri(5, d - 5), leave = ri(2, Math.floor(m / 3)); if ((m * (d - k)) % (m - leave) !== 0) return null; return { stem: `Provisions in a camp are enough for ${m} men for ${d} days. After ${k} days, ${leave} men leave the camp. For how many more days will the remaining provisions last?`, answer: (m * (d - k)) / (m - leave), explanation: `Food left = ${m}×(${d}−${k}) man-days; with ${m - leave} men it lasts ${m * (d - k)}/${m - leave} = ${(m * (d - k)) / (m - leave)} days.`, unit: D }; },
  ],
  very_hard: [
    (ri) => { const m = ri(40, 100) * 10, d = ri(30, 80), k = ri(10, d - 10), x = ri(10, d - k), rem = m * (d - k); if (rem % x !== 0) return null; const r = rem / x - m; if (r <= 0) return null; return { stem: `A garrison of ${m} men has provisions for ${d} days. After ${k} days, a reinforcement arrives and the remaining provisions now last only ${x} more days. Find the number of men in the reinforcement.`, answer: r, explanation: `Food left = ${m}×(${d}−${k}) = ${rem} man-days; total men now = ${rem}/${x} = ${rem / x}, so reinforcement = ${rem / x} − ${m} = ${r}.`, unit: MEN }; },
    (ri) => { const m1 = ri(6, 20), d1 = ri(4, 15), a1 = ri(2, 6), m2 = ri(6, 20), a2 = ri(2, 8), num = m1 * d1 * a2; if (num % (a1 * m2) !== 0) return null; return { stem: `If ${m1} workers can make ${a1} machines in ${d1} days, how many days will ${m2} workers take to make ${a2} machines (at the same rate)?`, answer: num / (a1 * m2), explanation: `Days = (${m1}×${d1}×${a2})/(${a1}×${m2}) = ${num / (a1 * m2)}.`, unit: D }; },
    (ri) => { const m = ri(15, 60), d = ri(10, 40), h = ri(4, 10), m2 = ri(15, 60), h2 = ri(4, 10), num = m * d * h; if (num % (m2 * h2) !== 0) return null; return { stem: `If ${m} men working ${h} hours a day can complete a task in ${d} days, in how many days can ${m2} men working ${h2} hours a day complete the same task?`, answer: num / (m2 * h2), explanation: `Days = (${m}×${d}×${h})/(${m2}×${h2}) = ${num / (m2 * h2)}.`, unit: D }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Chain Rule", file: "arithmetic-chain-rule-01.json", subtypes });
