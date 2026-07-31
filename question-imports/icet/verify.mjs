#!/usr/bin/env node
// Cross-check every paper's per-subject files against the count recorded in its
// state.json, and mirror the work to a backup directory.
//
// Why this exists: these import files are NOT committed while transcription is in
// progress, and a git operation elsewhere in the repo (a checkout, restore or reset
// touching a tracked file) silently reverted one of them mid-run — 15 questions
// vanished with no error anywhere. Counts are the cheapest tripwire: state.json
// says how many questions a paper should hold, so a mismatch means loss.
//
// Usage:
//   node question-imports/icet/verify.mjs            # check only
//   node question-imports/icet/verify.mjs --backup   # check, then mirror to backup
//   node question-imports/icet/verify.mjs --restore  # copy any short file back from backup
import { cpSync, existsSync, globSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PAPERS = join(here, "papers");
const BACKUP = join(here, ".backup");

const countIn = (dir) =>
  globSync(join(dir, "*.json"))
    .filter((f) => basename(f) !== "state.json")
    .reduce((n, f) => n + JSON.parse(readFileSync(f, "utf8")).questions.length, 0);

const paperDirs = globSync(join(PAPERS, "*")).filter((d) => existsSync(join(d, "state.json")));

let problems = 0;
let total = 0;
for (const dir of paperDirs) {
  const slug = basename(dir);
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  const actual = countIn(dir);
  total += actual;
  const expected = state.imported ?? 0;

  if (actual === expected) {
    // Second tripwire: every question in the paper must be accounted for, either
    // imported or explicitly excluded. A question that is simply skipped between
    // two read batches leaves the file counts self-consistent, so only this sum
    // catches it (it caught ap-icet-2026-05-02-s1 Q160).
    const totalQ = state.questions_total ?? 0;
    const excluded = (state.excluded ?? []).length;
    const seen = state.transcribed_through_question ?? 0;
    if (totalQ && seen >= totalQ && actual + excluded !== totalQ) {
      problems++;
      console.log(
        `✗ ${slug}: ${actual} imported + ${excluded} excluded = ${actual + excluded}, but the paper has ${totalQ} questions` +
          ` — ${totalQ - actual - excluded} unaccounted for`,
      );
      continue;
    }
    console.log(`✓ ${slug}: ${actual} questions (state: ${expected})`);
    continue;
  }

  problems++;
  const short = expected - actual;
  console.log(
    `✗ ${slug}: ${actual} questions but state.json says ${expected} — ${short > 0 ? `${short} MISSING` : `${-short} extra`}`,
  );

  // A shortfall usually means a tracked file was reverted; the backup can restore it.
  if (short > 0 && process.argv.includes("--restore")) {
    const backupDir = join(BACKUP, slug);
    if (!existsSync(backupDir)) {
      console.log(`    no backup at ${backupDir} — recover from the scratchpad fragments instead`);
      continue;
    }
    for (const f of globSync(join(backupDir, "*.json"))) {
      const target = join(dir, basename(f));
      const backupCount = JSON.parse(readFileSync(f, "utf8")).questions?.length ?? null;
      const liveCount = existsSync(target)
        ? (JSON.parse(readFileSync(target, "utf8")).questions?.length ?? null)
        : -1;
      if (backupCount != null && liveCount != null && backupCount > liveCount) {
        cpSync(f, target);
        console.log(`    restored ${basename(f)}: ${liveCount} → ${backupCount}`);
      }
    }
  }
}

if (process.argv.includes("--backup") && problems === 0) {
  mkdirSync(BACKUP, { recursive: true });
  cpSync(PAPERS, BACKUP, { recursive: true });
  console.log(`\nmirrored ${paperDirs.length} paper(s) to ${BACKUP}`);
}

console.log(`\n${paperDirs.length - problems}/${paperDirs.length} papers intact · ${total} questions`);
if (problems) {
  console.log("Re-run with --restore, or re-merge the batch fragments from the scratchpad.");
  process.exit(1);
}
