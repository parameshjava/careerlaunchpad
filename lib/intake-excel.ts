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
 */
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RefRow = { id: string; slug: string; label: string; category: string | null };
export type RefData = Record<string, RefRow[]>;

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
  });

  // Hidden meta sheet binds this template to the chosen college.
  const meta = wb.addWorksheet("_meta");
  meta.state = "veryHidden";
  meta.getCell("A1").value = "college_id";
  meta.getCell("B1").value = college.id;
  meta.getCell("A2").value = "college_name";
  meta.getCell("B2").value = college.place ? `${college.name} — ${college.place}` : college.name;

  return wb;
}

// ---------------------------------------------------------------------------
// Parsing + normalization
// ---------------------------------------------------------------------------
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  // Excel date cells come back as JS Dates — normalize to YYYY-MM-DD (UTC) so a
  // date the admin typed round-trips to the date_of_birth column unchanged.
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

export type NormalizedRow = { row: number; errors: string[]; data: Record<string, unknown> };

/** Resolve labels -> slugs into the shape import_student_intake() expects. */
export function normalizeRows(
  parsed: { row: number; cells: Record<string, string> }[],
  refData: RefData,
): NormalizedRow[] {
  const cols = columns(refData);
  const byKey = new Map(cols.map((c) => [c.key, c]));

  const labelToSlug = (table: string) => {
    const m = new Map<string, string>();
    (refData[table] ?? []).forEach((r) => m.set(norm(r.label), r.slug));
    return m;
  };
  const slugMaps: Record<string, Map<string, string>> = {};

  return parsed.map(({ row, cells }) => {
    const data: Record<string, unknown> = { row, email: cells["email"] };
    const errors: string[] = [];
    const assessment: Record<string, number> = {};

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
          // accept an admin-typed YYYY-MM-DD string.
          const s = raw.slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
            errors.push(`${col.header}: use YYYY-MM-DD`);
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
            errors.push(`${col.header}: choose at most ${col.max} (extra values ignored)`);
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

    return { row, errors, data };
  });
}
