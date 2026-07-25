#!/usr/bin/env node
// Print "<slug>\t<file>" for every usable paper in the manifest — the stable id
// each paper's key file, output folder and progress state are named after.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

export function paperSlug(p) {
  const board = (p.board ?? "xx").toLowerCase();
  const month = {
    jan: "01", feb: "02", mar: "03", apr: "04", april: "04", may: "05", jun: "06",
    june: "06", jul: "07", july: "08", aug: "08", sep: "09", sept: "09", oct: "10",
    nov: "11", dec: "12",
  };
  const m = (p.date ?? "").match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  const date = m
    ? `${m[3]}-${month[m[2].slice(0, 4).toLowerCase()] ?? month[m[2].slice(0, 3).toLowerCase()] ?? "00"}-${m[1].padStart(2, "0")}`
    : String(p.year ?? "unknown");
  return `${board}-icet-${date}-s${p.shift ?? 1}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const onlyText = process.argv.includes("--with-text-layer");
  for (const p of manifest.papers) {
    if (!p.usable) continue;
    if (onlyText && !p.has_text_layer) continue;
    process.stdout.write(`${paperSlug(p)}\t${p.file}\n`);
  }
}
