#!/usr/bin/env node
// The ICET subject → chapter taxonomy, read straight out of migration 126 so the
// `chapter` values in the generated import files can only be names that already
// exist in the bank (the importer resolves chapters by name and reports unknown
// ones instead of creating them).
//
// Also holds the mapping from a paper's own printed section/topic heading to that
// taxonomy — the classification rule the transcription pass follows.
//
// Usage: node question-imports/icet/taxonomy.mjs        # print subjects+chapters
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, "../../supabase/migrations/126_competitive_exam_seed.sql");

export function icetTaxonomy() {
  const sql = readFileSync(MIGRATION, "utf8");
  const taxonomy = new Map();
  for (const m of sql.matchAll(/\('ICET','([^']+)','([^']+)'\)/g)) {
    const [, subject, chapter] = m;
    if (!taxonomy.has(subject)) taxonomy.set(subject, new Set());
    taxonomy.get(subject).add(chapter);
  }
  return new Map([...taxonomy].map(([s, c]) => [s, [...c]]));
}

// A paper prints its own section + topic above every question, e.g.
// "SECTION - A : ANALYTICAL ABILITY / 1. Data Sufficiency". That heading fixes the
// subject; the chapter is then chosen by what the question actually tests.
export const SECTION_MAP = {
  "Analytical Ability › Data Sufficiency": {
    subject: "Logical & Analytical Reasoning",
    default_chapter: "Data Sufficiency (Reasoning)",
  },
  "Analytical Ability › Problem Solving": {
    subject: "Logical & Analytical Reasoning",
    chapters: [
      "Number & Alphabet Series",
      "Analogy",
      "Classification (Odd One Out)",
      "Coding-Decoding",
      "Blood Relations",
      "Seating Arrangement",
      "Clocks & Calendars",
      "Venn Diagrams",
    ],
    // Data-analysis questions inside Problem Solving (tables, bar graphs, pie
    // charts, caselets) belong to the DI subject instead.
    data_analysis: {
      subject: "Data Interpretation & Data Sufficiency",
      chapters: ["Tables", "Bar Graphs", "Pie Charts", "Caselets"],
    },
  },
  "Mathematical Ability › Arithmetical Ability": {
    subject: "Quantitative Aptitude",
    chapters: [
      "Number System",
      "LCM & HCF",
      "Surds & Indices",
      "Ratio & Proportion",
      "Percentages",
      "Profit, Loss & Discount",
      "Partnership",
      "Time & Work",
      "Pipes & Cisterns",
      "Time, Speed & Distance",
      "Simple & Compound Interest",
    ],
  },
  "Mathematical Ability › Algebraical & Geometrical Ability": {
    subject: "Quantitative Aptitude",
    chapters: [
      "Algebra",
      "Progressions (AP & GP)",
      "Matrices & Determinants",
      "Limits & Derivatives",
      "Geometry",
      "Coordinate Geometry",
      "Trigonometry",
      "Heights & Distances",
      "Mensuration",
      "Set Theory",
    ],
  },
  "Mathematical Ability › Statistical Ability": {
    subject: "Quantitative Aptitude",
    chapters: [
      "Frequency Distributions",
      "Mean, Median & Mode",
      "Standard Deviation & Variance",
      "Correlation",
      "Probability",
    ],
  },
  "Communication Ability › Vocabulary": {
    subject: "Verbal Ability & Reading Comprehension",
    default_chapter: "Vocabulary (Synonyms & Antonyms)",
  },
  "Communication Ability › Business and Computer Terminology": {
    subject: "Verbal Ability & Reading Comprehension",
    default_chapter: "Business & Computer Terminology",
  },
  "Communication Ability › Functional Grammar": {
    subject: "Verbal Ability & Reading Comprehension",
    default_chapter: "Grammar & Usage",
  },
  "Communication Ability › Reading Comprehension": {
    subject: "Verbal Ability & Reading Comprehension",
    default_chapter: "Reading Comprehension",
  },
};

export const SUBJECT_SLUGS = {
  "Quantitative Aptitude": "quantitative-aptitude",
  "Logical & Analytical Reasoning": "logical-analytical-reasoning",
  "Data Interpretation & Data Sufficiency": "data-interpretation-data-sufficiency",
  "Verbal Ability & Reading Comprehension": "verbal-ability-reading-comprehension",
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [subject, chapters] of icetTaxonomy()) {
    console.log(`\n${subject}  (${chapters.length})`);
    for (const c of chapters) console.log(`  · ${c}`);
  }
}
