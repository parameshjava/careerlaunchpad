// Arithmetic → Stocks and Shares (200 Qs, ~50/tier). Face value ₹100 throughout;
// investments built as exact multiples. Run: node .../arith-stocks-and-shares.gen.mjs
import { run } from "./lib.mjs";
const M = { pre: "₹" }, SH = { post: " shares" }, PCT = { post: "%" };

const subtypes = {
  easy: [
    (ri) => { const n = ri(10, 300), MV = ri(80, 260); return { stem: `A man buys ${n} shares of face value ₹100 at a market price of ₹${MV} per share. Find his total investment.`, answer: n * MV, explanation: `Investment = ${n} × ₹${MV} = ₹${n * MV}.`, unit: M }; },
    (ri) => { const n = ri(10, 400), d = ri(4, 20); return { stem: `A person holds ${n} shares of face value ₹100 in a company that pays a dividend of ${d}%. Find his total annual dividend income.`, answer: n * d, explanation: `Dividend per share = ${d}% of ₹100 = ₹${d}; total = ${n} × ₹${d} = ₹${n * d}.`, unit: M }; },
    (ri) => { const MV = ri(80, 250), n = ri(10, 150), d = ri(4, 20); return { stem: `By investing ₹${n * MV} in a ${d}% stock (face value ₹100) quoted at ₹${MV}, find the annual income.`, answer: n * d, explanation: `Shares = ₹${n * MV}/₹${MV} = ${n}; income = ${n} × ₹${d} = ₹${n * d}.`, unit: M }; },
  ],
  medium: [
    (ri) => { const MV = ri(80, 250), n = ri(10, 200); return { stem: `A man invests ₹${n * MV} in shares of face value ₹100 selling at ₹${MV} each. How many shares does he buy?`, answer: n, explanation: `Number of shares = ₹${n * MV}/₹${MV} = ${n}.`, unit: SH }; },
    (ri) => { const d = ri(4, 20), shares = ri(10, 200), MV = ri(80, 250); return { stem: `How much should a man invest in a ${d}% stock (face value ₹100) at ₹${MV} to earn an annual income of ₹${shares * d}?`, answer: shares * MV, explanation: `Shares needed = ₹${shares * d}/₹${d} = ${shares}; investment = ${shares} × ₹${MV} = ₹${shares * MV}.`, unit: M }; },
    (ri) => { const d = ri(4, 20), n = ri(10, 300); return { stem: `A man earns ₹${n * d} annually as dividend from a company paying ${d}% on shares of face value ₹100. How many shares does he hold?`, answer: n, explanation: `Number of shares = ₹${n * d}/₹${d} = ${n}.`, unit: SH }; },
  ],
  hard: [
    (ri) => { const MV = ri(80, 240), br = ri(1, 5), n = ri(10, 150), d = ri(4, 20); return { stem: `By investing ₹${n * (MV + br)} in a ${d}% stock (face value ₹100) at ₹${MV}, with a brokerage of ₹${br} per share, find the annual income.`, answer: n * d, explanation: `Cost per share = ₹${MV}+₹${br} = ₹${MV + br}; shares = ₹${n * (MV + br)}/₹${MV + br} = ${n}; income = ${n} × ₹${d} = ₹${n * d}.`, unit: M }; },
    (ri) => { const shares = ri(10, 150), MV = ri(80, 240), br = ri(1, 5), d = ri(4, 20); return { stem: `How much must be invested in a ${d}% stock (face value ₹100) at ₹${MV}, with a brokerage of ₹${br} per share, to obtain an annual income of ₹${shares * d}?`, answer: shares * (MV + br), explanation: `Shares = ₹${shares * d}/₹${d} = ${shares}; investment = ${shares} × ₹${MV + br} = ₹${shares * (MV + br)}.`, unit: M }; },
    (ri) => { const MV = ri(120, 300), n = ri(50, 250), d = ri(6, 20); return { stem: `A man invests ₹${n * MV} in a ${d}% stock (face value ₹100) at ₹${MV}. Find his annual income.`, answer: n * d, explanation: `Shares = ${n}; income = ${n} × ₹${d} = ₹${n * d}.`, unit: M }; },
  ],
  very_hard: [
    (ri) => { const d = ri(4, 20), y = ri(2, 15), MV = (100 * d) / y; if (!Number.isInteger(MV) || MV < 50 || MV > 400) return null; return { stem: `Find the percentage return (yield) obtained on a ${d}% stock of face value ₹100 that is purchased at ₹${MV}.`, answer: y, explanation: `Yield = (dividend/investment)×100 = (${d}/${MV})×100 = ${y}%.`, unit: PCT }; },
    (ri) => { const n = ri(20, 100), MV1 = ri(100, 200), MV2 = ri(80, 150); if ((n * MV1) % MV2 !== 0) return null; const newShares = (n * MV1) / MV2, d2 = ri(4, 20); return { stem: `A man sells ${n} shares (face value ₹100) at ₹${MV1} each and invests the entire proceeds in another ${d2}% stock quoted at ₹${MV2}. Find his new annual income.`, answer: newShares * d2, explanation: `Proceeds = ₹${n * MV1}; new shares = ₹${n * MV1}/₹${MV2} = ${newShares}; income = ${newShares} × ₹${d2} = ₹${newShares * d2}.`, unit: M }; },
    (ri) => { const d = ri(5, 20), shares = ri(50, 300), MV = ri(90, 260); return { stem: `A man wishes to earn ₹${shares * d} per year from a ${d}% stock (face value ₹100) selling at ₹${MV}. How much must he invest?`, answer: shares * MV, explanation: `Shares = ₹${shares * d}/₹${d} = ${shares}; investment = ${shares} × ₹${MV} = ₹${shares * MV}.`, unit: M }; },
  ],
};

run({ subject: "Arithmetic", chapter: "Stocks and Shares", file: "arithmetic-stocks-and-shares-01.json", subtypes });
