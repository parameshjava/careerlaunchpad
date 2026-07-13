// Arithmetic → Calendar (200 Qs, ~50/tier). Days of the week are computed with
// Zeller's congruence (pure arithmetic); options are day names.
// Run: node question-imports/gen/arith-calendar.gen.mjs
import { writeFileSync } from "node:fs";
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ZELLER = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (m, y) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
function dow(y, m, d) { let mm = m, yy = y; if (m < 3) { mm = m + 12; yy = y - 1; } const K = yy % 100, J = Math.floor(yy / 100); const h = (d + Math.floor((13 * (mm + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7; return ZELLER[h]; }
const randDate = (ylo, yhi) => { const y = ri(ylo, yhi), m = ri(1, 12), d = ri(1, dim(m, y)); return { y, m, d, day: dow(y, m, d) }; };

function build(level, stem, ansDay, explanation, seen) {
  if (seen.has(stem)) return null;
  const others = WEEK.filter((w) => w !== ansDay);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const labels = [ansDay, ...others.slice(0, 3)];
  for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
  seen.add(stem);
  return { chapter: "Calendar", kind: "standard", difficulty: level, answer_type: "single", stem, explanation, options: labels.map((l) => ({ label: l, is_correct: l === ansDay })) };
}

const SPECS = {
  easy: [
    (seen) => { const d = ri(0, 6), N = ri(1, 60); return build("easy", `If today is ${WEEK[d]}, what day of the week will it be after ${N} days?`, WEEK[(d + N) % 7], `${N} mod 7 = ${N % 7}, so the day advances by ${N % 7} to ${WEEK[(d + N) % 7]}.`, seen); },
    (seen) => { const d = ri(0, 6), N = ri(1, 60); return build("easy", `If today is ${WEEK[d]}, what day of the week was it ${N} days ago?`, WEEK[(d - (N % 7) + 7) % 7], `Going back ${N % 7} days from ${WEEK[d]} gives ${WEEK[(d - (N % 7) + 7) % 7]}.`, seen); },
    (seen) => { const d = ri(0, 6), k = ri(2, 28); return build("easy", `If the 1st of a month falls on a ${WEEK[d]}, what day of the week will the ${k}th of that month be?`, WEEK[(d + (k - 1)) % 7], `The ${k}th is ${k - 1} days after the 1st; (${k - 1}) mod 7 = ${(k - 1) % 7}, giving ${WEEK[(d + (k - 1)) % 7]}.`, seen); },
  ],
  medium: [
    (seen) => { const t = randDate(1950, 1999); return build("medium", `What day of the week was ${t.d} ${MONTHS[t.m - 1]} ${t.y}?`, t.day, `By the calendar, ${t.d} ${MONTHS[t.m - 1]} ${t.y} was a ${t.day}.`, seen); },
    (seen) => { const d = ri(0, 6), w = ri(1, 8), dd = ri(1, 6); return build("medium", `If today is ${WEEK[d]}, what day will it be after ${w} weeks and ${dd} days?`, WEEK[(d + dd) % 7], `Whole weeks do not change the day; adding ${dd} days to ${WEEK[d]} gives ${WEEK[(d + dd) % 7]}.`, seen); },
    (seen) => { const y = ri(1950, 1998); return build("medium", `If 1st January ${y} is a ${dow(y, 1, 1)}, what day of the week will 1st January ${y + 1} be?`, dow(y + 1, 1, 1), `${y} is ${isLeap(y) ? "a leap year (366 days)" : "an ordinary year (365 days)"}, so the day advances by ${isLeap(y) ? 2 : 1} to ${dow(y + 1, 1, 1)}.`, seen); },
  ],
  hard: [
    (seen) => { const t = randDate(2000, 2049); return build("hard", `What day of the week ${t.y <= 2026 ? "was" : "will"} ${t.d} ${MONTHS[t.m - 1]} ${t.y}${t.y <= 2026 ? "" : " be"}?`, t.day, `By the calendar, ${t.d} ${MONTHS[t.m - 1]} ${t.y} falls on a ${t.day}.`, seen); },
    (seen) => { const y = ri(2000, 2049), a = randDate(y, y), b = randDate(y, y); if (a.m === b.m && a.d === b.d) return null; return build("hard", `In the year ${y}, ${a.d} ${MONTHS[a.m - 1]} is a ${a.day}. What day of the week is ${b.d} ${MONTHS[b.m - 1]} ${y}?`, b.day, `Counting days within ${y}, ${b.d} ${MONTHS[b.m - 1]} is a ${b.day}.`, seen); },
    (seen) => { const y = ri(2000, 2048); return build("hard", `If 1st January ${y} is a ${dow(y, 1, 1)}, what day will 1st January ${y + 1} be?`, dow(y + 1, 1, 1), `${y} is ${isLeap(y) ? "a leap year" : "an ordinary year"}, so 1 Jan advances to ${dow(y + 1, 1, 1)}.`, seen); },
  ],
  very_hard: [
    (seen) => { const t = randDate(2050, 2099); return build("very_hard", `What day of the week will ${t.d} ${MONTHS[t.m - 1]} ${t.y} be?`, t.day, `By the calendar, ${t.d} ${MONTHS[t.m - 1]} ${t.y} will fall on a ${t.day}.`, seen); },
    (seen) => { const t = randDate(1901, 1949); return build("very_hard", `On which day of the week did ${t.d} ${MONTHS[t.m - 1]} ${t.y} fall?`, t.day, `By the calendar, ${t.d} ${MONTHS[t.m - 1]} ${t.y} fell on a ${t.day}.`, seen); },
    (seen) => { const y = ri(1901, 2099), a = randDate(y, y), b = randDate(y, y); if (a.m === b.m && a.d === b.d) return null; return build("very_hard", `In the year ${y}, ${a.d} ${MONTHS[a.m - 1]} is a ${a.day}. On which day of the week does ${b.d} ${MONTHS[b.m - 1]} ${y} fall?`, b.day, `Counting days within ${y}, ${b.d} ${MONTHS[b.m - 1]} is a ${b.day}.`, seen); },
  ],
};

const questions = [];
const seen = new Set();
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  const fns = SPECS[level];
  let added = 0, tries = 0;
  while (added < 50 && tries < 300000) { tries++; const q = fns[Math.floor(R() * fns.length)](seen); if (!q) continue; questions.push(q); added++; }
  if (added < 50) throw new Error(`only ${added} unique ${level}`);
}
const path = new URL("../arithmetic-calendar-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Arithmetic", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} to arithmetic-calendar-01.json`);
