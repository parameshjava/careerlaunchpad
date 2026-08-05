/**
 * Admin Excel intake — template generation + parsing/normalization.
 *
 * The template's columns map 1:1 to the registration model (lib/registration.ts
 * / student_profile). Enumerated single-select columns (gender, degree, branch,
 * year, caste/reservation/income, first-generation, the 1–5 self-assessment) get
 * in-cell dropdowns sourced from the `ref_*` tables via a hidden "Lists" sheet.
 * Multi-value columns (career paths, skills, interests, languages, hobbies) are
 * comma-separated text validated on import, with the valid labels listed in a
 * cell note. A hidden "_meta" sheet carries the chosen college so re-upload is
 * unambiguous.
 *
 * The column set mirrors the current registration wizard: Step 3 is the
 * preference-category "Career Paths" picker (issue #42), and Step 6 collects the
 * "Tell Us" background fields (issue #44). The legacy career-goals / primary-goal
 * / mentor-preference columns were retired from the template — the DB columns
 * remain but the wizard no longer collects them.
 *
 * normalizeRows() resolves human labels back to slugs (the shape the
 * import_student_intake() SQL function expects) and reports per-row errors.
 *
 * Degree → Branch (issue #99): a spreadsheet dropdown can't narrow itself to the
 * row's degree, so the Branch column stays a flat list of every branch, the legal
 * pairs ship as a VISIBLE "Degree → Branch" sheet, and the pair is enforced per
 * row on import through the shared lib/degree-branch.ts rules. See IntakeMapping.
 */
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  branchesForDegree,
  resolveBranchPair,
  yearsForDegree,
  type BranchMode,
  type BranchRow,
  type DegreeBranchRow,
  type DegreeRow,
} from "@/lib/degree-branch";

export type RefRow = { id: string; slug: string; label: string; category: string | null };
export type RefData = Record<string, RefRow[]>;

/**
 * The Degree → Branch relation (issue #99), which the flat `ref_*` lists can't
 * express. An in-cell dropdown CANNOT be made degree-dependent portably —
 * per-degree named ranges + INDIRECT validation break across Excel, LibreOffice
 * and Google Sheets — so the deliberate design is:
 *   • the Branch column keeps a FLAT dropdown of every branch (fillable anywhere),
 *   • a VISIBLE "Degree → Branch" sheet shows which pairs are legal, and
 *   • the pair is enforced SERVER-SIDE per row on import, so a mismatch fails that
 *     one row with a readable message and the rest of the file still imports.
 */
export type IntakeMapping = {
  degrees: Pick<DegreeRow, "slug" | "label" | "branch_mode" | "duration_years">[];
  branches: Pick<BranchRow, "slug" | "label" | "category" | "sort_order" | "family" | "search_terms" | "id">[];
  pairs: DegreeBranchRow[];
};

type BaseCol =
  | { key: string; header: string; kind: "email" | "text" | "number" | "date" | "yesno" }
  | { key: string; header: string; kind: "refSingle"; ref: string } // stores slug
  | { key: string; header: string; kind: "refMulti"; ref: string; max?: number }; // stores slug[]

const BASE_COLUMNS: BaseCol[] = [
  { key: "email", header: "Email", kind: "email" },
  { key: "full_name", header: "Full Name", kind: "text" },
  { key: "roll_number", header: "Roll Number", kind: "text" },
  { key: "registration_number", header: "University Registration No.", kind: "text" },
  { key: "apaar_id", header: "APAAR / ABC ID", kind: "text" },
  { key: "phone", header: "Mobile Number", kind: "text" },
  { key: "gender", header: "Gender", kind: "refSingle", ref: "ref_gender" },
  { key: "city_village", header: "Village / Mandal / City", kind: "text" },
  { key: "district", header: "District", kind: "text" },
  { key: "state", header: "State", kind: "text" },
  { key: "degree", header: "Degree", kind: "refSingle", ref: "ref_degree" },
  { key: "branch", header: "Branch", kind: "refSingle", ref: "ref_branch" },
  { key: "year_of_study", header: "Year of Study", kind: "refSingle", ref: "ref_year_of_study" },
  { key: "graduation_year", header: "Graduation Year", kind: "number" },
  { key: "cgpa", header: "CGPA / Percentage", kind: "number" },
  // Step 3 — Career Paths (preference categories; up to 2). Stored as slug[] in
  // student_profile.preferred_category_slugs (capped at 2 by a DB CHECK).
  { key: "preferred_category_slugs", header: "Career Paths (up to 2, comma-separated)", kind: "refMulti", ref: "ref_preference_category", max: 2 },
  // Step 5 — skills & interests
  { key: "skills", header: "Skills (comma-separated)", kind: "refMulti", ref: "ref_skill" },
  { key: "interests", header: "Interests (comma-separated)", kind: "refMulti", ref: "ref_interest" },
  // Step 6 — "Tell Us" (all optional). family_members & custom_hobbies are
  // intentionally omitted here (collected later in the student's own form).
  { key: "is_first_generation", header: "First-generation Learner (Yes/No)", kind: "yesno" },
  { key: "date_of_birth", header: "Date of Birth (YYYY-MM-DD)", kind: "date" },
  { key: "languages", header: "Languages (comma-separated)", kind: "refMulti", ref: "ref_language" },
  { key: "caste_certificate_status", header: "Caste Certificate Status", kind: "refSingle", ref: "ref_caste_certificate_status" },
  { key: "reservation_category", header: "Reservation Category", kind: "refSingle", ref: "ref_reservation_category" },
  { key: "income_band", header: "Household Income (annual)", kind: "refSingle", ref: "ref_income_band" },
  { key: "hobbies", header: "Hobbies (comma-separated)", kind: "refMulti", ref: "ref_hobby" },
  { key: "biggest_challenge", header: "Biggest Challenge", kind: "text" },
];

/** Ref tables the template/import need, keyed for RefData lookups. */
export const INTAKE_REF_TABLES = [
  "ref_gender", "ref_degree", "ref_branch", "ref_year_of_study",
  "ref_preference_category", "ref_skill", "ref_interest",
  "ref_skill_assessment_category",
  // Step 6 "Tell Us"
  "ref_language", "ref_caste_certificate_status", "ref_reservation_category",
  "ref_income_band", "ref_hobby",
];

export async function loadRefData(supabase: SupabaseClient): Promise<RefData> {
  const out: RefData = {};
  await Promise.all(
    INTAKE_REF_TABLES.map(async (t) => {
      // ref_preference_category uses name/group_label rather than the shared
      // label/category column names — normalize it to the RefRow shape.
      const isPrefCat = t === "ref_preference_category";
      const cols = isPrefCat
        ? "id, slug, name, group_label, sort_order"
        : "id, slug, label, category, sort_order";
      const { data, error } = await supabase
        .from(t).select(cols).eq("is_active", true).order("sort_order");
      if (error) throw new Error(`${t}: ${error.message}`);
      out[t] = ((data ?? []) as Record<string, unknown>[]).map((r) =>
        isPrefCat
          ? { id: r.id as string, slug: r.slug as string, label: r.name as string, category: (r.group_label as string) ?? null }
          : (r as unknown as RefRow),
      );
    }),
  );
  return out;
}

/** The (degree, branch) relation the template documents and the import enforces. */
export async function loadDegreeBranchMapping(supabase: SupabaseClient): Promise<IntakeMapping> {
  const [degrees, branches, pairs] = await Promise.all([
    supabase
      .from("ref_degree")
      .select("slug, label, branch_mode, duration_years")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("ref_branch")
      .select("id, slug, label, category, sort_order, family, search_terms")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("ref_degree_branch")
      .select("degree_slug, branch_slug, sort_order, group_label")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (degrees.error) throw new Error(`ref_degree: ${degrees.error.message}`);
  if (branches.error) throw new Error(`ref_branch: ${branches.error.message}`);
  if (pairs.error) throw new Error(`ref_degree_branch: ${pairs.error.message}`);
  return {
    degrees: (degrees.data ?? []) as IntakeMapping["degrees"],
    branches: (branches.data ?? []) as IntakeMapping["branches"],
    pairs: (pairs.data ?? []) as DegreeBranchRow[],
  };
}

/** The full ordered column set = base columns + one column per assessment category. */
function columns(refData: RefData) {
  const assessment = (refData["ref_skill_assessment_category"] ?? []).map((c) => ({
    key: `assess::${c.slug}`,
    header: `${c.label} (1-5)`,
    kind: "assessment" as const,
    catSlug: c.slug,
  }));
  return [...BASE_COLUMNS, ...assessment];
}

const norm = (s: string) => s.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------
export async function buildTemplateWorkbook(
  college: { id: string; name: string; place?: string | null },
  refData: RefData,
  mapping: IntakeMapping,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CareerLaunchpad";
  const cols = columns(refData);

  // Hidden lists sheet: one column per enumerated field (for dropdown ranges).
  const lists = wb.addWorksheet("Lists");
  lists.state = "veryHidden";
  const listRanges: Record<string, string> = {}; // column key -> "Lists!$A$2:$A$n"
  let listColIdx = 0;
  const addList = (key: string, values: string[]) => {
    listColIdx += 1;
    const letter = lists.getColumn(listColIdx).letter;
    lists.getCell(`${letter}1`).value = key;
    values.forEach((v, i) => { lists.getCell(`${letter}${i + 2}`).value = v; });
    listRanges[key] = `Lists!$${letter}$2:$${letter}$${values.length + 1}`;
  };
  addList("__rating", ["1", "2", "3", "4", "5"]);
  addList("__yesno", ["Yes", "No"]);
  for (const c of cols) {
    if (c.kind === "refSingle") addList(c.key, (refData[c.ref] ?? []).map((r) => r.label));
  }

  const ws = wb.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  // Header row.
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 2) }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  const LAST = 1000; // validate the first ~1000 data rows
  cols.forEach((c, i) => {
    const letter = ws.getColumn(i + 1).letter;
    let formula: string | undefined;
    if (c.kind === "refSingle") formula = listRanges[c.key];
    else if (c.kind === "yesno") formula = listRanges["__yesno"];
    else if (c.kind === "assessment") formula = listRanges["__rating"];
    if (formula) {
      for (let r = 2; r <= LAST; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: "list", allowBlank: true, formulae: [formula],
        };
      }
    }
    // Multi-value columns can't use an in-cell dropdown; list the exact labels
    // to type (comma-separated) in the header note instead.
    if (c.kind === "refMulti") {
      const labels = (refData[c.ref] ?? []).map((r) => r.label).join(", ");
      ws.getCell(`${letter}1`).note =
        `Comma-separated${c.max ? ` (choose up to ${c.max})` : ""}. Use exact labels: ${labels}`.slice(0, 32000);
    }
    if (c.kind === "date") ws.getCell(`${letter}1`).note = "Format: YYYY-MM-DD (e.g. 2004-08-15).";
    if (c.key === "email") ws.getCell(`${letter}1`).note = "Required — the student's sign-in email.";
    // The Branch dropdown lists EVERY branch (see IntakeMapping) — point the
    // person filling this in at the sheet that says which ones go with which
    // degree, since the import will reject a mismatch.
    if (c.key === "branch")
      ws.getCell(`${letter}1`).note =
        "Must match the Degree in this row. See the 'Degree → Branch' sheet for the valid options. " +
        "Leave blank for MBA / MCA / M.Com / B.Pharm / Pharm.D / B.Arch — those degrees have no branch.";
    if (c.key === "year_of_study")
      ws.getCell(`${letter}1`).note = "Must exist for the degree (a 3-year degree has no 4th year).";
  });

  buildDegreeBranchSheet(wb, mapping);

  // Hidden meta sheet binds this template to the chosen college.
  const meta = wb.addWorksheet("_meta");
  meta.state = "veryHidden";
  meta.getCell("A1").value = "college_id";
  meta.getCell("B1").value = college.id;
  meta.getCell("A2").value = "college_name";
  meta.getCell("B2").value = college.place ? `${college.name} — ${college.place}` : college.name;

  return wb;
}

/**
 * A VISIBLE reference sheet: one row per legal (degree, branch) pair. This is the
 * template's answer to "which branches go with B.Sc?" — the Branch column's own
 * dropdown can't narrow itself (see IntakeMapping), so the person filling the file
 * in needs the pairs in front of them or they'll guess and get the row rejected.
 * Degrees with no branch get an explicit "— no branch —" row rather than being
 * absent, so their absence can't be read as "we forgot to list them".
 */
function buildDegreeBranchSheet(wb: ExcelJS.Workbook, mapping: IntakeMapping) {
  const ws = wb.addWorksheet("Degree → Branch");
  ws.columns = [
    { header: "Degree", key: "degree", width: 26 },
    { header: "Group", key: "group", width: 24 },
    { header: "Branch (paste into the Branch column)", key: "branch", width: 52 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const degree of mapping.degrees) {
    if (degree.branch_mode === "none") {
      ws.addRow({ degree: degree.label, group: "", branch: "— no branch — leave the Branch cell empty" });
      continue;
    }
    const offered = branchesForDegree(degree.slug, mapping.branches as BranchRow[], mapping.pairs);
    if (!offered.length) continue;
    for (const branch of offered) {
      ws.addRow({ degree: degree.label, group: branch.group_label ?? branch.category ?? "", branch: branch.label });
    }
  }
}

// ---------------------------------------------------------------------------
// Parsing + normalization
// ---------------------------------------------------------------------------
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  // Excel date cells come back as JS Dates. Excel/Sheets store dates as
  // timezone-less serials, which ExcelJS materializes at UTC midnight, so UTC
  // extraction (toISOString) yields the displayed calendar day in ANY server
  // timezone. Do NOT switch to local getDate()/getFullYear() — that reintroduces
  // an off-by-one in negative-offset zones (verified: a UTC-midnight date reads
  // as the previous day under America/Los_Angeles via local components).
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v && v.result != null) return String(v.result);
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    return "";
  }
  return String(v);
}

export type ParsedSheet = { collegeId: string | null; rows: { row: number; cells: Record<string, string> }[] };

export async function parseWorkbook(buffer: ArrayBuffer, refData: RefData): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const meta = wb.getWorksheet("_meta");
  const collegeId = meta ? cellText(meta.getCell("B1").value).trim() || null : null;

  const ws = wb.getWorksheet("Students") ?? wb.worksheets[0];
  const cols = columns(refData);
  const headerToKey = new Map(cols.map((c) => [norm(c.header), c.key]));

  // Map sheet columns -> our keys via header text in row 1.
  const colKeyByIndex = new Map<number, string>();
  const header = ws.getRow(1);
  header.eachCell((cell, colNumber) => {
    const key = headerToKey.get(norm(cellText(cell.value)));
    if (key) colKeyByIndex.set(colNumber, key);
  });

  const rows: ParsedSheet["rows"] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const rowObj = ws.getRow(r);
    const cells: Record<string, string> = {};
    let any = false;
    colKeyByIndex.forEach((key, colNumber) => {
      const text = cellText(rowObj.getCell(colNumber).value).trim();
      if (text) { cells[key] = text; any = true; }
    });
    if (any) rows.push({ row: r, cells });
  }
  return { collegeId, rows };
}

/** True only for a real calendar date in strict YYYY-MM-DD form. Date.parse
 * silently rolls over day-overflow values (2024-02-30 → Mar 1, 2023-02-29 →
 * Mar 1), which would then reach Postgres `::date` and abort the whole import
 * batch — so round-trip the components and require an exact match. */
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** A normalized row. `errors` are BLOCKING (the import route rejects the row so
 * no bad record/invite is created); `warnings` are advisory (the row is still
 * imported, e.g. an over-cap Career Paths list that was truncated). */
export type NormalizedRow = { row: number; errors: string[]; warnings: string[]; data: Record<string, unknown> };

/** Resolve labels -> slugs into the shape import_student_intake() expects. */
export function normalizeRows(
  parsed: { row: number; cells: Record<string, string> }[],
  refData: RefData,
  mapping: IntakeMapping,
): NormalizedRow[] {
  const cols = columns(refData);
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const branchModes = new Map<string, BranchMode>(mapping.degrees.map((d) => [d.slug, d.branch_mode]));
  const degreeLabel = new Map(mapping.degrees.map((d) => [d.slug, d.label]));

  const labelToSlug = (table: string) => {
    const m = new Map<string, string>();
    (refData[table] ?? []).forEach((r) => m.set(norm(r.label), r.slug));
    return m;
  };
  const slugMaps: Record<string, Map<string, string>> = {};

  return parsed.map(({ row, cells }) => {
    const email = (cells["email"] ?? "").trim();
    const data: Record<string, unknown> = { row, email };
    const errors: string[] = [];
    const warnings: string[] = [];
    const assessment: Record<string, number> = {};

    // Email is the reconciliation key + the invite address, so a malformed value
    // would create an unclaimable record and a bounced invite — validate it as a
    // blocking error up front rather than letting the raw string through.
    if (!email) errors.push("Email is required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Email: '${email}' is not a valid address`);

    for (const [key, raw] of Object.entries(cells)) {
      if (key === "email") continue;
      const col = byKey.get(key);
      if (!col) continue;
      switch (col.kind) {
        case "text":
          data[key] = raw; break;
        case "number": {
          const n = Number(raw);
          if (Number.isNaN(n)) errors.push(`${col.header}: not a number`);
          else data[key] = key === "graduation_year" ? Math.trunc(n) : n;
          break;
        }
        case "yesno": {
          const s = norm(raw);
          if (["yes", "true", "y", "1"].includes(s)) data[key] = true;
          else if (["no", "false", "n", "0"].includes(s)) data[key] = false;
          else errors.push(`${col.header}: enter Yes or No`);
          break;
        }
        case "date": {
          // cellText already yields YYYY-MM-DD for real Excel date cells; also
          // accept an admin-typed YYYY-MM-DD string. isValidYmd rejects
          // day-overflow dates that Date.parse would silently roll over.
          const s = raw.slice(0, 10);
          if (!isValidYmd(s)) errors.push(`${col.header}: use a valid date (YYYY-MM-DD)`);
          else data[key] = s;
          break;
        }
        case "refSingle": {
          slugMaps[col.ref] ??= labelToSlug(col.ref);
          const slug = slugMaps[col.ref].get(norm(raw));
          if (!slug) errors.push(`${col.header}: '${raw}' not a valid option`);
          else data[key] = slug;
          break;
        }
        case "refMulti": {
          slugMaps[col.ref] ??= labelToSlug(col.ref);
          const slugs: string[] = [];
          for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
            const slug = slugMaps[col.ref].get(norm(part));
            if (!slug) errors.push(`${col.header}: '${part}' not valid`);
            else if (!slugs.includes(slug)) slugs.push(slug);
          }
          // Enforce the max (e.g. Career Paths ≤ 2) and truncate the stored set so
          // a downstream DB CHECK (student_profile.preferred_category_slugs) can't
          // reject the row when the imported student later claims their profile.
          if (col.max && slugs.length > col.max) {
            // Advisory (non-blocking): keep the row but truncate to the cap so a
            // downstream DB CHECK can't reject the claimed profile.
            warnings.push(`${col.header}: kept first ${col.max}, extra values ignored`);
            data[key] = slugs.slice(0, col.max);
          } else {
            data[key] = slugs;
          }
          break;
        }
        case "assessment": {
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 1 || n > 5) errors.push(`${col.header}: must be 1–5`);
          else assessment[col.catSlug] = n;
          break;
        }
      }
    }

    if (Object.keys(assessment).length) data["skill_assessment"] = assessment;

    // Degree ⇄ Branch (#99) — the SAME rule the student and mentor forms run,
    // from the same helper, so a bulk import can't reintroduce the bad pairs the
    // forms now prevent. `stored` is null because an import row is a fresh
    // assertion: whatever is in the file is what's being claimed.
    //
    // A mismatch is BLOCKING (not a warning): silently blanking or keeping the
    // branch would write a record the student then can't correct from a filtered
    // dropdown, which is the exact failure #99 exists to fix. The rest of the
    // file still imports — errors are per row.
    if ("degree" in data || "branch" in data) {
      const pair = resolveBranchPair({
        provided: data,
        clean: data,
        stored: null,
        branchModes,
        pairs: mapping.pairs,
      });
      Object.assign(data, pair.patch);
      for (const message of pair.errors) {
        // Rewrite the student-facing copy into the admin's frame of reference:
        // they're looking at a spreadsheet cell, not their own profile.
        const degree = typeof data.degree === "string" ? (degreeLabel.get(data.degree) ?? data.degree) : "(blank)";
        errors.push(
          message === "That branch isn't offered for the selected degree."
            ? `Branch: '${cells["branch"]}' is not offered for Degree '${degree}' — see the 'Degree → Branch' sheet`
            : `Branch: set a Degree in this row first`,
        );
      }
    }

    // Year of study must exist for the degree — the Year column's dropdown is
    // flat (it can't narrow itself either), so a 3-year B.Sc row could otherwise
    // claim a 4th year. Same rule the form applies by filtering the list.
    if (typeof data.degree === "string" && typeof data.year_of_study === "string") {
      const kept = yearsForDegree(data.degree, mapping.degrees as DegreeRow[], [
        { slug: data.year_of_study },
      ]);
      if (!kept.length) {
        const degree = degreeLabel.get(data.degree) ?? data.degree;
        errors.push(`Year of Study: '${cells["year_of_study"]}' does not exist for Degree '${degree}'`);
      }
    }

    return { row, errors, warnings, data };
  });
}
