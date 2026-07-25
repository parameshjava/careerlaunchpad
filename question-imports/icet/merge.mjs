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

  // Two duplicates mean different things, so treat them differently:
  //   · against the existing file  → almost certainly a re-run; skip quietly.
  //   · within this one fragment   → two DIFFERENT questions whose stems collide,
  //     usually a generic stem like "Pick up the odd one." with the real content
  //     only in the options. The importer would silently drop one, so refuse and
  //     make the transcriber inline the list into the stem.
  const inFile = new Set(existing.questions.map((q) => `${norm(q.chapter)}::${norm(q.stem)}`));
  const inFragment = new Map();
  const collisions = [];
  fragment.questions.forEach((q, i) => {
    const key = `${norm(q.chapter)}::${norm(q.stem)}`;
    if (inFragment.has(key)) collisions.push({ a: inFragment.get(key) + 1, b: i + 1, stem: q.stem });
    else inFragment.set(key, i);
  });
  if (collisions.length) {
    console.error(`✗ ${fragmentPath}: ${collisions.length} question(s) share a (chapter, stem) key`);
    for (const c of collisions)
      console.error(`    q[${c.a}] and q[${c.b}]: "${c.stem.slice(0, 70)}"`);
    console.error("  The importer dedupes on (chapter, stem) and would drop one.");
    console.error("  Fix: put the distinguishing content in the stem, not only in the options.");
    process.exit(1);
  }

  const seen = inFile;
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
