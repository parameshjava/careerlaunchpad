// Arithmetic → Average (200 Qs, ~50/tier). Distinct problem sub-types per tier;
// every answer computed & self-checked. Run: node question-imports/gen/arith-average.gen.mjs
import { run } from "./lib.mjs";

const list = (a) => a.join(", ");

const subtypes = {
  easy: [
    // average of a set of numbers (built to give an exact integer mean)
    (ri) => { const n = ri(4, 6), A = ri(20, 80), k = ri(1, 3); const nums = []; for (let i = 0; i < n; i++) nums.push(A + k * (2 * i - (n - 1))); const sum = n * A; return { stem: `Find the average of the following numbers: ${list(nums)}.`, answer: A, explanation: `Their sum is ${sum} and there are ${n} numbers, so the average = ${sum} ÷ ${n} = ${A}.` }; },
    // average of first n natural numbers (n odd → integer)
    (ri) => { const n = [5, 7, 9, 11, 13, 15, 17, 19, 21][ri(0, 8)]; return { stem: `Find the average of the first ${n} natural numbers.`, answer: (n + 1) / 2, explanation: `The average of the first n natural numbers is (n+1)/2 = (${n}+1)/2 = ${(n + 1) / 2}.` }; },
    // average of k consecutive even numbers
    (ri) => { const k = ri(3, 7), a = ri(1, 20) * 2; const ans = a + (k - 1); return { stem: `Find the average of ${k} consecutive even numbers starting from ${a}.`, answer: ans, explanation: `The numbers are equally spaced, so the average equals the middle value = ${a} + (${k}−1) = ${ans}.` }; },
  ],
  medium: [
    // a number is added, average changes → find the added number
    (ri) => { const n = ri(4, 10), A = ri(20, 60), B = A + ri(1, 6); const x = B * (n + 1) - A * n; if (x <= 0) return null; return { stem: `The average of ${n} numbers is ${A}. When one more number is added, the average becomes ${B}. Find the number that was added.`, answer: x, explanation: `Added number = ${B}×(${n}+1) − ${A}×${n} = ${x}.` }; },
    // teacher joins a group of students → new average age
    (ri) => { const p = ri(20, 40), A = ri(10, 15), T = ri(30, 50); const tot = p * A + T; if (tot % (p + 1) !== 0) return null; return { stem: `The average age of ${p} students is ${A} years. When a teacher aged ${T} years joins them, find the new average age (in years).`, answer: tot / (p + 1), explanation: `Total age = ${p}×${A} + ${T} = ${tot}; new average = ${tot} ÷ ${p + 1} = ${tot / (p + 1)} years.`, unit: { post: " years" } }; },
    // weighted average of two sub-groups
    (ri) => { const x = ri(10, 40), y = ri(10, 40), B = ri(30, 60), G = ri(30, 60); const tot = x * B + y * G; if (tot % (x + y) !== 0) return null; return { stem: `In a class the average marks of ${x} boys is ${B} and of ${y} girls is ${G}. Find the average marks of the whole class.`, answer: tot / (x + y), explanation: `Total marks = ${x}×${B} + ${y}×${G} = ${tot}; average = ${tot} ÷ ${x + y} = ${tot / (x + y)}.` }; },
  ],
  hard: [
    // average speed for equal distances (harmonic mean)
    (ri) => { const P = [[30, 60, 40], [40, 60, 48], [20, 30, 24], [10, 40, 16], [60, 90, 72], [45, 30, 36], [20, 80, 32], [15, 30, 20], [24, 40, 30], [36, 60, 45], [12, 24, 16], [18, 36, 24], [50, 75, 60], [16, 48, 24], [21, 28, 24]][ri(0, 14)]; return { stem: `A man travels to a place at ${P[0]} km/h and returns along the same road at ${P[1]} km/h. Find his average speed for the whole journey (in km/h).`, answer: P[2], explanation: `For equal distances, average speed = 2xy/(x+y) = 2×${P[0]}×${P[1]}/(${P[0]}+${P[1]}) = ${P[2]} km/h.`, unit: { post: " km/h" } }; },
    // replacement raises the average → new person's weight
    (ri) => { const n = ri(6, 15), d = ri(1, 4), w = ri(40, 70); return { stem: `The average weight of ${n} persons increases by ${d} kg when a new person replaces one of them weighing ${w} kg. Find the weight of the new person (in kg).`, answer: w + n * d, explanation: `Increase in total weight = ${n}×${d} = ${n * d} kg, so new person's weight = ${w} + ${n * d} = ${w + n * d} kg.`, unit: { post: " kg" } }; },
    // one number removed, average changes → find removed number
    (ri) => { const n = ri(5, 12), A = ri(20, 60), B = ri(20, 60); if (A === B) return null; const x = n * A - (n - 1) * B; if (x <= 0) return null; return { stem: `The average of ${n} numbers is ${A}. When one of the numbers is removed, the average of the remaining ${n - 1} becomes ${B}. Find the number that was removed.`, answer: x, explanation: `Removed number = ${n}×${A} − ${n - 1}×${B} = ${x}.` }; },
  ],
  very_hard: [
    // corrected average after a misread value
    (ri, R) => { const n = ri(5, 12), A = ri(30, 60), per = ri(1, 6) * (R() < 0.5 ? 1 : -1), R1 = ri(20, 60), R2 = R1 + per * n; if (R2 <= 0 || A + per <= 0) return null; return { stem: `The average of ${n} numbers was calculated as ${A}. Later it was found that one number was wrongly read as ${R1} instead of ${R2}. Find the correct average.`, answer: A + per, explanation: `Correct average = ${A} + (${R2} − ${R1}) ÷ ${n} = ${A} + (${per * n}) ÷ ${n} = ${A + per}.` }; },
    // combined average of three groups
    (ri) => { const n1 = ri(5, 20), n2 = ri(5, 20), n3 = ri(5, 20), a1 = ri(20, 50), a2 = ri(20, 50), a3 = ri(20, 50); const tot = n1 * a1 + n2 * a2 + n3 * a3, N = n1 + n2 + n3; if (tot % N !== 0) return null; return { stem: `Three teams have ${n1}, ${n2} and ${n3} members with average scores ${a1}, ${a2} and ${a3} respectively. Find the average score of all the members taken together.`, answer: tot / N, explanation: `Total score = ${n1}×${a1} + ${n2}×${a2} + ${n3}×${a3} = ${tot}; overall average = ${tot} ÷ ${N} = ${tot / N}.` }; },
    // teacher's age from the rise in average
    (ri) => { const n = ri(20, 40), A = ri(12, 16), d = ri(1, 3); return { stem: `The average age of a class of ${n} students is ${A} years. When the teacher's age is included, the average rises by ${d} year(s). Find the teacher's age (in years).`, answer: A + (n + 1) * d, explanation: `Teacher's age = ${A} + (${n}+1)×${d} = ${A + (n + 1) * d} years.`, unit: { post: " years" } }; },
    // average of the first n multiples of k
    (ri) => { const k = ri(2, 12), n = ri(3, 15); if ((k * (n + 1)) % 2 !== 0) return null; return { stem: `Find the average of the first ${n} multiples of ${k}.`, answer: (k * (n + 1)) / 2, explanation: `Average of the first n multiples of k = k(n+1)/2 = ${k}×(${n}+1)/2 = ${(k * (n + 1)) / 2}.` }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Average", file: "arithmetic-average-01.json", subtypes });
