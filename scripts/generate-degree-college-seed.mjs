#!/usr/bin/env node
/**
 * generate-degree-college-seed.mjs
 *
 * Turn the OAMDC / APSCHE institute report (exported to CSV) into Supabase seed
 * migrations — the same shape as supabase/migrations/008_college_seed_*.sql, but
 * with each college linked to its affiliating UNIVERSITY (migration 032/033).
 *
 * Why a generator: the OAMDC institute report is login-gated (~1,400 colleges),
 * so we can't fetch it from CI. You export it once; this script emits the SQL.
 *
 * USAGE
 *   node scripts/generate-degree-college-seed.mjs <input.csv> [--start 34] [--chunk 200]
 *
 * INPUT CSV — one row per college, header row required. Recognised columns
 * (case-insensitive, spaces/underscores ignored; extras are ignored):
 *   name | college name        (required)
 *   place                      (city/town)
 *   address
 *   district
 *   state                      (defaults to "Andhra Pradesh")
 *   pincode                    (6 digits; used for de-dup, keep if you have it)
 *   established | year         (year of establishment)
 *   ownership | type           (Govt/Government -> GOVERNMENT, else PRIVATE)
 *   university                 (affiliating university NAME, mapped to 033 seed)
 *
 * OUTPUT
 *   supabase/migrations/034_degree_college_seed_01.sql, _02.sql, …  (chunked)
 *
 * Each row is an UPSERT keyed on (name, place, pincode):
 *   - new colleges are inserted with their university_id resolved by a subquery;
 *   - colleges ALREADY present (e.g. from the UGC 008_* seed) get their
 *     university_id BACK-FILLED only when it's still NULL — existing data is
 *     never overwritten. This is the "modify existing colleges" path.
 * Rows whose pincode is empty can't be de-duped by the DB (NULLs are distinct in
 * the unique key) and may duplicate an existing UGC row — the script warns and
 * counts these so you can decide.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "supabase", "migrations");

/** Canonical university names seeded in 033_university_seed.sql. The map's keys
 * are loose aliases (lowercased, normalised) → canonical name. Extend as the
 * OAMDC export reveals other spellings. */
const UNIVERSITY_ALIASES = {
  "andhra university": "Andhra University",
  "au": "Andhra University",
  "adikavi nannaya university": "Adikavi Nannaya University",
  "nannaya university": "Adikavi Nannaya University",
  "acharya nagarjuna university": "Acharya Nagarjuna University",
  "nagarjuna university": "Acharya Nagarjuna University",
  "anu": "Acharya Nagarjuna University",
  "krishna university": "Krishna University",
  "sri venkateswara university": "Sri Venkateswara University",
  "svu": "Sri Venkateswara University",
  "venkateswara university": "Sri Venkateswara University",
  "vikrama simhapuri university": "Vikrama Simhapuri University",
  "simhapuri university": "Vikrama Simhapuri University",
  "yogi vemana university": "Yogi Vemana University",
  "vemana university": "Yogi Vemana University",
  "rayalaseema university": "Rayalaseema University",
  "sri krishnadevaraya university": "Sri Krishnadevaraya University",
  "sku": "Sri Krishnadevaraya University",
  "krishnadevaraya university": "Sri Krishnadevaraya University",
  "dr. b.r. ambedkar university": "Dr. B.R. Ambedkar University",
  "dr br ambedkar university": "Dr. B.R. Ambedkar University",
  "br ambedkar university": "Dr. B.R. Ambedkar University",
  "ambedkar university": "Dr. B.R. Ambedkar University",
};

// --- tiny CSV parser (handles quoted fields, commas and newlines in quotes) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();
const sql = (v) => (v == null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);

function pickColumns(header) {
  const idx = {};
  header.forEach((h, i) => { idx[norm(h)] = i; });
  const find = (...names) => {
    for (const n of names) if (idx[n] != null) return idx[n];
    return -1;
  };
  return {
    name: find("name", "college name", "institute name", "institution name"),
    place: find("place", "city", "town", "mandal"),
    address: find("address", "full address"),
    district: find("district", "dist"),
    state: find("state"),
    pincode: find("pincode", "pin", "pin code", "zip"),
    established: find("established", "established in", "year", "year of estb", "year of establishment"),
    ownership: find("ownership", "type", "ownership type", "institution type", "college type"),
    university: find("university", "affiliating university", "university name"),
  };
}

function ownership(raw) {
  const v = norm(raw || "");
  if (!v) return null;
  return /gov/.test(v) ? "GOVERNMENT" : "PRIVATE";
}

function university(raw) {
  const v = norm(raw || "");
  if (!v) return null;
  return UNIVERSITY_ALIASES[v] ?? null; // unknown spellings -> null (warned)
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: node scripts/generate-degree-college-seed.mjs <input.csv> [--start 34] [--chunk 200]");
    process.exit(1);
  }
  const start = Number(args[args.indexOf("--start") + 1]) || 34;
  const chunk = Number(args[args.indexOf("--chunk") + 1]) || 200;

  const rows = parseCsv(readFileSync(resolve(file), "utf8"));
  const header = rows.shift();
  const col = pickColumns(header);
  if (col.name < 0) { console.error("CSV must have a 'name' / 'college name' column"); process.exit(1); }

  const get = (r, i) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const records = [];
  const warn = { noPincode: 0, unknownUniversity: new Set() };

  for (const r of rows) {
    const name = get(r, col.name);
    if (!name) continue;
    const uRaw = get(r, col.university);
    const u = university(uRaw);
    if (uRaw && !u) warn.unknownUniversity.add(uRaw);
    const pincode = get(r, col.pincode).replace(/\D/g, "").slice(0, 6) || null;
    if (!pincode) warn.noPincode++;
    const estRaw = get(r, col.established).replace(/\D/g, "");
    const est = estRaw && Number(estRaw) >= 1800 ? Number(estRaw) : null;
    records.push({
      name,
      place: get(r, col.place) || null,
      address: get(r, col.address) || null,
      district: get(r, col.district) || null,
      state: get(r, col.state) || "Andhra Pradesh",
      pincode,
      established_in: est,
      ownership_type: ownership(get(r, col.ownership)),
      university: u,
    });
  }

  mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const total = Math.ceil(records.length / chunk);
  for (let p = 0; p < total; p++) {
    const part = records.slice(p * chunk, (p + 1) * chunk);
    const n = String(start + p).padStart(3, "0");
    const partNo = String(p + 1).padStart(2, "0");
    const lines = [];
    lines.push(`-- ============================================================================`);
    lines.push(`-- ${n}_degree_college_seed_${partNo}.sql  -  part ${p + 1} of ${total}`);
    lines.push(`-- Generated from the OAMDC institute export by scripts/generate-degree-college-seed.mjs.`);
    lines.push(`-- Upserts on (name, place, pincode): inserts new degree colleges and back-fills`);
    lines.push(`-- university_id on existing rows only when it is still NULL (never overwrites).`);
    lines.push(`-- university_id is resolved by name against the universities seeded in 033.`);
    lines.push(`-- ============================================================================`);
    lines.push("");
    for (const c of part) {
      const uSub = c.university
        ? `(select id from public.college u where u.name = ${sql(c.university)} and u.university_id = u.id limit 1)`
        : "null";
      lines.push(
        `insert into public.college (name, place, address, district, state, pincode, established_in, ownership_type, university_id) values\n` +
        `  (${sql(c.name)}, ${sql(c.place)}, ${sql(c.address)}, ${sql(c.district)}, ${sql(c.state)}, ${sql(c.pincode)}, ${c.established_in ?? "null"}, ${sql(c.ownership_type)}, ${uSub})\n` +
        `on conflict (name, place, pincode) do update set\n` +
        `  university_id = coalesce(public.college.university_id, excluded.university_id);`,
      );
      lines.push("");
    }
    const outPath = resolve(MIGRATIONS_DIR, `${n}_degree_college_seed_${partNo}.sql`);
    writeFileSync(outPath, lines.join("\n"));
    console.log(`wrote ${outPath} (${part.length} colleges)`);
  }

  console.log(`\n${records.length} colleges across ${total} file(s).`);
  if (warn.noPincode) console.log(`⚠  ${warn.noPincode} rows have no pincode — they can't be de-duped against existing colleges and may duplicate UGC rows.`);
  if (warn.unknownUniversity.size) {
    console.log(`⚠  Unmapped university names (left NULL — add aliases to UNIVERSITY_ALIASES):`);
    for (const u of warn.unknownUniversity) console.log(`     - ${u}`);
  }
}

main();
