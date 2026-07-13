// Arithmetic → Races and Games of Skill (200 Qs, ~50/tier). Distances/points built
// with divisibility guards so answers are exact integers.
// Run: node question-imports/gen/arith-races-and-games.gen.mjs
import { run } from "./lib.mjs";
const MT = { post: " m" }, S = { post: " seconds" }, PT = { post: " points" };

const subtypes = {
  easy: [
    (ri) => { const D = ri(2, 20) * 50, d = ri(5, Math.floor(D / 2)); return { stem: `In a ${D} m race, A beats B by ${d} m. How many metres had B covered when A finished the race?`, answer: D - d, explanation: `B is ${d} m behind the finish, so B has run ${D} − ${d} = ${D - d} m.`, unit: MT }; },
    (ri) => { const D = ri(2, 20) * 50, s = ri(5, Math.floor(D / 2)); return { stem: `In a ${D} m race, A gives B a start of ${s} m. How many metres does B actually run?`, answer: D - s, explanation: `B starts ${s} m ahead, so B runs ${D} − ${s} = ${D - s} m.`, unit: MT }; },
    (ri) => { const tb = ri(15, 60), t = ri(2, tb - 2); return { stem: `In a race, A beats B by ${t} seconds. If B takes ${tb} seconds to complete the race, find A's time.`, answer: tb - t, explanation: `A's time = ${tb} − ${t} = ${tb - t} seconds.`, unit: S }; },
  ],
  medium: [
    (ri) => { const D = ri(2, 20) * 50, d = ri(5, 40), t = ri(2, 10); if ((D * t) % d !== 0) return null; return { stem: `In a ${D} m race, A beats B by ${d} metres or by ${t} seconds. Find the time taken by B to run the full ${D} m.`, answer: (D * t) / d, explanation: `B runs ${d} m in ${t} s, so B's time for ${D} m = ${D}×${t}/${d} = ${(D * t) / d} seconds.`, unit: S }; },
    (ri) => { const D = ri(2, 20) * 50, a = ri(3, 9), b = ri(1, a - 1); if ((D * (a - b)) % a !== 0) return null; return { stem: `In a ${D} m race, the speeds of A and B are in the ratio ${a}:${b}. What start (in metres) can A give B so that the race ends in a dead heat?`, answer: (D * (a - b)) / a, explanation: `Start = ${D}×(${a}−${b})/${a} = ${(D * (a - b)) / a} m.`, unit: MT }; },
    (ri) => { const D = ri(2, 20) * 50, ta = ri(20, 60), tb = ta + ri(2, 20); if ((D * (tb - ta)) % tb !== 0) return null; return { stem: `A can run a ${D} m race in ${ta} seconds and B in ${tb} seconds. By how many metres does A beat B?`, answer: (D * (tb - ta)) / tb, explanation: `In ${ta} s, B runs ${D}×${ta}/${tb} m, so A beats B by ${D}×(${tb}−${ta})/${tb} = ${(D * (tb - ta)) / tb} m.`, unit: MT }; },
  ],
  hard: [
    (ri) => { const D = ri(2, 20) * 50, d1 = ri(10, 40), d2 = ri(d1 + 5, 90); if ((D * (d2 - d1)) % (D - d1) !== 0) return null; return { stem: `In a ${D} m race, A beats B by ${d1} m and A beats C by ${d2} m. By how many metres does B beat C in the same race?`, answer: (D * (d2 - d1)) / (D - d1), explanation: `When B finishes ${D} m, C has run ${D}×${D - d2}/${D - d1} m, so B beats C by ${(D * (d2 - d1)) / (D - d1)} m.`, unit: MT }; },
    (ri) => { const G = ri(5, 20) * 10, p1 = ri(5, 30), p2 = ri(p1 + 5, 45); if ((G * (p2 - p1)) % (G - p1) !== 0) return null; return { stem: `In a game of ${G} points, A can give B ${p1} points and A can give C ${p2} points. How many points can B give C?`, answer: (G * (p2 - p1)) / (G - p1), explanation: `B:C = (${G}−${p1}):(${G}−${p2}); when B scores ${G}, C scores ${G}×${G - p2}/${G - p1}, so B gives C ${(G * (p2 - p1)) / (G - p1)} points.`, unit: PT }; },
    (ri) => { const D = ri(2, 20) * 50, ta = ri(20, 50), tb = ta + ri(2, 15); if ((D * (tb - ta)) % tb !== 0) return null; return { stem: `In a ${D} m race, A finishes in ${ta} seconds while B finishes in ${tb} seconds. By how many metres does A beat B?`, answer: (D * (tb - ta)) / tb, explanation: `A beats B by ${D}×(${tb}−${ta})/${tb} = ${(D * (tb - ta)) / tb} m.`, unit: MT }; },
  ],
  very_hard: [
    (ri) => { const D = ri(4, 20) * 50, d1 = ri(10, 40), d2 = ri(10, 40); const val = (D * D - (D - d1) * (D - d2)); if (val % D !== 0) return null; return { stem: `In a ${D} m race, A beats B by ${d1} m, and in the same race B beats C by ${d2} m. By how many metres does A beat C?`, answer: val / D, explanation: `When A finishes, C has run (${D - d1})×(${D - d2})/${D} m, so A beats C by [${D}² − ${D - d1}×${D - d2}]/${D} = ${val / D} m.`, unit: MT }; },
    (ri) => { const G = ri(5, 20) * 10, p1 = ri(5, 30), p2 = ri(5, 30); const val = (G * G - (G - p1) * (G - p2)); if (val % G !== 0) return null; return { stem: `In a game of ${G} points, A can give B ${p1} points and B can give C ${p2} points. How many points can A give C?`, answer: val / G, explanation: `When A scores ${G}, C scores (${G - p1})×(${G - p2})/${G}, so A gives C [${G}² − ${G - p1}×${G - p2}]/${G} = ${val / G} points.`, unit: PT }; },
    (ri) => { const D = ri(2, 20) * 50, a = ri(4, 10), b = ri(1, a - 1); if ((D * (a - b)) % a !== 0) return null; return { stem: `In a ${D} m race, A can beat B by giving a start such that their speeds are in the ratio ${a}:${b}. If instead they start together, by how many metres does A beat B?`, answer: (D * (a - b)) / a, explanation: `When A runs ${D} m, B runs ${D}×${b}/${a} m, so A beats B by ${D}×(${a}−${b})/${a} = ${(D * (a - b)) / a} m.`, unit: MT }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Races and Games of Skill", file: "arithmetic-races-and-games-01.json", subtypes });
