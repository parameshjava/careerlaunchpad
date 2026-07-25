#!/usr/bin/env node
// Append a batch of transcribed questions into a paper's per-subject import file.
// Transcription happens in batches of pages, so batches land as small fragment
// files and get merged into the one-file-per-subject shape the importer wants.
//
// Duplicates (same chapter + stem, case/space-insensitive — the importer's own
// rule) are dropped with a note, so re-running a batch is safe.
//
// Usage: node question-imports/icet/merge.mjs <paper-slug> <fragment.json> [...]
//   fragment = { subject, questions: [...] }  (same shape as an import file)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SUBJECT_SLUGS } from "./taxonomy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [slug, ...fragments] = process.argv.slice(2);
if (!slug || fragments.length === 0) {
  console.error("usage: merge.mjs <paper-slug> <fragment.json> [...]");
  process.exit(2);
}

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// A paper whose printed key cannot be trusted is dropped whole (see key-status.mjs).
// Refuse to write its questions rather than relying on anyone remembering the rule.
const statusPath = join(here, "key-status.json");
if (existsSync(statusPath)) {
  const status = JSON.parse(readFileSync(statusPath, "utf8"));
  const paper = status.papers.find((p) => p.slug === slug);
  if (paper && !paper.trusted) {
    console.error(`✗ ${slug}: refusing to merge — ${paper.status}: ${paper.why}`);
    console.error("  Questions from this paper are not imported. See REVIEW.md §1.1.");
    process.exit(1);
  }
  if (!paper) console.error(`! ${slug}: not in key-status.json — run key-status.mjs`);
}

for (const fragmentPath of fragments) {
  const fragment = JSON.parse(readFileSync(fragmentPath, "utf8"));
  const subject = fragment.subject;
  const subjectSlug = SUBJECT_SLUGS[subject];
  if (!subjectSlug) {
    console.error(`✗ ${fragmentPath}: unknown subject "${subject}"`);
    process.exit(1);
  }

  const dir = join(here, "papers", slug);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${subjectSlug}.json`);
  const existing = existsSync(target)
    ? JSON.parse(readFileSync(target, "utf8"))
    : { subject, questions: [] };

  const seen = new Set(existing.questions.map((q) => `${norm(q.chapter)}::${norm(q.stem)}`));
  let added = 0;
  let skipped = 0;
  for (const q of fragment.questions) {
    const key = `${norm(q.chapter)}::${norm(q.stem)}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    existing.questions.push(q);
    added++;
  }

  writeFileSync(target, JSON.stringify(existing, null, 2) + "\n");
  console.log(
    `${target}: +${added}${skipped ? ` (${skipped} duplicate${skipped > 1 ? "s" : ""} skipped)` : ""} → ${existing.questions.length} total`,
  );
}
