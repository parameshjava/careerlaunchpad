#!/usr/bin/env node
// Validate an ASSESSMENT-bank import file before upload. Mirrors the server checks
// so a file that passes here imports clean:
//   · lib/exam-validation.ts#validateQuestionFields — enums, stem, 4-5 options,
//     ≥1 correct, single ⇒ exactly 1, explanation required, source_year range
//   · lib/assessment-validation.ts — kind limited to standard|data_sufficiency
//   · app/api/assessment/questions/import/route.ts — one subject per file, chapter
//     must exist in that subject, (chapter, stem) duplicates are skipped
// Chapter names are checked against the ICET taxonomy in migration 126.
//
// Usage: node question-imports/icet/validate.mjs <file.json> [more.json …]
//        node question-imports/icet/validate.mjs --all      # every icet/**/*.json
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { icetTaxonomy } from "./taxonomy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIFFICULTIES = ["easy", "medium", "hard", "very_hard"];
const KINDS = ["standard", "data_sufficiency"]; // no passages in the assessment bank
const ANSWER_TYPES = ["single", "multi"];
const taxonomy = icetTaxonomy();
const norm = (s) => String(s ?? "").trim().toLowerCase();

function validateFile(path) {
  const errs = [];
  const warns = [];
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { errs: [`not valid JSON — ${e.message}`], warns, count: 0 };
  }

  const subject = typeof data.subject === "string" ? data.subject.trim() : "";
  if (!subject) errs.push("subject: required non-empty string");
  const chapters = taxonomy.get(subject);
  if (subject && !chapters)
    errs.push(`subject: "${subject}" is not an ICET subject in migration 126`);
  const chapterByName = new Map((chapters ?? []).map((c) => [norm(c), c]));

  if (!Array.isArray(data.questions) || data.questions.length === 0)
    return { errs: [...errs, "questions: must be a non-empty array"], warns, count: 0 };

  const seen = new Map(); // chapter::stem → first row, to catch in-file duplicates
  const byChapter = {};
  const byDifficulty = {};
  data.questions.forEach((q, i) => {
    const at = `q[${i + 1}]`;
    const push = (m) => errs.push(`${at}: ${m}`);

    const chapter = typeof q.chapter === "string" ? q.chapter.trim() : "";
    if (!chapter) push("chapter: required");
    else if (chapters && !chapterByName.has(norm(chapter)))
      push(`chapter "${chapter}" is not a chapter of ${subject}`);
    else if (chapters && chapterByName.get(norm(chapter)) !== chapter)
      warns.push(`${at}: chapter "${chapter}" differs in case from "${chapterByName.get(norm(chapter))}"`);
    byChapter[chapter] = (byChapter[chapter] ?? 0) + 1;

    const kind = q.kind ?? "standard";
    if (!KINDS.includes(kind)) push(`kind "${kind}" invalid (standard|data_sufficiency)`);
    if (!DIFFICULTIES.includes(q.difficulty)) push(`difficulty "${q.difficulty}" invalid`);
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1;
    if (!ANSWER_TYPES.includes(q.answer_type)) push(`answer_type "${q.answer_type}" invalid`);

    const stem = typeof q.stem === "string" ? q.stem.trim() : "";
    if (!stem) push("stem: required");
    const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
    if (!explanation) push("explanation: required");
    else if (explanation.length < 20) warns.push(`${at}: explanation looks too short to teach anything`);

    // Provenance — optional server-side, but mandatory for this corpus: every
    // question must name the paper it came from.
    if (typeof q.source !== "string" || !q.source.trim()) push("source: required for imported papers");
    if (!Number.isInteger(q.source_year) || q.source_year < 1900 || q.source_year > 2100)
      push(`source_year: must be a year 1900-2100 (got ${JSON.stringify(q.source_year)})`);

    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length < 4 || options.length > 5) push(`options: 4 or 5 required (got ${options.length})`);
    options.forEach((o, j) => {
      if (typeof o?.label !== "string" || !o.label.trim()) push(`options[${j}].label: required`);
      if (typeof o?.is_correct !== "boolean") push(`options[${j}].is_correct: must be a boolean`);
    });
    const correct = options.filter((o) => o?.is_correct === true).length;
    if (correct < 1) push("options: at least one correct answer required");
    if (q.answer_type === "single" && correct !== 1)
      push(`answer_type 'single' requires exactly one correct option (got ${correct})`);
    const labels = options.map((o) => norm(o?.label));
    if (new Set(labels).size !== labels.length) warns.push(`${at}: duplicate option labels`);

    if (stem && chapter) {
      const dupKey = `${norm(chapter)}::${norm(stem)}`;
      if (seen.has(dupKey)) warns.push(`${at}: duplicate of q[${seen.get(dupKey)}] — the importer will skip it`);
      else seen.set(dupKey, i + 1);
    }

    for (const extra of Object.keys(q))
      if (!["chapter", "kind", "difficulty", "answer_type", "stem", "stem_image_url", "explanation", "source", "source_year", "options"].includes(extra))
        push(`unknown field "${extra}" — the schema forbids extra properties`);
  });

  return { errs, warns, count: data.questions.length, subject, byChapter, byDifficulty };
}

const args = process.argv.slice(2);
const files = args.includes("--all")
  ? globSync(join(here, "papers/*/*.json")).sort()
  : args.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error("usage: validate.mjs <file.json> [...] | --all");
  process.exit(2);
}

let failed = 0;
let total = 0;
for (const f of files) {
  const { errs, warns, count, subject, byDifficulty } = validateFile(f);
  total += count;
  const label = `${basename(dirname(f))}/${basename(f)}`;
  if (errs.length) {
    failed++;
    console.log(`✗ ${label} — ${count} questions, ${errs.length} error(s)`);
    for (const e of errs.slice(0, 40)) console.log(`    ${e}`);
    if (errs.length > 40) console.log(`    … and ${errs.length - 40} more`);
  } else {
    console.log(
      `✓ ${label} — ${count} questions · ${subject} · ${Object.entries(byDifficulty ?? {}).map(([k, v]) => `${k}:${v}`).join(" ")}`,
    );
  }
  for (const w of warns.slice(0, 10)) console.log(`    warn: ${w}`);
  if (warns.length > 10) console.log(`    warn: … and ${warns.length - 10} more`);
}
console.log(`\n${files.length - failed}/${files.length} files valid · ${total} questions`);
process.exit(failed ? 1 : 0);
