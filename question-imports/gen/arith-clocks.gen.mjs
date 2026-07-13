// Arithmetic → Clocks (200 Qs, ~50/tier). Hand-angle = |30H − 5.5M|; minutes are
// kept even so 5.5M (and every angle) is an exact integer.
// Run: node question-imports/gen/arith-clocks.gen.mjs
import { run } from "./lib.mjs";
const DEG = { post: "°" };
const pad = (m) => (m < 10 ? `0${m}` : `${m}`);
const acute = (H, M) => { const a = Math.abs(30 * H - 5.5 * M); return Math.min(a, 360 - a); };

const subtypes = {
  easy: [
    (ri) => { const T = ri(1, 60); return { stem: `Through how many degrees does the minute hand of a clock move in ${T} minutes?`, answer: 6 * T, explanation: `The minute hand moves 360° in 60 min = 6° per min, so in ${T} min it moves ${6 * T}°.`, unit: DEG }; },
    (ri) => { const T = 2 * ri(1, 30); return { stem: `Through how many degrees does the hour hand of a clock move in ${T} minutes?`, answer: T / 2, explanation: `The hour hand moves 0.5° per minute, so in ${T} min it moves ${T / 2}°.`, unit: DEG }; },
    (ri) => { const T = 2 * ri(1, 30); return { stem: `In ${T} minutes, by how many degrees does the minute hand gain over the hour hand?`, answer: 5.5 * T, explanation: `The minute hand gains 5.5° per minute over the hour hand, so in ${T} min it gains ${5.5 * T}°.`, unit: DEG }; },
  ],
  medium: [
    (ri) => { const H = ri(1, 12), M = 2 * ri(1, 14); return { stem: `Find the (smaller) angle between the hour and minute hands of a clock at ${H === 12 ? 12 : H}:${pad(M)}.`, answer: acute(H, M), explanation: `Angle = |30×${H} − 5.5×${M}| = ${Math.abs(30 * H - 5.5 * M)}°; the smaller angle is ${acute(H, M)}°.`, unit: DEG }; },
    (ri) => { const H = ri(1, 11); const a = Math.min(30 * H, 360 - 30 * H); return { stem: `Find the angle between the hour and minute hands of a clock at ${H} o'clock.`, answer: a, explanation: `At ${H} o'clock the hands are ${H} hour-marks apart = ${a}°.`, unit: DEG }; },
    (ri) => { const a = ri(1, 11), b = ri(a + 1, 12); return { stem: `Through how many degrees does the hour hand turn as the time changes from ${a} o'clock to ${b} o'clock?`, answer: 30 * (b - a), explanation: `The hour hand turns 30° per hour, so from ${a} to ${b} o'clock it turns 30×${b - a} = ${30 * (b - a)}°.`, unit: DEG }; },
  ],
  hard: [
    (ri) => { const H = ri(1, 12), M = 2 * ri(15, 29); return { stem: `Find the (smaller) angle between the hour and minute hands of a clock at ${H === 12 ? 12 : H}:${pad(M)}.`, answer: acute(H, M), explanation: `Angle = |30×${H} − 5.5×${M}| = ${Math.abs(30 * H - 5.5 * M)}°; the smaller angle is ${acute(H, M)}°.`, unit: DEG }; },
    (ri) => { const T = ri(1, 15); return { stem: `Through how many degrees does the minute hand move in ${T} hour(s)?`, answer: 360 * T, explanation: `The minute hand completes 360° each hour, so in ${T} hour(s) it moves ${360 * T}°.`, unit: DEG }; },
    (ri) => { const H = ri(1, 11); const a = Math.min(30 * H, 360 - 30 * H); return { stem: `Find the reflex angle between the hour and minute hands of a clock at ${H} o'clock.`, answer: 360 - a, explanation: `The smaller angle is ${a}°, so the reflex angle = 360 − ${a} = ${360 - a}°.`, unit: DEG }; },
  ],
  very_hard: [
    (ri) => { const H = ri(1, 12), M = 2 * ri(1, 29); const a = acute(H, M); return { stem: `Find the reflex angle between the hour and minute hands of a clock at ${H === 12 ? 12 : H}:${pad(M)}.`, answer: 360 - a, explanation: `The smaller angle is ${a}°, so the reflex angle = 360 − ${a} = ${360 - a}°.`, unit: DEG }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Clocks", file: "arithmetic-clocks-01.json", subtypes });
