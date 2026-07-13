#!/usr/bin/env node
// Generator for Reasoning → Direction Sense (200 Qs, ~50 per tier). Each walk is
// SIMULATED on a grid (x,y + facing), so the final direction / distance / facing
// is computed, not guessed. Distance questions are emitted only when the net
// displacement is a whole number. Self-asserts every item. Output:
// reasoning-direction-sense-01.json. Run: node .../direction-sense.gen.mjs
import { writeFileSync } from "node:fs";

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260713);
const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const pick = (arr) => arr[ri(0, arr.length - 1)];

const CARD = ["North", "East", "South", "West"]; // facing index 0..3
const VEC = { North: [0, 1], East: [1, 0], South: [0, -1], West: [-1, 0] };
const EIGHT = ["North", "South", "East", "West", "North-East", "North-West", "South-East", "South-West"];

function quadrant(x, y) {
  const ns = y > 0 ? "North" : y < 0 ? "South" : "";
  const ew = x > 0 ? "East" : x < 0 ? "West" : "";
  if (ns && ew) return `${ns}-${ew}`;
  return ns || ew || "the starting point";
}

// Build a random walk. style 'abs' = absolute compass moves; 'rel' = left/right turns.
function walk(nLegs, style) {
  let x = 0, y = 0, facing = ri(0, 3);
  const legs = [];
  for (let i = 0; i < nLegs; i++) {
    const d = ri(2, 12);
    if (style === "abs") {
      const dir = pick(CARD);
      x += VEC[dir][0] * d; y += VEC[dir][1] * d;
      legs.push({ text: `walks ${d} m towards the ${dir}`, dir });
    } else {
      const side = pick(["left", "right"]);
      facing = side === "right" ? (facing + 1) % 4 : (facing + 3) % 4;
      const dir = CARD[facing];
      x += VEC[dir][0] * d; y += VEC[dir][1] * d;
      legs.push({ text: `turns to his ${side} and walks ${d} m`, side, d });
    }
  }
  return { x, y, facing, legs, startFacing: style === "rel" ? legs.length ? undefined : 0 : null };
}

function directionQ(level, nLegs, style) {
  const w = walk(nLegs, style);
  const ans = quadrant(w.x, w.y);
  if (ans === "the starting point") return null; // handle separately, rarely
  const lead = style === "rel" ? `A man is walking. He ${w.legs.map((l) => l.text).join(", then ")}.` : `A person starts from a point and ${w.legs.map((l) => l.text).join(", then ")}.`;
  const stem = `${lead} In which direction is he now from the starting point?`;
  const ds = EIGHT.filter((d) => d !== ans);
  for (let i = ds.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ds[i], ds[j]] = [ds[j], ds[i]]; }
  return { stem, answer: ans, options: [ans, ...ds.slice(0, 3)], explanation: `Tracking the moves, the net displacement is ${w.x} m East and ${w.y} m North of the start, i.e. towards ${ans}.` };
}

function distanceQ(level, nLegs, style) {
  const w = walk(nLegs, style);
  const dist = Math.hypot(w.x, w.y);
  if (!Number.isInteger(dist) || dist === 0) return null;
  const lead = `A person starts from a point and ${w.legs.map((l) => l.text).join(", then ")}.`;
  const stem = `${lead} How far (in metres, straight line) is he from the starting point?`;
  const cand = [dist + 1, dist - 1, dist + 2, Math.abs(w.x) + Math.abs(w.y)];
  const ds = [...new Set(cand.filter((v) => v > 0 && v !== dist))].slice(0, 3);
  let b = dist + 3; while (ds.length < 3) { if (b !== dist && !ds.includes(b)) ds.push(b); b++; }
  return { stem, answer: String(dist), options: [String(dist), ...ds.map(String)], explanation: `Net displacement is ${Math.abs(w.x)} m horizontally and ${Math.abs(w.y)} m vertically, so the straight-line distance is √(${w.x ** 2} + ${w.y ** 2}) = ${dist} m.` };
}

function facingQ(level, nLegs) {
  let facing = ri(0, 3);
  const turns = [];
  for (let i = 0; i < nLegs; i++) { const side = pick(["clockwise", "anticlockwise"]); facing = side === "clockwise" ? (facing + 1) % 4 : (facing + 3) % 4; turns.push(side); }
  const ans = CARD[facing];
  const start = CARD[(facing - turns.reduce((a, s) => a + (s === "clockwise" ? 1 : 3), 0) % 4 + 4) % 4];
  const stem = `A man is initially facing ${start}. He turns 90° ${turns.join(", then 90° ")}. Which direction is he facing now?`;
  const ds = CARD.filter((d) => d !== ans);
  return { stem, answer: ans, options: [ans, ...ds.slice(0, 3)], explanation: `Starting from ${start} and applying the turns in order, he ends up facing ${ans}.` };
}

function finalize(level, r) {
  if (!r) return null;
  const opts = [...r.options];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const options = opts.map((v) => ({ label: v, is_correct: v === r.answer }));
  const q = { chapter: "Direction Sense", kind: "standard", difficulty: level, answer_type: "single", stem: r.stem, explanation: r.explanation, options };
  if (options.filter((o) => o.is_correct).length !== 1) throw new Error(`correct!=1: ${r.stem}`);
  if (new Set(options.map((o) => o.label)).size !== options.length) throw new Error(`dup opt: ${r.stem}`);
  if (options.length !== 4) return null;
  return q;
}

const PLAN = {
  easy: () => R() < 0.6 ? directionQ("easy", 2, "abs") : facingQ("easy", ri(1, 2)),
  medium: () => { const roll = R(); return roll < 0.5 ? directionQ("medium", 3, "abs") : roll < 0.75 ? distanceQ("medium", ri(2, 3), "abs") : facingQ("medium", ri(2, 3)); },
  hard: () => { const roll = R(); return roll < 0.45 ? directionQ("hard", 4, "rel") : roll < 0.75 ? distanceQ("hard", ri(3, 4), "abs") : directionQ("hard", 4, "abs"); },
  very_hard: () => { const roll = R(); return roll < 0.5 ? directionQ("very_hard", ri(5, 6), "rel") : roll < 0.8 ? distanceQ("very_hard", ri(4, 6), "rel") : facingQ("very_hard", ri(3, 5)); },
};

const PER_LEVEL = 50;
const questions = [];
const seen = new Set(); // global — the import validator forbids duplicate stems across the whole file
for (const level of ["easy", "medium", "hard", "very_hard"]) {
  let added = 0, tries = 0;
  while (added < PER_LEVEL && tries < 200000) { tries++; const q = finalize(level, PLAN[level]()); if (!q || seen.has(q.stem)) continue; seen.add(q.stem); questions.push(q); added++; }
  if (added < PER_LEVEL) throw new Error(`only ${added} unique ${level}`);
}
const path = new URL("../reasoning-direction-sense-01.json", import.meta.url).pathname;
writeFileSync(path, JSON.stringify({ subject: "Reasoning", questions }, null, 2) + "\n");
console.log(`wrote ${questions.length} questions to ${path}`);
