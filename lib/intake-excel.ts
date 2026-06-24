/**
 * Admin Excel intake — template generation + parsing/normalization.
 *
 * The template's columns map 1:1 to the registration model (lib/registration.ts
 * / student_profile). Enumerated columns (gender, degree, branch, year, mentor,
 * the 1–5 self-assessment) get in-cell dropdowns sourced from the `ref_*` tables
 * via a hidden "Lists" sheet. Multi-value columns (career goals, skills,
 * interests) are comma-separated text validated on import. A hidden "_meta"
 * sheet carries the chosen college so re-upload is unambiguous.
 *
 * normalizeRows() resolves human labels back to slugs/ids (the shape the
 * import_student_intake() SQL function expects) and reports per-row errors.
 */
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RefRow = { id: string; slug: string; label: string; category: string | null };
export type RefData = Record<string, RefRow[]>;

type BaseCol =
  | { key: string; header: string; kind: "email" | "text" | "number" }
  | { key: string; header: string; kind: "refSingle"; ref: string } // stores slug
  | { key: string; header: string; kind: "refMulti"; ref: string } // stores slug[]
  | { key: string; header: string; kind: "goalSingle" } // -> primary_career_goal_id
  | { key: string; header: string; kind: "goalMulti" } // -> career_goal_ids[]
  | { key: string; header: string; kind: "mentorSingle" }; // -> preferred_mentor_pref_id

const BASE_COLUMNS: BaseCol[] = [
  { key: "email", header: "Email", kind: "email" },
  { key: "full_name", header: "Full Name", kind: "text" },
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
  { key: "career_goals", header: "Career Goals (comma-separated)", kind: "goalMulti" },
  { key: "primary_career_goal", header: "Primary Career Goal", kind: "goalSingle" },
  { key: "skills", header: "Skills (comma-separated)", kind: "refMulti", ref: "ref_skill" },
  { key: "interests", header: "Interests (comma-separated)", kind: "refMulti", ref: "ref_interest" },
  { key: "mentor_preference", header: "Preferred Mentor Type", kind: "mentorSingle" },
  { key: "biggest_challenge", header: "Biggest Challenge", kind: "text" },
];

/** Ref tables the template/import need, keyed for RefData lookups. */
export const INTAKE_REF_TABLES = [
  "ref_gender", "ref_degree", "ref_branch", "ref_year_of_study",
  "ref_career_goal", "ref_skill", "ref_interest", "ref_mentor_preference",
  "ref_skill_assessment_category",
];

export async function loadRefData(supabase: SupabaseClient): Promise<RefData> {
  const out: RefData = {};
  await Promise.all(
    INTAKE_REF_TABLES.map(async (t) => {
      const { data, error } = await supabase
        .from(t).select("id, slug, label, category, sort_order")
        .eq("is_active", true).order("sort_order");
      if (error) throw new Error(`${t}: ${error.message}`);
      out[t] = (data ?? []) as RefRow[];
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
  for (const c of cols) {
    if (c.kind === "refSingle") addList(c.key, (refData[c.ref] ?? []).map((r) => r.label));
    if (c.kind === "goalSingle" || c.kind === "goalMulti") {
      if (!listRanges["__goal"]) addList("__goal", (refData["ref_career_goal"] ?? []).map((r) => r.label));
    }
    if (c.kind === "mentorSingle") addList(c.key, (refData["ref_mentor_preference"] ?? []).map((r) => r.label));
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
    const range = `${letter}2:${letter}${LAST}`;
    let formula: string | undefined;
    if (c.kind === "refSingle" || c.kind === "mentorSingle") formula = listRanges[c.key];
    else if (c.kind === "goalSingle") formula = listRanges["__goal"];
    else if (c.kind === "assessment") formula = listRanges["__rating"];
    if (formula) {
      for (let r = 2; r <= LAST; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: "list", allowBlank: true, formulae: [formula],
        };
      }
    }
    // Helpful notes on free-text multi-value columns.
    if (c.kind === "goalMulti" || c.kind === "refMulti") {
      ws.getCell(`${letter}1`).note =
        "Comma-separated. Use exact labels from the dropdowns / Lists sheet.";
    }
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

/** Resolve labels -> slugs/ids into the shape import_student_intake() expects. */
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
  const labelToId = (table: string) => {
    const m = new Map<string, string>();
    (refData[table] ?? []).forEach((r) => m.set(norm(r.label), r.id));
    return m;
  };
  const goalId = labelToId("ref_career_goal");
  const mentorId = labelToId("ref_mentor_preference");
  const slugMaps: Record<string, Map<string, string>> = {};

  return parsed.map(({ row, cells }) => {
    const data: Record<string, unknown> = { row, email: cells["email"] };
    const errors: string[] = [];
    const goalIds: string[] = [];
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
          else data[key === "graduation_year" ? "graduation_year" : "cgpa"] = key === "graduation_year" ? Math.trunc(n) : n;
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
            else slugs.push(slug);
          }
          data[key === "skills" ? "skills" : "interests"] = slugs;
          break;
        }
        case "goalMulti": {
          for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
            const id = goalId.get(norm(part));
            if (!id) errors.push(`Career Goals: '${part}' not valid`);
            else if (!goalIds.includes(id)) goalIds.push(id);
          }
          break;
        }
        case "goalSingle": {
          const id = goalId.get(norm(raw));
          if (!id) errors.push(`Primary Career Goal: '${raw}' not valid`);
          else data["primary_career_goal_id"] = id;
          break;
        }
        case "mentorSingle": {
          const id = mentorId.get(norm(raw));
          if (!id) errors.push(`Preferred Mentor Type: '${raw}' not valid`);
          else data["preferred_mentor_pref_id"] = id;
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

    // Ensure the primary goal is part of the selected goals.
    const primary = data["primary_career_goal_id"] as string | undefined;
    if (primary && !goalIds.includes(primary)) goalIds.push(primary);
    if (goalIds.length) data["career_goal_ids"] = goalIds;
    if (Object.keys(assessment).length) data["skill_assessment"] = assessment;

    return { row, errors, data };
  });
}
