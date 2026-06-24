/**
 * Shared model for the mentor registration form — the mentor counterpart of
 * lib/registration.ts. One source of truth for which ref_* tables back the
 * option sets, which mentor_profile columns each step writes, and how to
 * validate a partial payload. Used by the mentor reference API, the mentor
 * profile API (incremental PATCH) and the submit endpoint, so the form, API
 * and DB never drift (CLAUDE.md "API design first").
 *
 * The form is deliberately short (3 light steps) — we ask minimal details, not
 * a job-portal-length application. Required fields are tiny (name, one
 * mentoring area, a mode); everything else pre-fills for alumni.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Reference option sets the mentor form needs: response key -> ref_* table. */
export const REF_TABLES: Record<string, string> = {
  degree: "ref_degree",
  branch: "ref_branch",
  skill: "ref_skill",
  career_goal: "ref_career_goal",
  industry: "ref_industry",
  mentoring_area: "ref_mentoring_area",
  mentor_mode: "ref_mentor_mode",
  contribution_type: "ref_contribution_type",
};

/** mentor_profile columns each step may write (the form's per-step field map). */
export const STEP_FIELDS: Record<number, string[]> = {
  1: ["full_name", "phone", "linkedin_url", "bio"],
  2: [
    "college_id", "graduation_year", "degree", "branch",
    "current_company", "current_title", "industry_id", "years_experience",
  ],
  3: [
    "mentoring_area_ids", "skills", "career_goal_ids",
    "mentor_mode_id", "contribution_type_id", "availability",
  ],
};

export const ALL_FIELDS = Object.values(STEP_FIELDS).flat();

/** The columns returned by GET /api/mentor/profile. */
export const PROFILE_SELECT = [...ALL_FIELDS, "college_id"].join(", ");

/** Fields required before a mentor registration can be marked 'submitted'. */
export const REQUIRED_FIELDS: { step: number; field: string }[] = [
  { step: 1, field: "full_name" },
  { step: 3, field: "mentoring_area_ids" },
  { step: 3, field: "mentor_mode_id" },
];

type Refs = {
  slugSets: Record<string, Set<string>>; // degree/branch/skill
  goalIds: Set<string>;
  areaIds: Set<string>;
  industryIds: Set<string>;
  modeIds: Set<string>;
  contributionIds: Set<string>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Load just the ref sets needed to validate the provided fields. */
async function loadRefs(supabase: SupabaseClient, fields: string[]): Promise<Refs> {
  const slugSets: Record<string, Set<string>> = {};
  const wantSlug: [string, string][] = [];
  if (fields.includes("degree")) wantSlug.push(["degree", "ref_degree"]);
  if (fields.includes("branch")) wantSlug.push(["branch", "ref_branch"]);
  if (fields.includes("skills")) wantSlug.push(["skill", "ref_skill"]);

  await Promise.all(
    wantSlug.map(async ([key, table]) => {
      const { data } = await supabase.from(table).select("slug");
      slugSets[key] = new Set((data ?? []).map((r: { slug: string }) => r.slug));
    }),
  );

  const idSet = async (need: boolean, table: string) => {
    if (!need) return new Set<string>();
    const { data } = await supabase.from(table).select("id");
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  };

  const [goalIds, areaIds, industryIds, modeIds, contributionIds] = await Promise.all([
    idSet(fields.includes("career_goal_ids"), "ref_career_goal"),
    idSet(fields.includes("mentoring_area_ids"), "ref_mentoring_area"),
    idSet(fields.includes("industry_id"), "ref_industry"),
    idSet(fields.includes("mentor_mode_id"), "ref_mentor_mode"),
    idSet(fields.includes("contribution_type_id"), "ref_contribution_type"),
  ]);

  return { slugSets, goalIds, areaIds, industryIds, modeIds, contributionIds };
}

export type ValidationResult = {
  clean: Record<string, unknown>;
  errors: string[];
};

/**
 * Validate + normalize a PARTIAL payload (only the provided fields). Lenient by
 * design — missing fields are never errors, so a half-finished step still saves
 * and the mentor can resume. Returns the cleaned values to write + any errors.
 */
export async function validatePartial(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<ValidationResult> {
  const fields = Object.keys(data).filter((f) => ALL_FIELDS.includes(f));
  const refs = await loadRefs(supabase, fields);
  const clean: Record<string, unknown> = {};
  const errors: string[] = [];

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

  for (const field of fields) {
    const v = data[field];
    switch (field) {
      case "full_name":
      case "bio":
      case "current_company":
      case "current_title":
      case "availability": {
        clean[field] = str(v) || null;
        break;
      }
      case "linkedin_url": {
        const s = str(v);
        if (s && !/^https?:\/\/.+/i.test(s)) errors.push("linkedin_url: must be a full URL");
        else clean[field] = s || null;
        break;
      }
      case "phone": {
        const p = str(v);
        if (p && !/^[+()\d][\d\s().-]{5,19}$/.test(p)) errors.push("phone: invalid format");
        else clean[field] = p || null;
        break;
      }
      case "degree":
      case "branch": {
        const s = str(v);
        if (s && !refs.slugSets[field]?.has(s)) errors.push(`${field}: '${s}' is not a valid option`);
        else clean[field] = s || null;
        break;
      }
      case "college_id":
      case "industry_id":
      case "mentor_mode_id":
      case "contribution_type_id": {
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!UUID_RE.test(s)) { errors.push(`${field}: not a valid id`); break; }
        if (field === "industry_id" && !refs.industryIds.has(s)) errors.push("industry_id: unknown industry");
        else if (field === "mentor_mode_id" && !refs.modeIds.has(s)) errors.push("mentor_mode_id: unknown mode");
        else if (field === "contribution_type_id" && !refs.contributionIds.has(s)) errors.push("contribution_type_id: unknown type");
        else clean[field] = s; // college_id validity is enforced by the FK
        break;
      }
      case "mentoring_area_ids":
      case "career_goal_ids": {
        if (!Array.isArray(v)) { errors.push(`${field}: must be a list`); break; }
        const set = field === "mentoring_area_ids" ? refs.areaIds : refs.goalIds;
        const ids = v.map(str).filter(Boolean);
        const bad = ids.filter((id) => !UUID_RE.test(id) || !set.has(id));
        if (bad.length) errors.push(`${field}: unknown value(s)`);
        else clean[field] = ids;
        break;
      }
      case "skills": {
        if (!Array.isArray(v)) { errors.push("skills: must be a list"); break; }
        const vals = v.map(str).filter(Boolean);
        const bad = vals.filter((s) => !refs.slugSets["skill"]?.has(s));
        if (bad.length) errors.push(`skills: unknown value(s): ${bad.join(", ")}`);
        else clean[field] = vals;
        break;
      }
      case "graduation_year": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1950 || n > 2100) errors.push("graduation_year: out of range");
        else clean[field] = n;
        break;
      }
      case "years_experience": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 70) errors.push("years_experience: out of range (0–70)");
        else clean[field] = n;
        break;
      }
    }
  }

  return { clean, errors };
}
