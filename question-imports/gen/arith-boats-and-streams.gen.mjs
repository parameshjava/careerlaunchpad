// Arithmetic → Boats and Streams (200 Qs, ~50/tier). Downstream = boat+stream,
// upstream = boat−stream; distances built as exact multiples so times are whole.
// Run: node question-imports/gen/arith-boats-and-streams.gen.mjs
import { run } from "./lib.mjs";
const KMPH = { post: " km/h" }, HR = { post: " hours" }, KM = { post: " km" };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

const subtypes = {
  easy: [
    (ri) => { const b = ri(6, 25), s = ri(1, b - 1); return { stem: `The speed of a boat in still water is ${b} km/h and the speed of the stream is ${s} km/h. Find the downstream speed of the boat.`, answer: b + s, explanation: `Downstream speed = boat + stream = ${b} + ${s} = ${b + s} km/h.`, unit: KMPH }; },
    (ri) => { const b = ri(6, 25), s = ri(1, b - 1); return { stem: `The speed of a boat in still water is ${b} km/h and the speed of the stream is ${s} km/h. Find the upstream speed of the boat.`, answer: b - s, explanation: `Upstream speed = boat − stream = ${b} − ${s} = ${b - s} km/h.`, unit: KMPH }; },
    (ri) => { const b = ri(6, 25), s = ri(1, b - 1); return { stem: `A boat goes downstream at ${b + s} km/h and upstream at ${b - s} km/h. Find the speed of the boat in still water.`, answer: b, explanation: `Still-water speed = (downstream + upstream)/2 = (${b + s} + ${b - s})/2 = ${b} km/h.`, unit: KMPH }; },
  ],
  medium: [
    (ri) => { const b = ri(5, 20), s = ri(1, b - 1), d = (b + s) * ri(2, 10); return { stem: `A boat's speed in still water is ${b} km/h and the stream flows at ${s} km/h. How long will it take to travel ${d} km downstream?`, answer: d / (b + s), explanation: `Downstream speed = ${b + s} km/h; time = ${d}/${b + s} = ${d / (b + s)} hours.`, unit: HR }; },
    (ri) => { const b = ri(6, 20), s = ri(1, b - 2), d = (b - s) * ri(2, 10); return { stem: `A boat's speed in still water is ${b} km/h and the stream flows at ${s} km/h. How long will it take to travel ${d} km upstream?`, answer: d / (b - s), explanation: `Upstream speed = ${b - s} km/h; time = ${d}/${b - s} = ${d / (b - s)} hours.`, unit: HR }; },
    (ri) => { const b = ri(6, 25), s = ri(1, b - 1); return { stem: `A boat travels at ${b + s} km/h downstream and ${b - s} km/h upstream. Find the speed of the stream.`, answer: s, explanation: `Stream speed = (downstream − upstream)/2 = (${b + s} − ${b - s})/2 = ${s} km/h.`, unit: KMPH }; },
  ],
  hard: [
    (ri) => { const b = ri(6, 20), s = ri(1, Math.min(b - 1, 8)), down = b + s, up = b - s, d = lcm(down, up) * ri(1, 4); return { stem: `A boat covers ${d} km downstream in ${d / down} hours and the same distance upstream in ${d / up} hours. Find the speed of the boat in still water.`, answer: b, explanation: `Downstream speed = ${down}, upstream = ${up}; still-water speed = (${down}+${up})/2 = ${b} km/h.`, unit: KMPH }; },
    (ri) => { const b = ri(6, 20), s = ri(1, Math.min(b - 1, 8)), down = b + s, up = b - s, d = lcm(down, up) * ri(1, 4); return { stem: `A boat covers ${d} km downstream in ${d / down} hours and the same distance upstream in ${d / up} hours. Find the speed of the stream.`, answer: s, explanation: `Downstream speed = ${down}, upstream = ${up}; stream speed = (${down}−${up})/2 = ${s} km/h.`, unit: KMPH }; },
    (ri) => { const b = ri(6, 20), s = ri(1, Math.min(b - 1, 8)), down = b + s, up = b - s, d = lcm(down, up) * ri(1, 3); return { stem: `A man whose rowing speed in still water is ${b} km/h rows to a place ${d} km away and returns. If the stream flows at ${s} km/h, find the total time taken for the round trip.`, answer: d / down + d / up, explanation: `Time = ${d}/${down} + ${d}/${up} = ${d / down} + ${d / up} = ${d / down + d / up} hours.`, unit: HR }; },
  ],
  very_hard: [
    (ri) => { const b = ri(6, 20), s = ri(1, Math.min(b - 1, 8)), down = b + s, up = b - s, d = lcm(down, up) * ri(1, 3), T = d / down + d / up; return { stem: `A man whose rowing speed in still water is ${b} km/h rows to a place and back, taking ${T} hours in all. If the stream flows at ${s} km/h, find the (one-way) distance to the place.`, answer: d, explanation: `d/${down} + d/${up} = ${T} ⇒ d = ${d} km.`, unit: KM }; },
    (ri) => { const down = ri(8, 30), up = ri(3, down - 2); if ((down + up) % 2 !== 0) return null; const t1 = ri(2, 8), t2 = ri(2, 8); return { stem: `A boat goes ${down * t1} km downstream in ${t1} hours and ${up * t2} km upstream in ${t2} hours. Find the speed of the boat in still water.`, answer: (down + up) / 2, explanation: `Downstream speed = ${down * t1}/${t1} = ${down}, upstream = ${up * t2}/${t2} = ${up}; still water = (${down}+${up})/2 = ${(down + up) / 2} km/h.`, unit: KMPH }; },
    (ri) => { const b = ri(8, 25), s = ri(1, b - 3), down = b + s, up = b - s, t = ri(2, 8), d = down * t; if (d % up !== 0) return null; return { stem: `A boat whose speed in still water is ${b} km/h covers ${d} km downstream in ${t} hours. How long will it take to cover the same distance upstream?`, answer: d / up, explanation: `Downstream speed = ${d}/${t} = ${down}, so stream = ${s} and upstream speed = ${up}; upstream time = ${d}/${up} = ${d / up} hours.`, unit: HR }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Boats and Streams", file: "arithmetic-boats-and-streams-01.json", subtypes });
