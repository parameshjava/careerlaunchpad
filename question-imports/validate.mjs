#!/usr/bin/env node
// Validate a question-import JSON file against the import contract + quality bar.
// Usage: node question-imports/validate.mjs <file.json> [<file2.json> ...]
// Exits non-zero if any file fails. No deps (Node built-ins only).
//
// ponytail: mirrors the server checks in lib/exam-validation.ts + the JSON schema
// (public/exam/question-import.schema.json) so a file that passes here imports clean.
import { readFileSync } from "node:fs";

const DIFFICULTIES = ["easy", "medium", "hard", "very_hard"];
const KINDS = ["standard", "passage", "data_sufficiency"];
const ANSWER_TYPES = ["single", "multi"];

function validateFile(path) {
  const errs = [];
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return [`${path}: not valid JSON — ${e.message}`];
  }

  if (typeof data.subject !== "string" || !data.subject.trim())
    errs.push("subject: required non-empty string");
  const passRefs = new Set((data.passages ?? []).map((p) => p?.ref));
  if (!Array.isArray(data.questions) || data.questions.length === 0)
    return [`${path}: questions must be a non-empty array`];

  const byLevel = { easy: 0, medium: 0, hard: 0, very_hard: 0 };
  const stems = new Set();

  data.questions.forEach((q, i) => {
    const at = `q[${i}]`;
    if (typeof q.chapter !== "string" || !q.chapter.trim()) errs.push(`${at}.chapter: required`);
    const kind = q.kind ?? "standard";
    if (!KINDS.includes(kind)) errs.push(`${at}.kind: invalid (${kind})`);
    if (!DIFFICULTIES.includes(q.difficulty)) errs.push(`${at}.difficulty: invalid (${q.difficulty})`);
    else byLevel[q.difficulty]++;
    if (!ANSWER_TYPES.includes(q.answer_type)) errs.push(`${at}.answer_type: invalid (${q.answer_type})`);
    if (typeof q.stem !== "string" || !q.stem.trim()) errs.push(`${at}.stem: required`);
    else {
      const key = q.stem.trim().toLowerCase();
      if (stems.has(key)) errs.push(`${at}.stem: duplicate of an earlier question`);
      stems.add(key);
    }
    if (typeof q.explanation !== "string" || !q.explanation.trim())
      errs.push(`${at}.explanation: required (every question must explain its answer)`);

    if (kind === "passage") {
      if (!q.passage_ref) errs.push(`${at}.passage_ref: required for passage question`);
      else if (!passRefs.has(q.passage_ref)) errs.push(`${at}.passage_ref: "${q.passage_ref}" not in passages[]`);
    } else if (q.passage_ref) errs.push(`${at}.passage_ref: only allowed on passage questions`);

    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 4 || opts.length > 5) errs.push(`${at}.options: must be 4 or 5 (got ${opts.length})`);
    const labels = new Set();
    opts.forEach((o, j) => {
      if (typeof o?.label !== "string" || !o.label.trim()) errs.push(`${at}.options[${j}].label: required`);
      else {
        const lk = o.label.trim().toLowerCase();
        if (labels.has(lk)) errs.push(`${at}.options[${j}].label: duplicate option "${o.label}"`);
        labels.add(lk);
      }
      if (typeof o?.is_correct !== "boolean") errs.push(`${at}.options[${j}].is_correct: must be boolean`);
    });
    const correct = opts.filter((o) => o?.is_correct === true).length;
    if (correct < 1) errs.push(`${at}.options: at least one correct answer required`);
    if (q.answer_type === "single" && correct !== 1)
      errs.push(`${at}: answer_type 'single' needs exactly one correct option (got ${correct})`);
  });

  // Report per-level distribution (uniform target is a warning, not a hard fail).
  const levels = DIFFICULTIES.map((d) => `${d}=${byLevel[d]}`).join("  ");
  const counts = new Set(Object.values(byLevel));
  const uniform = counts.size === 1 ? "uniform ✓" : "NOT uniform ⚠";
  console.log(`${path}: ${data.questions.length} questions  [${levels}]  ${uniform}`);
  return errs;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node validate.mjs <file.json> ...");
  process.exit(2);
}
let failed = false;
for (const f of files) {
  const errs = validateFile(f);
  if (errs.length) {
    failed = true;
    console.error(`\n✗ ${f}:\n  ${errs.join("\n  ")}`);
  }
}
if (failed) process.exit(1);
console.log("\nAll files valid ✓");
