#!/usr/bin/env node
// Extract the answer key + per-page question layout from a TCS-iON "Question
// Paper Preview" ICET PDF, WITHOUT vision.
//
// In these previews the stems and option labels are images, and each option is
// marked with a GREEN TICK (correct) or a RED CROSS (incorrect) — the paper's own
// notation. Two packagings occur across the years:
//
//   • 2020-2026 papers: the tick/cross is a separate 16x16 icon image.
//   • 2019 / TS-2024 papers: the icon is baked into a full-width option-row image.
//
// Both are handled the same way: dump every image on a page as a PPM (poppler
// decodes the JPEGs for us), measure how green vs. red it is, and keep the ones
// that are dominantly one or the other. Those markers stream in reading order, so
// grouping them into fours gives the correct option (1-4) per question.
//
// The key is a CHECKSUM for the vision transcription pass, not a replacement: the
// transcriber sees the same ticks on the rendered page. Any question whose marker
// group isn't exactly one tick + three crosses is flagged `suspect` for review.
//
// Usage: node question-imports/icet/extract-key.mjs <paper.pdf> [-o out.json]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pdf = process.argv[2];
if (!pdf) {
  console.error("usage: extract-key.mjs <paper.pdf> [-o out.json]");
  process.exit(2);
}
const outIdx = process.argv.indexOf("-o");
const out = outIdx > 0 ? process.argv[outIdx + 1] : null;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28 });

// Markers are small: a 16x16 icon or a single option row. Anything bigger is a
// stem or a chart (DI pie charts are colourful — this keeps them out).
const MAX_MARKER_AREA = 60_000;
const MIN_MARKED_PIXELS = 12; // a tick is a few dozen coloured pixels at worst

// ── PPM (P6) reader → { width, height, data } ────────────────────────────────
function readPPM(path) {
  const buf = readFileSync(path);
  if (buf[0] !== 0x50 || buf[1] !== 0x36) return null; // not P6
  // Header: P6 <ws> width <ws> height <ws> maxval <single ws> then binary data.
  let pos = 2;
  const nextToken = () => {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos++;
    if (String.fromCharCode(buf[pos]) === "#") {
      while (pos < buf.length && buf[pos] !== 0x0a) pos++;
      return nextToken();
    }
    let s = "";
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) s += String.fromCharCode(buf[pos++]);
    return s;
  };
  const width = Number(nextToken());
  const height = Number(nextToken());
  const maxval = Number(nextToken());
  pos++; // the single whitespace before the pixel data
  if (!width || !height || maxval !== 255) return null;
  return { width, height, data: buf.subarray(pos) };
}

// How many clearly-green and clearly-red pixels an image holds. The tick is a
// saturated green glyph, the cross a saturated red one; the rest is black text
// on white, which is neutral and counts for neither.
function colorProfile(ppm) {
  let green = 0;
  let red = 0;
  const { data } = ppm;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > r + 40 && g > b + 40) green++;
    else if (r > g + 40 && r > b + 40) red++;
  }
  return { green, red };
}

// ── 1) question blocks, in document order, with their page ────────────────────
// Headers live in the text layer: "Question Number : N Question Id : X". The
// header PRECEDES its stem, and bilingual papers repeat a header, so dedupe by
// question id keeping first sight.
const pageCount = Number(run("pdfinfo", [pdf]).match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
const pageText = [];
const blocks = [];
const seen = new Set();
for (let p = 1; p <= pageCount; p++) {
  const text = run("pdftotext", ["-f", String(p), "-l", String(p), pdf, "-"]);
  pageText[p] = text;
  for (const m of text.matchAll(/Question Number : (\d+) Question Id : (\d+)/g)) {
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    blocks.push({ q: Number(m[1]), id, header_page: p });
  }
}
const firstHeaderPage = blocks[0]?.header_page ?? 1;

// ── 2) option markers, page by page, in reading order ─────────────────────────
// Pages before the first question header are front matter — the cover-page legend
// ("Options shown in green … are correct") carries a tick and a cross of its own.
const listRows = run("pdfimages", ["-list", pdf])
  .split("\n")
  .map((l) => l.trim().split(/\s+/))
  .filter((c) => c[2] === "image" || c[2] === "smask")
  .map((c) => ({ page: Number(c[0]), type: c[2], w: Number(c[3]), h: Number(c[4]) }));

const markers = [];
const tmp = mkdtempSync(join(tmpdir(), "icet-key-"));
try {
  for (let p = firstHeaderPage; p <= pageCount; p++) {
    const onPage = listRows.filter((r) => r.page === p);
    if (onPage.length === 0) continue;
    // Skip pages whose images are all too big to be markers — saves the dump.
    if (!onPage.some((r) => r.type === "image" && r.w * r.h <= MAX_MARKER_AREA)) continue;

    const prefix = join(tmp, `p${p}`);
    run("pdfimages", ["-f", String(p), "-l", String(p), pdf, prefix]);
    // pdfimages writes <prefix>-NNN.<ext> in the same order as -list, one file
    // per image AND per smask, so sorting by NNN restores that order.
    const files = readdirSync(tmp)
      .filter((f) => f.startsWith(`p${p}-`))
      .sort((a, b) => Number(a.match(/-(\d+)\./)[1]) - Number(b.match(/-(\d+)\./)[1]));

    for (const f of files) {
      const ppm = readPPM(join(tmp, f));
      rmSync(join(tmp, f));
      if (!ppm) continue; // smasks are P5 greyscale — skipped
      if (ppm.width * ppm.height > MAX_MARKER_AREA) continue;
      const { green, red } = colorProfile(ppm);
      if (Math.max(green, red) < MIN_MARKED_PIXELS) continue;
      // A marker is decisively one colour; a coloured figure is not.
      const size = `${ppm.width}x${ppm.height}`;
      if (green > red * 2) markers.push({ page: p, mark: "tick", size, green, red });
      else if (red > green * 2) markers.push({ page: p, mark: "cross", size, green, red });
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ── 3) keep only the real option markers ─────────────────────────────────────
// Option markers are uniform: one shape repeated four times per question. A few
// other images can still read as green/red (a coloured word inside a stem), so
// narrow to the shape class whose count lands nearest 4 × questions — by exact
// size first (16x16 icons; TS-2024's 753x41 rows), then by width alone (2019
// papers, where option rows share a width but vary in height).
const target = blocks.length * 4;
const tally = (keyOf) => {
  const counts = new Map();
  for (const m of markers) counts.set(keyOf(m), (counts.get(keyOf(m)) ?? 0) + 1);
  return counts;
};
const best = (counts) =>
  [...counts.entries()].sort((a, b) => Math.abs(a[1] - target) - Math.abs(b[1] - target))[0];
const bySize = best(tally((m) => m.size));
const byWidth = best(tally((m) => m.size.split("x")[0]));
const chosen =
  bySize && Math.abs(bySize[1] - target) <= Math.abs((byWidth?.[1] ?? Infinity) - target)
    ? { by: "size", value: bySize[0], count: bySize[1] }
    : { by: "width", value: byWidth[0], count: byWidth[1] };
const marker_class = chosen;
const kept = markers.filter((m) =>
  chosen.by === "size" ? m.size === chosen.value : m.size.split("x")[0] === chosen.value,
);

// ── 4) group markers into questions ──────────────────────────────────────────
const groups = [];
for (let i = 0; i + 3 < kept.length; i += 4) {
  const four = kept.slice(i, i + 4);
  groups.push({
    correct_option: four.findIndex((m) => m.mark === "tick") + 1 || null,
    ticks: four.filter((m) => m.mark === "tick").length,
    pages: [...new Set(four.map((m) => m.page))],
  });
}

const key = blocks.map((b, i) => {
  const g = groups[i];
  return {
    q: b.q,
    question_id: b.id,
    header_page: b.header_page,
    // The stem + options render after the header, so a question occupies its
    // header page and often the next one.
    read_pages: g ? [...new Set([b.header_page, ...g.pages])].sort((x, y) => x - y) : [b.header_page],
    correct_option: g?.correct_option ?? null,
    suspect: !g || g.ticks !== 1,
  };
});

const report = {
  pdf,
  pages: pageCount,
  markers: kept.length,
  marker_class,
  marker_sizes_seen: markers.reduce((a, m) => ({ ...a, [m.size]: (a[m.size] ?? 0) + 1 }), {}),
  marker_groups: groups.length,
  questions: blocks.length,
  // Sound only if the markers divide evenly into 4-option groups, one per question.
  aligned: kept.length === blocks.length * 4,
  distribution: key.reduce((a, k) => ({ ...a, [k.correct_option]: (a[k.correct_option] ?? 0) + 1 }), {}),
  suspect_questions: key.filter((k) => k.suspect).map((k) => k.q),
  key,
};

const json = JSON.stringify(report, null, 2) + "\n";
if (out) writeFileSync(out, json);
else process.stdout.write(json);
console.error(
  `  questions=${blocks.length} markers=${kept.length} aligned=${report.aligned} suspect=${report.suspect_questions.length} dist=${JSON.stringify(report.distribution)}`,
);
