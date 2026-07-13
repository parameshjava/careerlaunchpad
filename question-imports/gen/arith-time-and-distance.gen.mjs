// Arithmetic → Time and Distance (200 Qs, ~50/tier). Answers computed exactly.
// Run: node question-imports/gen/arith-time-and-distance.gen.mjs
import { run } from "./lib.mjs";
const KMPH = { post: " km/h" }, KM = { post: " km" }, HR = { post: " hours" }, MPS = { post: " m/s" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

const subtypes = {
  easy: [
    (ri) => { const s = ri(20, 90), t = ri(2, 12); return { stem: `A car covers ${s * t} km in ${t} hours. Find its speed.`, answer: s, explanation: `Speed = distance/time = ${s * t}/${t} = ${s} km/h.`, unit: KMPH }; },
    (ri) => { const s = ri(20, 90), t = ri(2, 12); return { stem: `A car travels at ${s} km/h for ${t} hours. Find the distance covered.`, answer: s * t, explanation: `Distance = speed × time = ${s} × ${t} = ${s * t} km.`, unit: KM }; },
    (ri) => { const s = ri(20, 90), t = ri(2, 12); return { stem: `A car travels ${s * t} km at a steady speed of ${s} km/h. Find the time taken.`, answer: t, explanation: `Time = distance/speed = ${s * t}/${s} = ${t} hours.`, unit: HR }; },
    (ri) => { const v = ri(2, 8) * 18; return { stem: `Convert a speed of ${v} km/h into metres per second (m/s).`, answer: (v * 5) / 18, explanation: `km/h → m/s: multiply by 5/18, so ${v} × 5/18 = ${(v * 5) / 18} m/s.`, unit: MPS }; },
  ],
  medium: [
    (ri) => { const s = ri(20, 80), t1 = ri(2, 8), t2 = ri(2, 10); if (t1 === t2) return null; return { stem: `A car travels ${s * t1} km in ${t1} hours. At the same speed, how far will it travel in ${t2} hours?`, answer: s * t2, explanation: `Speed = ${s * t1}/${t1} = ${s} km/h; distance in ${t2} hours = ${s} × ${t2} = ${s * t2} km.`, unit: KM }; },
    (ri) => { const v = ri(1, 8) * 5; return { stem: `Convert a speed of ${v} m/s into kilometres per hour (km/h).`, answer: (v * 18) / 5, explanation: `m/s → km/h: multiply by 18/5, so ${v} × 18/5 = ${(v * 18) / 5} km/h.`, unit: KMPH }; },
    (ri) => { const t = ri(3, 10), t2 = ri(2, t - 1), base = ri(2, 10), d = t * t2 * base; return { stem: `A car covers ${d} km in ${t} hours. At what speed must it travel to cover the same distance in ${t2} hours?`, answer: d / t2, explanation: `Required speed = distance/time = ${d}/${t2} = ${d / t2} km/h.`, unit: KMPH }; },
  ],
  hard: [
    (ri) => { const a = ri(30, 70), b = ri(30, 70), D = (a + b) * ri(2, 6); return { stem: `Two trains are ${D} km apart and travel toward each other at ${a} km/h and ${b} km/h. After how many hours will they meet?`, answer: D / (a + b), explanation: `Closing speed = ${a}+${b} = ${a + b} km/h; time = ${D}/${a + b} = ${D / (a + b)} hours.`, unit: HR }; },
    (ri) => { const a = ri(20, 50), b = a + ri(5, 30), g = (b - a) * ri(2, 8); return { stem: `A thief running at ${a} km/h is spotted by a policeman ${g} km behind him, who chases at ${b} km/h. In how many hours will the policeman catch the thief?`, answer: g / (b - a), explanation: `Relative speed = ${b}−${a} = ${b - a} km/h; time = ${g}/${b - a} = ${g / (b - a)} hours.`, unit: HR }; },
    (ri) => { const x = ri(20, 60), y = ri(20, 60); if (x === y) return null; const D = lcm(x, y) * ri(1, 5), T = D / x + D / y; return { stem: `A man goes to a place at ${x} km/h and returns along the same road at ${y} km/h. If the whole journey takes ${T} hours, find the one-way distance.`, answer: D, explanation: `D/${x} + D/${y} = ${T} ⇒ D = ${D} km.`, unit: KM }; },
  ],
  very_hard: [
    (ri) => { const s = ri(3, 8), s2 = s + ri(1, 6), D = lcm(s, s2) * ri(1, 3), t1 = D / s, t2 = D / s2, total = (t1 - t2) * 60; if (total < 2) return null; const Lm = ri(1, total - 1), Em = total - Lm; return { stem: `Walking to school at ${s} km/h, a student is ${Lm} minutes late; walking at ${s2} km/h, he is ${Em} minutes early. Find the distance to the school.`, answer: D, explanation: `Time difference = ${Lm}+${Em} = ${total} min = ${(t1 - t2)} h between the two speeds ⇒ distance = ${D} km.`, unit: KM }; },
    (ri) => { const x = ri(20, 60), y = ri(20, 60); if (x === y) return null; const D = lcm(x, y) * ri(1, 5), T = D / x + D / y; return { stem: `A person travels from A to B at ${x} km/h and returns at ${y} km/h, taking ${T} hours in all. Find the total distance travelled (to and fro).`, answer: 2 * D, explanation: `One-way distance = ${D} km, so the total distance both ways = ${2 * D} km.`, unit: KM }; },
    (ri) => { const a = ri(20, 60), b = ri(20, 60), D = (a + b) * ri(2, 6); return { stem: `Two people start at the same time from towns A and B, ${D} km apart, and walk toward each other at ${a} km/h and ${b} km/h respectively. Find the distance from A at which they meet.`, answer: (D * a) / (a + b), explanation: `They meet after ${D}/(${a}+${b}) hours; distance from A = ${a} × ${D}/${a + b} = ${(D * a) / (a + b)} km.`, unit: KM }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Time and Distance", file: "arithmetic-time-and-distance-01.json", subtypes });
