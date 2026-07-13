// Arithmetic → Problems on Trains (200 Qs, ~50/tier). Lengths/times constructed as
// exact multiples of the relevant speed. Run: node .../arith-problems-on-trains.gen.mjs
import { run } from "./lib.mjs";
const S = { post: " seconds" }, MtR = { post: " m" }, MPS = { post: " m/s" };

const subtypes = {
  easy: [
    (ri) => { const u = ri(10, 40), t = ri(3, 20), L = u * t; return { stem: `A train ${L} m long is moving at ${u} m/s. How long will it take to cross a signal pole?`, answer: t, explanation: `Time = length/speed = ${L}/${u} = ${t} seconds.`, unit: S }; },
    (ri) => { const u = ri(10, 40), t = ri(4, 20), L = u * t; return { stem: `A ${L} m long train crosses a pole in ${t} seconds. Find its speed.`, answer: u, explanation: `Speed = length/time = ${L}/${t} = ${u} m/s.`, unit: MPS }; },
    (ri) => { const u = ri(10, 40), t = ri(4, 25); return { stem: `A train running at ${u} m/s crosses a pole in ${t} seconds. Find the length of the train.`, answer: u * t, explanation: `Length = speed × time = ${u} × ${t} = ${u * t} m.`, unit: MtR }; },
  ],
  medium: [
    (ri) => { const u = ri(10, 40), Ltr = u * ri(3, 15), Lpl = u * ri(3, 15); return { stem: `A train ${Ltr} m long, moving at ${u} m/s, crosses a platform ${Lpl} m long. Find the time taken.`, answer: (Ltr + Lpl) / u, explanation: `Distance = ${Ltr}+${Lpl} = ${Ltr + Lpl} m; time = ${Ltr + Lpl}/${u} = ${(Ltr + Lpl) / u} seconds.`, unit: S }; },
    (ri) => { const u = ri(10, 40), t = ri(10, 40), Lpl = u * ri(3, 15), Ltr = u * t - Lpl; if (Ltr <= 0) return null; return { stem: `A train moving at ${u} m/s crosses a ${Lpl} m long platform in ${t} seconds. Find the length of the train.`, answer: Ltr, explanation: `Total distance = ${u}×${t} = ${u * t} m; train length = ${u * t} − ${Lpl} = ${Ltr} m.`, unit: MtR }; },
    (ri) => { const v = ri(2, 6) * 18, u = (v * 5) / 18, t = ri(4, 20), L = u * t; return { stem: `A train ${L} m long is moving at ${v} km/h. How long will it take to cross a signal post?`, answer: t, explanation: `${v} km/h = ${u} m/s; time = ${L}/${u} = ${t} seconds.`, unit: S }; },
  ],
  hard: [
    (ri) => { const u1 = ri(10, 35), u2 = ri(10, 35), L1 = (u1 + u2) * ri(2, 6), L2 = (u1 + u2) * ri(2, 6); return { stem: `Two trains ${L1} m and ${L2} m long are moving in opposite directions at ${u1} m/s and ${u2} m/s. In how many seconds will they completely cross each other?`, answer: (L1 + L2) / (u1 + u2), explanation: `Relative speed = ${u1}+${u2} = ${u1 + u2} m/s; time = (${L1}+${L2})/${u1 + u2} = ${(L1 + L2) / (u1 + u2)} seconds.`, unit: S }; },
    (ri) => { const u1 = ri(20, 40), u2 = ri(5, u1 - 3), L1 = (u1 - u2) * ri(2, 6), L2 = (u1 - u2) * ri(2, 6); return { stem: `Two trains ${L1} m and ${L2} m long move in the same direction at ${u1} m/s and ${u2} m/s. How long will the faster train take to completely pass the slower one?`, answer: (L1 + L2) / (u1 - u2), explanation: `Relative speed = ${u1}−${u2} = ${u1 - u2} m/s; time = (${L1}+${L2})/${u1 - u2} = ${(L1 + L2) / (u1 - u2)} seconds.`, unit: S }; },
    (ri) => { const u = ri(15, 40), um = ri(1, 5), rel = u - um, L = rel * ri(3, 15); return { stem: `A train ${L} m long, moving at ${u} m/s, overtakes a man walking at ${um} m/s in the same direction. Find the time taken to pass him.`, answer: L / rel, explanation: `Relative speed = ${u}−${um} = ${rel} m/s; time = ${L}/${rel} = ${L / rel} seconds.`, unit: S }; },
  ],
  very_hard: [
    (ri) => { const u1 = ri(10, 30), u2 = ri(10, 30), t = ri(5, 15), tot = (u1 + u2) * t, L1 = ri(2, Math.max(3, Math.floor(tot / u1) - 1)) * u1, L2 = tot - L1; if (L2 <= 0) return null; return { stem: `Two trains ${L1} m and ${L2} m long move toward each other. One of them travels at ${u1} m/s and they cross each other in ${t} seconds. Find the speed of the other train.`, answer: u2, explanation: `Combined speed = (${L1}+${L2})/${t} = ${tot / t} m/s; other train's speed = ${tot / t} − ${u1} = ${u2} m/s.`, unit: MPS }; },
    (ri) => { const u = ri(10, 30), tp = ri(5, 15), tq = tp + ri(3, 12), L = u * tp, Lpl = u * (tq - tp); return { stem: `A train crosses a pole in ${tp} seconds and a ${Lpl} m long platform in ${tq} seconds. Find the length of the train.`, answer: L, explanation: `Speed = L/${tp} = (L+${Lpl})/${tq} ⇒ L = ${Lpl}×${tp}/(${tq}−${tp}) = ${L} m.`, unit: MtR }; },
    (ri) => { const u1 = ri(25, 45), u2 = ri(5, u1 - 5), t = ri(8, 20), tot = (u1 - u2) * t, L1 = ri(2, Math.max(3, Math.floor(tot / u1) - 1)) * (u1 - u2), L2 = tot - L1; if (L2 <= 0) return null; return { stem: `A faster train ${L1} m long, running at ${u1} m/s, overtakes a slower train ${L2} m long in ${t} seconds while both move in the same direction. Find the speed of the slower train.`, answer: u2, explanation: `Relative speed = (${L1}+${L2})/${t} = ${tot / t} m/s; slower train's speed = ${u1} − ${tot / t} = ${u2} m/s.`, unit: MPS }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Problems on Trains", file: "arithmetic-problems-on-trains-01.json", subtypes });
