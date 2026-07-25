#!/usr/bin/env node
// Decide, per paper, whether its printed answer key can be TRUSTED — and write the
// verdict to key-status.json so the rest of the pipeline can enforce it.
//
// Only questions with a genuine key go into the bank. A wrong "correct" answer
// teaches a wrong method and marks a student who reasoned correctly as wrong, so a
// paper whose key cannot be trusted is dropped whole rather than half-used.
//
// Three ways a key fails, all seen in this corpus:
//   · ABSENT      — no tick/cross marks at all (AP ICET 2019: plain question papers)
//   · PLACEHOLDER — the tick sits on the same option for every question (TS ICET
//                   2024: 200/0/0/0, confirmed wrong by solving two questions)
//   · SKEWED      — the spread across options is too lopsided to be a real key
//
// The test for the last one is a chi-square against a uniform key. With 3 degrees
// of freedom, chi2 > 16.27 would happen by chance in under 1 real key in 1000.
// Papers that pass are still only *presumed* genuine: each question is solved
// independently during transcription, and any disagreement is logged, never imported.
//
// Usage: node question-imports/icet/key-status.mjs [--json]
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { paperSlug } from "./slugs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const KEYS = join(here, "keys");
const OUT = join(here, "key-status.json");
const CHI2_LIMIT = 16.27; // 3 df, p = 0.001

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

function verdictFor(key) {
  const counts = [1, 2, 3, 4].map((i) => key.key.filter((k) => k.correct_option === i).length);
  const marked = counts.reduce((a, b) => a + b, 0);
  const expected = marked / 4;
  const chi2 = marked ? counts.reduce((a, o) => a + (o - expected) ** 2 / expected, 0) : 0;

  if (marked === 0)
    return { status: "absent", trusted: false, counts, chi2, why: "no tick/cross marks in the paper" };
  if (Math.max(...counts) >= marked * 0.9)
    return {
      status: "placeholder",
      trusted: false,
      counts,
      chi2,
      why: `the same option is marked for ${Math.max(...counts)} of ${marked} questions`,
    };
  if (chi2 > CHI2_LIMIT)
    return {
      status: "skewed",
      trusted: false,
      counts,
      chi2,
      why: `answer spread ${counts.join("/")} is too lopsided for a genuine key (chi2 ${chi2.toFixed(1)})`,
    };
  if (!key.aligned || key.suspect_questions.length)
    return {
      status: "partial",
      trusted: false,
      counts,
      chi2,
      why: `${key.suspect_questions.length} question(s) have a malformed marker group`,
    };
  return { status: "genuine", trusted: true, counts, chi2, why: null };
}

const papers = [];
for (const p of manifest.papers) {
  if (!p.usable) continue;
  const slug = paperSlug(p);
  const keyPath = join(KEYS, `${slug}.json`);

  if (!existsSync(keyPath)) {
    // Scan-only papers have no text layer, so extract-key.mjs cannot run; their key
    // IS printed (ticks are visible in the scan) and must be read during transcription.
    papers.push({
      slug,
      file: p.file,
      paper: p.paper_name,
      status: p.has_text_layer ? "not_extracted" : "vision_only",
      trusted: p.has_text_layer ? false : true,
      why: p.has_text_layer
        ? "no key file — run extract-key.mjs"
        : "image-only scan: the tick is visible but must be read page by page, and every question re-solved",
    });
    continue;
  }

  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const v = verdictFor(key);
  papers.push({
    slug,
    file: p.file,
    paper: p.paper_name,
    questions: key.questions,
    distribution: v.counts.join("/"),
    chi2: Number(v.chi2.toFixed(1)),
    status: v.status,
    trusted: v.trusted,
    why: v.why,
  });
}

const trusted = papers.filter((p) => p.trusted);
writeFileSync(
  OUT,
  JSON.stringify(
    {
      rule: "Only papers with a genuine printed key are transcribed; the rest are dropped whole. Every question is additionally solved by hand, and any disagreement with the key is logged, not imported.",
      chi2_limit: CHI2_LIMIT,
      trusted: trusted.map((p) => p.slug),
      dropped: papers.filter((p) => !p.trusted).map((p) => ({ slug: p.slug, status: p.status, why: p.why })),
      papers,
    },
    null,
    2,
  ) + "\n",
);

if (process.argv.includes("--json")) {
  console.log(readFileSync(OUT, "utf8"));
} else {
  const w = Math.max(...papers.map((p) => p.slug.length));
  for (const p of papers)
    console.log(
      `${p.trusted ? "✓" : "✗"} ${p.slug.padEnd(w)}  ${(p.distribution ?? "—").padEnd(15)} ${p.status}${p.why ? ` — ${p.why}` : ""}`,
    );
  console.log(
    `\n${trusted.length}/${papers.length} papers have a usable key · ${papers.length - trusted.length} dropped`,
  );
}
