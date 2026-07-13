// Arithmetic → Volume and Surface Area (200 Qs, ~50/tier). π = 22/7 with radii
// chosen as multiples of 7 (and heights of 3 for cones) so every result is an
// exact integer. Run: node question-imports/gen/arith-volume-and-surface-area.gen.mjs
import { run } from "./lib.mjs";
const C3 = { post: " cm³" }, C2 = { post: " cm²" }, CM = { post: " cm" };
const CONE = [[7, 24, 25], [14, 48, 50], [21, 28, 35], [35, 12, 37], [28, 45, 53]]; // r,h,l with r a multiple of 7

const subtypes = {
  easy: [
    (ri) => { const l = ri(3, 20), w = ri(3, 20), h = ri(3, 20); return { stem: `Find the volume of a cuboid ${l} cm long, ${w} cm wide and ${h} cm high.`, answer: l * w * h, explanation: `Volume = l×b×h = ${l}×${w}×${h} = ${l * w * h} cm³.`, unit: C3 }; },
    (ri) => { const a = ri(2, 20); return { stem: `Find the volume of a cube of edge ${a} cm.`, answer: a * a * a, explanation: `Volume = a³ = ${a}³ = ${a * a * a} cm³.`, unit: C3 }; },
    (ri) => { const a = ri(2, 25); return { stem: `Find the total surface area of a cube of edge ${a} cm.`, answer: 6 * a * a, explanation: `Surface area = 6a² = 6×${a}² = ${6 * a * a} cm².`, unit: C2 }; },
  ],
  medium: [
    (ri) => { const r = 7 * ri(1, 5), h = ri(3, 25); return { stem: `Find the volume of a cylinder of radius ${r} cm and height ${h} cm. (Take π = 22/7.)`, answer: (22 * r * r * h) / 7, explanation: `Volume = πr²h = (22/7)×${r}²×${h} = ${(22 * r * r * h) / 7} cm³.`, unit: C3 }; },
    (ri) => { const l = ri(3, 15), w = ri(3, 15), h = ri(3, 15); return { stem: `Find the total surface area of a cuboid ${l} cm × ${w} cm × ${h} cm.`, answer: 2 * (l * w + w * h + h * l), explanation: `TSA = 2(lb+bh+hl) = 2(${l * w}+${w * h}+${h * l}) = ${2 * (l * w + w * h + h * l)} cm².`, unit: C2 }; },
    (ri) => { const a = ri(2, 20); return { stem: `The volume of a cube is ${a * a * a} cm³. Find the length of its edge.`, answer: a, explanation: `Edge = ∛${a * a * a} = ${a} cm.`, unit: CM }; },
  ],
  hard: [
    (ri) => { const r = 7 * ri(1, 5), h = ri(3, 25); return { stem: `Find the curved (lateral) surface area of a cylinder of radius ${r} cm and height ${h} cm. (Take π = 22/7.)`, answer: (2 * 22 * r * h) / 7, explanation: `CSA = 2πrh = 2×(22/7)×${r}×${h} = ${(2 * 22 * r * h) / 7} cm².`, unit: C2 }; },
    (ri) => { const r = 7 * ri(1, 6); return { stem: `Find the surface area of a sphere of radius ${r} cm. (Take π = 22/7.)`, answer: (4 * 22 * r * r) / 7, explanation: `Surface area = 4πr² = 4×(22/7)×${r}² = ${(4 * 22 * r * r) / 7} cm².`, unit: C2 }; },
    (ri) => { const l = ri(4, 20), w = ri(3, 18), h = ri(3, 18); return { stem: `The volume of a cuboid is ${l * w * h} cm³. If its length is ${l} cm and breadth is ${w} cm, find its height.`, answer: h, explanation: `Height = volume/(l×b) = ${l * w * h}/(${l}×${w}) = ${h} cm.`, unit: CM }; },
  ],
  very_hard: [
    (ri) => { const r = 7 * ri(1, 5), h = 3 * ri(1, 10); return { stem: `Find the volume of a cone of base radius ${r} cm and height ${h} cm. (Take π = 22/7.)`, answer: (22 * r * r * h) / 21, explanation: `Volume = (1/3)πr²h = (1/3)(22/7)×${r}²×${h} = ${(22 * r * r * h) / 21} cm³.`, unit: C3 }; },
    (ri) => { const r = 21 * ri(1, 2); return { stem: `Find the volume of a sphere of radius ${r} cm. (Take π = 22/7.)`, answer: (4 * 22 * r * r * r) / 21, explanation: `Volume = (4/3)πr³ = (4/3)(22/7)×${r}³ = ${(4 * 22 * r * r * r) / 21} cm³.`, unit: C3 }; },
    (ri) => { const [r, h, l] = CONE[ri(0, CONE.length - 1)]; return { stem: `Find the curved surface area of a cone of base radius ${r} cm and slant height ${l} cm. (Take π = 22/7.)`, answer: (22 * r * l) / 7, explanation: `CSA of a cone = πrl = (22/7)×${r}×${l} = ${(22 * r * l) / 7} cm².`, unit: C2 }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Volume and Surface Area", file: "arithmetic-volume-and-surface-area-01.json", subtypes });
