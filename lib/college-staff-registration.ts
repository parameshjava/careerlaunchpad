/**
 * Shared model for the College Staff registration form — the staff counterpart
 * of lib/mentor-registration.ts. One source of truth for which ref_* tables back
 * the option sets, which college_staff_profile columns each step writes, and how
 * to validate a partial payload. Used by the staff reference API, the profile API
 * (incremental PATCH), the submit endpoint AND the admin invite route, so the
 * form, API and DB never drift (CLAUDE.md "API design first").
 *
 * Three steps, mirroring the mentor form's shape but asking what a college needs
 * us to know: who they are and what they do at the college, what experience they
 * bring, and what they teach. The experience/subjects half is the point — it is
 * what lets us decide whether to invite someone onto a guest session or a
 * mock-interview panel without a phone call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Reference option sets the staff form needs: response key -> ref_* table. */
export const REF_TABLES: Record<string, string> = {
  staff_designation: "ref_staff_designation",
  degree: "ref_degree",
  branch: "ref_branch",
  year_of_study: "ref_year_of_study",
  language: "ref_language",
  mentoring_area: "ref_mentoring_area",
  contribution_type: "ref_contribution_type",
};

/** college_staff_profile columns each step may write. */
export const STEP_FIELDS: Record<number, string[]> = {
  1: [
    "full_name", "phone", "linkedin_url", "employee_code",
    "designation_id", "designation_other", "department", "department_other",
    "office_email", "bio",
  ],
  2: [
    "highest_qualification", "highest_qualification_other",
    "specialization", "specialization_other", "other_qualifications",
    "years_teaching_total", "years_at_this_college", "joined_year", "years_industry",
    "previous_institutions", "certifications", "achievements",
  ],
  3: [
    "teaching_year_ids", "instruction_language_ids", "support_area_ids",
    "contribution_type_ids", "availability", "open_to_mentoring", "notes",
  ],
};

export const ALL_FIELDS = Object.values(STEP_FIELDS).flat();

/** The columns returned by GET /api/college-staff/profile. */
export const PROFILE_SELECT = [...ALL_FIELDS, "college_id"].join(", ");

/**
 * Subjects are NOT a profile column — they live in college_staff_subject, one
 * row per (subject, relation). Step 3 owns them, but they are saved through
 * their own branch of the PATCH handler rather than the column merge.
 */
export const SUBJECT_RELATIONS = ["teaching", "taught", "can_teach"] as const;
export type SubjectRelation = (typeof SUBJECT_RELATIONS)[number];
export type SubjectRow = {
  subject_id: string;
  relation: SubjectRelation;
  since_year?: number | string | null;
  last_year?: number | string | null;
  is_primary?: boolean;
};

/**
 * Fields required before a staff registration can be marked 'submitted'.
 * Deliberately short — the same "ask little, get a real submission" bet the
 * mentor form makes. College is not listed because it is set at registration
 * (register_as_college_staff) and is NOT NULL, so it can never be missing here.
 */
export const REQUIRED_FIELDS: { step: number; field: string }[] = [
  { step: 1, field: "full_name" },
  { step: 1, field: "designation_id" },
  { step: 2, field: "years_teaching_total" },
];

/** Human labels for the missing-field messages the form shows. */
export const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  designation_id: "Designation",
  department: "Department",
  years_teaching_total: "Total years of teaching experience",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTHER_TEXT_MAX = 120;
/** Bound on the free-text/jsonb list fields, so one paste can't fill a column. */
const LONG_TEXT_MAX = 2000;
const MAX_LIST_ITEMS = 30;

type Refs = {
  designationIds: Set<string>;
  yearIds: Set<string>;
  languageIds: Set<string>;
  areaIds: Set<string>;
  contributionIds: Set<string>;
  degreeSlugs: Set<string>;
  branchSlugs: Set<string>;
};

/** Load just the ref sets needed to validate the provided fields. */
async function loadRefs(supabase: SupabaseClient, fields: string[]): Promise<Refs> {
  const idSet = async (need: boolean, table: string) => {
    if (!need) return new Set<string>();
    const { data } = await supabase.from(table).select("id");
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  };
  const slugSet = async (need: boolean, table: string) => {
    if (!need) return new Set<string>();
    const { data } = await supabase.from(table).select("slug");
    return new Set((data ?? []).map((r: { slug: string }) => r.slug));
  };

  const [designationIds, yearIds, languageIds, areaIds, contributionIds, degreeSlugs, branchSlugs] =
    await Promise.all([
      idSet(fields.includes("designation_id"), "ref_staff_designation"),
      idSet(fields.includes("teaching_year_ids"), "ref_year_of_study"),
      idSet(fields.includes("instruction_language_ids"), "ref_language"),
      idSet(fields.includes("support_area_ids"), "ref_mentoring_area"),
      idSet(fields.includes("contribution_type_ids"), "ref_contribution_type"),
      slugSet(fields.includes("highest_qualification"), "ref_degree"),
      slugSet(fields.includes("specialization") || fields.includes("department"), "ref_branch"),
    ]);

  return { designationIds, yearIds, languageIds, areaIds, contributionIds, degreeSlugs, branchSlugs };
}

export type ValidationResult = { clean: Record<string, unknown>; errors: string[] };

/**
 * Validate + normalize a PARTIAL payload (only the provided fields). Lenient by
 * design — a missing field is never an error, so a half-finished step still
 * saves and the registrant can resume. Returns the values to write + any errors.
 *
 * Unlike the mentor/student forms there is no degree→branch cross-field rule
 * here: `department` is where the person WORKS and `specialization` is what they
 * studied, so neither is constrained by the other (a CSE lecturer with an M.Sc
 * in Mathematics is ordinary, not a data error).
 */
export async function validatePartial(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  /** The row already on disk. The experience numbers check against EACH OTHER
   *  (see the cross-field pass at the end), and a PATCH may carry only one of
   *  them — so the others have to come from somewhere. Same reason
   *  lib/mentor-registration.ts#validatePartial takes a `stored`. */
  stored?: {
    years_teaching_total?: number | null;
    years_at_this_college?: number | null;
    joined_year?: number | null;
  } | null,
): Promise<ValidationResult> {
  const fields = Object.keys(data).filter((f) => ALL_FIELDS.includes(f));
  const refs = await loadRefs(supabase, fields);
  const clean: Record<string, unknown> = {};
  const errors: string[] = [];

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

  /** A bounded, non-negative whole number of years, or null. */
  const years = (field: string, v: unknown, max: number) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > max) {
      errors.push(`${field}: out of range (0–${max})`);
      return undefined;
    }
    return n;
  };

  /** A list of {…} objects stored as jsonb, bounded in count and size. */
  const objectList = (field: string, v: unknown) => {
    if (v == null || v === "") return [];
    if (!Array.isArray(v)) { errors.push(`${field}: must be a list`); return undefined; }
    if (v.length > MAX_LIST_ITEMS) { errors.push(`${field}: keep it to ${MAX_LIST_ITEMS} entries`); return undefined; }
    const rows = v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
    if (JSON.stringify(rows).length > LONG_TEXT_MAX * 4) {
      errors.push(`${field}: too long`);
      return undefined;
    }
    return rows;
  };

  /** A uuid[] of ref ids, every element checked against its option set. */
  const idList = (field: string, v: unknown, set: Set<string>) => {
    if (!Array.isArray(v)) { errors.push(`${field}: must be a list`); return undefined; }
    const ids = v.map(str).filter(Boolean);
    if (ids.some((id) => !UUID_RE.test(id) || !set.has(id))) {
      errors.push(`${field}: unknown value(s)`);
      return undefined;
    }
    return ids;
  };

  const assign = (field: string, value: unknown) => {
    if (value !== undefined) clean[field] = value;
  };

  for (const field of fields) {
    const v = data[field];
    switch (field) {
      case "full_name":
      case "employee_code":
      case "other_qualifications":
      case "availability":
      case "bio":
      case "notes": {
        const s = str(v);
        if (s.length > LONG_TEXT_MAX) errors.push(`${field}: too long`);
        else clean[field] = s || null;
        break;
      }
      case "designation_other":
      case "department_other":
      case "highest_qualification_other":
      case "specialization_other": {
        const s = str(v);
        if (s.length > OTHER_TEXT_MAX) errors.push(`${field}: keep it under ${OTHER_TEXT_MAX} characters`);
        else clean[field] = s || null;
        break;
      }
      case "phone": {
        const p = str(v);
        if (p && !/^[+()\d][\d\s().-]{5,19}$/.test(p)) errors.push("phone: invalid format");
        else clean[field] = p || null;
        break;
      }
      case "office_email": {
        const s = str(v).toLowerCase();
        if (s && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)) errors.push("office_email: invalid email");
        else clean[field] = s || null;
        break;
      }
      case "linkedin_url": {
        const s = str(v);
        if (s && !/^https?:\/\/.+/i.test(s)) errors.push("linkedin_url: must be a full URL");
        else clean[field] = s || null;
        break;
      }
      case "designation_id": {
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!UUID_RE.test(s) || !refs.designationIds.has(s)) errors.push("designation_id: unknown designation");
        else clean[field] = s;
        break;
      }
      case "department":
      case "specialization": {
        const s = str(v);
        if (s && !refs.branchSlugs.has(s)) errors.push(`${field}: '${s}' is not a valid option`);
        else clean[field] = s || null;
        break;
      }
      case "highest_qualification": {
        const s = str(v);
        if (s && !refs.degreeSlugs.has(s)) errors.push(`${field}: '${s}' is not a valid option`);
        else clean[field] = s || null;
        break;
      }
      case "years_teaching_total":
      case "years_at_this_college":
      case "years_industry":
        assign(field, years(field, v, 70));
        break;
      case "joined_year": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const n = Number(v);
        // 1900 matches the column CHECK; the upper bound allows next session's
        // appointment letter, not a typo'd 2202.
        if (!Number.isInteger(n) || n < 1900 || n > new Date().getFullYear() + 1) {
          errors.push("joined_year: out of range");
        } else clean[field] = n;
        break;
      }
      case "previous_institutions":
      case "certifications":
      case "achievements":
        assign(field, objectList(field, v));
        break;
      case "teaching_year_ids":
        assign(field, idList(field, v, refs.yearIds));
        break;
      case "instruction_language_ids":
        assign(field, idList(field, v, refs.languageIds));
        break;
      case "support_area_ids":
        assign(field, idList(field, v, refs.areaIds));
        break;
      case "contribution_type_ids":
        assign(field, idList(field, v, refs.contributionIds));
        break;
      case "open_to_mentoring":
        clean[field] = v === true || v === "true";
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Cross-field: the experience numbers have to be able to be true together.
  //
  // Each one passes its own range check on its own — 0–70 years, a plausible
  // joining year — so "15 years teaching, 30 of them at this college, joined
  // 2021" was accepted and stored. These are the two contradictions that are
  // both unambiguous and common as typos; anything softer (e.g. teaching +
  // industry exceeding a working life) is left alone, because the two legitimately
  // OVERLAP for someone who consults while lecturing.
  //
  // `?? stored ?? undefined` so a PATCH of one field is still checked against the
  // saved values of the others, and a field being CLEARED (explicit null) drops
  // out of the comparison rather than reading as 0.
  const resolved = (field: "years_teaching_total" | "years_at_this_college" | "joined_year") => {
    if (field in clean) return clean[field] as number | null;
    return (stored?.[field] ?? null) as number | null;
  };
  const total = resolved("years_teaching_total");
  const here = resolved("years_at_this_college");
  const joined = resolved("joined_year");
  // Only complain when the offending field is one the caller actually sent —
  // otherwise editing an unrelated field surfaces an error about a value the user
  // is not looking at and cannot see.
  const touched = (f: string) => f in data;

  if (total != null && here != null && here > total) {
    if (touched("years_at_this_college") || touched("years_teaching_total")) {
      errors.push(
        `years_at_this_college: you can't have taught at this college longer (${here}) than you've taught in total (${total})`,
      );
    }
  }

  if (joined != null && here != null) {
    const impliedYears = new Date().getFullYear() - joined;
    // A year of joining is not a duration, so allow ±1 for mid-session joins and
    // for someone who counts an academic year rather than a calendar one.
    if (impliedYears >= 0 && Math.abs(impliedYears - here) > 1) {
      if (touched("joined_year") || touched("years_at_this_college")) {
        errors.push(
          `joined_year: joining in ${joined} is about ${impliedYears} years at this college, not ${here}`,
        );
      }
    }
  }

  return { clean, errors };
}

/**
 * Validate the subject rows for step 3. Returns rows ready to insert into
 * college_staff_subject, or errors. `known` is the set of subject ids the caller
 * is allowed to reference (from the teachable-subjects RPC), so a client cannot
 * attach an arbitrary uuid.
 */
export function validateSubjects(
  value: unknown,
  known: Set<string>,
): { rows: SubjectRow[]; errors: string[] } {
  const errors: string[] = [];
  if (value == null) return { rows: [], errors };
  if (!Array.isArray(value)) return { rows: [], errors: ["subjects: must be a list"] };
  if (value.length > 200) return { rows: [], errors: ["subjects: too many entries"] };

  const rows: SubjectRow[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const subjectId = String(r.subject_id ?? "");
    const relation = String(r.relation ?? "") as SubjectRelation;

    if (!UUID_RE.test(subjectId) || !known.has(subjectId)) { errors.push("subjects: unknown subject"); continue; }
    if (!SUBJECT_RELATIONS.includes(relation)) { errors.push("subjects: unknown relation"); continue; }

    // The table PK is (user_id, subject_id, relation); de-dupe here so a client
    // repeat is a no-op rather than a 409.
    const key = `${subjectId}:${relation}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const year = (v: unknown) => {
      if (v === "" || v == null) return null;
      const n = Number(v);
      return Number.isInteger(n) && n >= 1900 && n <= 2200 ? n : null;
    };

    rows.push({
      subject_id: subjectId,
      relation,
      since_year: relation === "teaching" ? year(r.since_year) : null,
      last_year: relation === "taught" ? year(r.last_year) : null,
      is_primary: r.is_primary === true,
    });
  }

  return { rows, errors };
}
