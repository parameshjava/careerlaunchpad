// Arithmetic → Area (200 Qs, ~50/tier). Answers computed exactly (π = 22/7 with
// radius a multiple of 7). Run: node question-imports/gen/arith-area.gen.mjs
import { run } from "./lib.mjs";
const CM2 = { post: " cm²" }, CM = { post: " cm" }, M = { pre: "₹" };
const TRIP = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [20, 21, 29], [12, 16, 20]];

const subtypes = {
  easy: [
    (ri) => { const l = ri(4, 40), w = ri(3, 30); return { stem: `Find the area of a rectangle of length ${l} cm and breadth ${w} cm.`, answer: l * w, explanation: `Area = length × breadth = ${l} × ${w} = ${l * w} cm².`, unit: CM2 }; },
    (ri) => { const s = ri(3, 40); return { stem: `Find the area of a square of side ${s} cm.`, answer: s * s, explanation: `Area = side² = ${s}² = ${s * s} cm².`, unit: CM2 }; },
    (ri) => { const b = 2 * ri(2, 20), h = ri(3, 30); return { stem: `Find the area of a triangle with base ${b} cm and height ${h} cm.`, answer: (b * h) / 2, explanation: `Area = ½ × base × height = ½ × ${b} × ${h} = ${(b * h) / 2} cm².`, unit: CM2 }; },
    (ri) => { const r = 7 * ri(1, 6); return { stem: `Find the area of a circle of radius ${r} cm. (Take π = 22/7.)`, answer: (22 * r * r) / 7, explanation: `Area = πr² = (22/7) × ${r}² = ${(22 * r * r) / 7} cm².`, unit: CM2 }; },
  ],
  medium: [
    (ri) => { const l = ri(5, 40), w = ri(4, 30); return { stem: `Find the perimeter of a rectangle of length ${l} cm and breadth ${w} cm.`, answer: 2 * (l + w), explanation: `Perimeter = 2(length + breadth) = 2(${l} + ${w}) = ${2 * (l + w)} cm.`, unit: CM }; },
    (ri) => { const l = ri(5, 40), w = ri(4, 30); return { stem: `The area of a rectangle is ${l * w} cm² and its length is ${l} cm. Find its breadth.`, answer: w, explanation: `Breadth = area/length = ${l * w}/${l} = ${w} cm.`, unit: CM }; },
    (ri) => { const s = ri(4, 30); return { stem: `The perimeter of a square is ${4 * s} cm. Find its area.`, answer: s * s, explanation: `Side = ${4 * s}/4 = ${s} cm; area = ${s}² = ${s * s} cm².`, unit: CM2 }; },
  ],
  hard: [
    (ri) => { const l = ri(4, 30), w = ri(3, 25), rate = ri(10, 80); return { stem: `Find the cost of flooring a rectangular room ${l} m long and ${w} m wide at ₹${rate} per square metre.`, answer: l * w * rate, explanation: `Area = ${l}×${w} = ${l * w} m²; cost = ${l * w} × ₹${rate} = ₹${l * w * rate}.`, unit: M }; },
    (ri) => { const l = ri(6, 40), w = ri(4, 30), rate = ri(5, 60); return { stem: `Find the cost of fencing a rectangular field ${l} m by ${w} m at ₹${rate} per metre.`, answer: 2 * (l + w) * rate, explanation: `Perimeter = 2(${l}+${w}) = ${2 * (l + w)} m; cost = ${2 * (l + w)} × ₹${rate} = ₹${2 * (l + w) * rate}.`, unit: M }; },
    (ri) => { const d1 = 2 * ri(2, 20), d2 = ri(4, 40); return { stem: `Find the area of a rhombus whose diagonals are ${d1} cm and ${d2} cm.`, answer: (d1 * d2) / 2, explanation: `Area = ½ × d₁ × d₂ = ½ × ${d1} × ${d2} = ${(d1 * d2) / 2} cm².`, unit: CM2 }; },
  ],
  very_hard: [
    (ri) => { const l = ri(4, 12), w = ri(3, 10), h = ri(3, 6), rate = ri(10, 60); return { stem: `Find the cost of painting the four walls of a room ${l} m long, ${w} m wide and ${h} m high at ₹${rate} per square metre.`, answer: 2 * h * (l + w) * rate, explanation: `Area of 4 walls = 2h(l+w) = 2×${h}×(${l}+${w}) = ${2 * h * (l + w)} m²; cost = ₹${2 * h * (l + w) * rate}.`, unit: M }; },
    (ri) => { const [a, b, c] = TRIP[ri(0, TRIP.length - 1)], k = ri(1, 5); return { stem: `Find the length of the diagonal of a rectangle whose length is ${a * k} cm and breadth is ${b * k} cm.`, answer: c * k, explanation: `Diagonal = √(length² + breadth²) = √(${a * k}² + ${b * k}²) = ${c * k} cm.`, unit: CM }; },
    (ri) => { const l = ri(20, 40), w = ri(15, 30), x = ri(1, 4); if (l - 2 * x <= 0 || w - 2 * x <= 0) return null; return { stem: `A rectangular garden is ${l} m long and ${w} m wide. A path of uniform width ${x} m runs all around it on the inside. Find the area of the path.`, answer: l * w - (l - 2 * x) * (w - 2 * x), explanation: `Path area = outer − inner = ${l}×${w} − ${l - 2 * x}×${w - 2 * x} = ${l * w - (l - 2 * x) * (w - 2 * x)} m².`, unit: { post: " m²" } }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Area", file: "arithmetic-area-01.json", subtypes });
