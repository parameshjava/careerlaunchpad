// Arithmetic → Heights and Distances (200 Qs, ~50/tier). Uses 45° cases (height =
// distance) and Pythagorean triples so every answer is an exact integer.
// Run: node question-imports/gen/arith-heights-and-distances.gen.mjs
import { run } from "./lib.mjs";
const MT = { post: " m" };
const TRIP = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [20, 21, 29], [9, 40, 41], [12, 16, 20], [10, 24, 26]];
// each [foot, height, lineOfSight]

const subtypes = {
  easy: [
    (ri) => { const d = ri(5, 80); return { stem: `The angle of elevation of the top of a tower from a point on the ground is 45°. If the point is ${d} m from the foot of the tower, find the height of the tower.`, answer: d, explanation: `At 45°, height = horizontal distance = ${d} m.`, unit: MT }; },
    (ri) => { const s = ri(5, 80); return { stem: `When the sun's angle of elevation is 45°, a vertical pole casts a shadow ${s} m long. Find the height of the pole.`, answer: s, explanation: `At 45°, height = shadow length = ${s} m.`, unit: MT }; },
    (ri) => { const h = ri(5, 80); return { stem: `From the top of a tower ${h} m high, the angle of depression of a point on the ground is 45°. Find the horizontal distance of the point from the foot of the tower.`, answer: h, explanation: `At 45°, horizontal distance = height = ${h} m.`, unit: MT }; },
  ],
  medium: [
    (ri) => { const [f, h, L] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 8); return { stem: `A ladder ${L * k} m long leans against a wall with its foot ${f * k} m away from the wall. How high up the wall does the ladder reach?`, answer: h * k, explanation: `Height = √(${L * k}² − ${f * k}²) = ${h * k} m.`, unit: MT }; },
    (ri) => { const [f, h, L] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 8); return { stem: `A ladder reaches a window ${h * k} m above the ground, its foot being ${f * k} m from the wall. Find the length of the ladder.`, answer: L * k, explanation: `Length = √(${h * k}² + ${f * k}²) = ${L * k} m.`, unit: MT }; },
    (ri) => { const [f, h, L] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 8); return { stem: `A kite is flying with ${L * k} m of (straight) string let out, and the horizontal distance of the kite from the flyer is ${f * k} m. Find the height of the kite.`, answer: h * k, explanation: `Height = √(${L * k}² − ${f * k}²) = ${h * k} m.`, unit: MT }; },
  ],
  hard: [
    (ri) => { const [f, h, L] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 8); return { stem: `The top of a tower ${h * k} m high is observed from a point on the ground; the straight-line distance from that point to the top is ${L * k} m. Find the horizontal distance from the point to the foot of the tower.`, answer: f * k, explanation: `Distance = √(${L * k}² − ${h * k}²) = ${f * k} m.`, unit: MT }; },
    (ri) => { const t = ri(5, 40), fl = ri(5, 40); return { stem: `A flagstaff stands on the top of a tower ${t} m high. From a point on the ground ${t + fl} m from the base of the tower, the angle of elevation of the top of the flagstaff is 45°. Find the height of the flagstaff.`, answer: fl, explanation: `At 45°, total height = ${t + fl} m; flagstaff = ${t + fl} − ${t} = ${fl} m.`, unit: MT }; },
    (ri) => { const [f, h, L] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 8); return { stem: `From a point ${f * k} m from the base of a tower, the straight line of sight to the top of the tower is ${L * k} m. Find the height of the tower.`, answer: h * k, explanation: `Height = √(${L * k}² − ${f * k}²) = ${h * k} m.`, unit: MT }; },
  ],
  very_hard: [
    (ri) => { const h = ri(6, 90); return { stem: `A person standing on one bank of a river observes the top of a tree on the opposite bank at an angle of elevation of 45°. If the tree is ${h} m tall, find the width of the river.`, answer: h, explanation: `At 45°, the width of the river equals the height of the tree = ${h} m.`, unit: MT }; },
    (ri) => { const total = ri(20, 90), fl = ri(5, total - 5); return { stem: `A flagstaff stands on top of a tower. From a point on the ground ${total} m from the base, the angle of elevation of the top of the flagstaff (the highest point) is 45°, and the flagstaff itself is ${fl} m tall. Find the height of the tower.`, answer: total - fl, explanation: `At 45°, total height = ${total} m; tower = ${total} − ${fl} = ${total - fl} m.`, unit: MT }; },
    (ri) => { const [f, h, L] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 8); return { stem: `A ${L * k} m long wire is stretched from the top of a vertical pole to a point on the ground ${f * k} m from the foot of the pole. Find the height of the pole.`, answer: h * k, explanation: `Height = √(${L * k}² − ${f * k}²) = ${h * k} m.`, unit: MT }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Heights and Distances", file: "arithmetic-heights-and-distances-01.json", subtypes });
