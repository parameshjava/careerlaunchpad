#!/usr/bin/env node
// Triage the raw ICET question papers in /Users/paramesh/LP/materials into a
// manifest the transcription pass works from. Poppler-only (pdftotext/pdfinfo/
// pdfimages), no deps.
//
// For each PDF it records: the paper's own metadata (name, board, year, shift),
// page count, the unique question ids, whether a text layer exists (scan-only
// papers need vision for everything), the md5 (to spot byte-identical duplicates)
// and the language mix. The answer key itself comes from extract-key.mjs.
//
// Usage: node question-imports/icet/build-manifest.mjs [materialsDir]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MATERIALS = process.argv[2] ?? "/Users/paramesh/LP/materials";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "manifest.json");

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  } catch {
    return "";
  }
};

// Two papers are image-only scans with no text layer at all, so their own header
// can't be parsed — it was read off the rendered cover page instead. Both print the
// usual green-tick notation and "Actual Answer Key: Yes".
const SCAN_METADATA = {
  "1712571043phppMwItv.pdf": "AP ICET 2020 10th Sep 2020 Shift 1",
  "1712571122phpXb6ku4.pdf": "AP ICET 2020 10th Sep 2020 Shift 2",
};

// Telugu: U+0C00–U+0C7F. Urdu/Arabic: U+0600–U+06FF.
const hasTelugu = (s) => /[ఀ-౿]/.test(s);
const hasUrdu = (s) => /[؀-ۿ]/.test(s);

// "AP ICET 2023 24th May 2023 Shift 1" → board/year/shift/date.
function parsePaperName(name) {
  const board = /^TG/i.test(name) ? "TG" : /^TS/i.test(name) ? "TS" : /^AP/i.test(name) ? "AP" : null;
  const years = [...name.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const shift = name.match(/Shift\s*(\d)|\bS(\d)\b/i);
  const date = name.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+((?:19|20)\d{2})\b/);
  return {
    board,
    year: years.length ? Math.max(...years) : null,
    shift: shift ? Number(shift[1] ?? shift[2]) : null,
    date: date ? `${date[1]} ${date[2]} ${date[3]}` : null,
  };
}

const files = readdirSync(MATERIALS)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort();

const entries = files.map((file) => {
  const path = join(MATERIALS, file);
  const md5 = createHash("md5").update(readFileSync(path)).digest("hex");
  const info = run("pdfinfo", [path]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);

  const text = run("pdftotext", [path, "-"]);
  const meta = run("pdftotext", ["-layout", "-f", "1", "-l", "2", path, "-"]);
  // The TCS-iON preview header lists the paper name in a two-column layout; the
  // value can land on the same line or a later one, so take the first plausible
  // "<BOARD> ICET <year> …" string anywhere in the first two pages.
  const paperName =
    SCAN_METADATA[file] ??
    meta.match(/((?:AP|TS|TG)\s*ICET[^\n]*?(?:Shift\s*\d|S\d)[^\n]*)/i)?.[1]?.trim() ??
    meta.match(/((?:AP|TS|TG)\s*ICET\s*(?:19|20)\d{2}[^\n]*)/i)?.[1]?.trim() ??
    null;

  const questionIds = [...new Set([...text.matchAll(/Question Id : (\d+)/g)].map((m) => m[1]))];
  const fromFilename = parsePaperName(file);
  const fromPaper = paperName ? parsePaperName(paperName) : {};

  return {
    file,
    md5,
    pages,
    bytes: readFileSync(path).length,
    paper_name: paperName,
    board: fromPaper.board ?? fromFilename.board,
    year: fromPaper.year ?? fromFilename.year,
    shift: fromPaper.shift ?? fromFilename.shift,
    date: fromPaper.date ?? fromFilename.date,
    has_text_layer: text.trim().length > 0,
    question_blocks: (text.match(/Question Number :/g) ?? []).length,
    unique_question_ids: questionIds.length,
    languages: [
      "English",
      hasTelugu(text) ? "Telugu" : null,
      hasUrdu(text) || /urdu/i.test(file) ? "Urdu" : null,
    ].filter(Boolean),
    urdu_edition: /urdu/i.test(file),
  };
});

// Byte-identical duplicates, and same-paper duplicates (a paper we already have
// in another file — prefer the one with a text layer, then the larger id list).
const byMd5 = new Map();
for (const e of entries) {
  if (byMd5.has(e.md5)) e.duplicate_of = byMd5.get(e.md5);
  else byMd5.set(e.md5, e.file);
}
const byPaper = new Map();
for (const e of entries) {
  if (!e.paper_name || e.duplicate_of) continue;
  const key = `${e.board}|${e.year}|${e.shift}|${e.date}`;
  const prev = byPaper.get(key);
  if (!prev) {
    byPaper.set(key, e);
    continue;
  }
  // Keep the richer edition; mark the other as a same-paper duplicate.
  const better =
    Number(e.has_text_layer) - Number(prev.has_text_layer) ||
    e.unique_question_ids - prev.unique_question_ids ||
    Number(prev.urdu_edition) - Number(e.urdu_edition);
  if (better > 0) {
    prev.same_paper_as = e.file;
    byPaper.set(key, e);
  } else {
    e.same_paper_as = prev.file;
  }
}

for (const e of entries) {
  // A paper is usable if it carries questions and is not a duplicate edition.
  const notAPaper = e.unique_question_ids === 0 && e.has_text_layer;
  e.usable = !e.duplicate_of && !e.same_paper_as && !notAPaper;
  e.note = e.duplicate_of
    ? `byte-identical duplicate of ${e.duplicate_of}`
    : e.same_paper_as
      ? `same paper as ${e.same_paper_as} (richer edition kept)`
      : notAPaper
        ? "no question blocks — not a question paper"
        : !e.has_text_layer
          ? "scan only (no text layer) — vision needed for numbering + key"
          : null;
}

const manifest = {
  generated_from: MATERIALS,
  papers: entries,
  summary: {
    files: entries.length,
    usable: entries.filter((e) => e.usable).length,
    questions_estimated: entries
      .filter((e) => e.usable)
      .reduce((n, e) => n + (e.unique_question_ids || 200), 0),
  },
};

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${OUT}: ${manifest.summary.usable}/${manifest.summary.files} usable, ~${manifest.summary.questions_estimated} questions`);
for (const e of entries) {
  console.log(
    `${e.usable ? "✓" : "·"} ${e.file}\n    ${e.paper_name ?? "(no paper name)"} | ${e.pages}p | ids=${e.unique_question_ids} | ${e.languages.join("+")}${e.note ? `\n    ${e.note}` : ""}`,
  );
}
