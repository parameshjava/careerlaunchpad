/**
 * Shared model for the student registration form + admin Excel intake.
 *
 * One source of truth for: which `ref_*` tables back the option sets, which
 * student_profile columns each of the 6 steps writes, and how to validate a
 * partial payload. Used by the reference API, the registration profile API
 * (incremental PATCH), and the Excel import normalizer — so the form, API and
 * DB never drift (see docs/REGISTRATION_AND_INTAKE_API.md and CLAUDE.md's
 * "API design first" principle).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Reference option sets the form needs: response key -> ref_* table. */
export const REF_TABLES: Record<string, string> = {
  gender: "ref_gender",
  degree: "ref_degree",
  branch: "ref_branch",
  year_of_study: "ref_year_of_study",
  career_goal: "ref_career_goal",
  skill_assessment_category: "ref_skill_assessment_category",
  skill: "ref_skill",
  interest: "ref_interest",
  mentor_preference: "ref_mentor_preference",
};

/** student_profile columns each step may write (the form's per-step field map). */
export const STEP_FIELDS: Record<number, string[]> = {
  1: ["full_name", "phone", "gender", "city_village", "district", "state"],
  2: ["college_id", "degree", "branch", "year_of_study", "graduation_year", "cgpa"],
  3: ["career_goal_ids", "primary_career_goal_id"],
  4: ["skill_assessment"],
  5: ["skills", "interests"],
  6: ["preferred_mentor_pref_id", "biggest_challenge"],
};

export const ALL_FIELDS = Object.values(STEP_FIELDS).flat();

/** The columns returned by GET /api/registration/profile. */
export const PROFILE_SELECT = [...ALL_FIELDS, "college_id"].join(", ");

/** Fields required before registration can be marked 'submitted'. */
export const REQUIRED_FIELDS: { step: number; field: string }[] = [
  { step: 1, field: "full_name" },
  { step: 1, field: "phone" },
  { step: 2, field: "college_id" },
  { step: 3, field: "career_goal_ids" },
  { step: 3, field: "primary_career_goal_id" },
];

type Refs = {
  slugSets: Record<string, Set<string>>; // gender/degree/branch/year_of_study/skill/interest/skill_assessment_category
  goalIds: Set<string>;
  mentorIds: Set<string>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Load just the ref sets needed to validate the provided fields. */
async function loadRefs(supabase: SupabaseClient, fields: string[]): Promise<Refs> {
  const slugSets: Record<string, Set<string>> = {};
  const wantSlug: [string, string][] = [];
  if (fields.includes("gender")) wantSlug.push(["gender", "ref_gender"]);
  if (fields.includes("degree")) wantSlug.push(["degree", "ref_degree"]);
  if (fields.includes("branch")) wantSlug.push(["branch", "ref_branch"]);
  if (fields.includes("year_of_study")) wantSlug.push(["year_of_study", "ref_year_of_study"]);
  if (fields.includes("skills")) wantSlug.push(["skill", "ref_skill"]);
  if (fields.includes("interests")) wantSlug.push(["interest", "ref_interest"]);
  if (fields.includes("skill_assessment")) wantSlug.push(["skill_assessment_category", "ref_skill_assessment_category"]);

  await Promise.all(
    wantSlug.map(async ([key, table]) => {
      const { data } = await supabase.from(table).select("slug");
      slugSets[key] = new Set((data ?? []).map((r: { slug: string }) => r.slug));
    }),
  );

  let goalIds = new Set<string>();
  if (fields.includes("career_goal_ids") || fields.includes("primary_career_goal_id")) {
    const { data } = await supabase.from("ref_career_goal").select("id");
    goalIds = new Set((data ?? []).map((r: { id: string }) => r.id));
  }
  let mentorIds = new Set<string>();
  if (fields.includes("preferred_mentor_pref_id")) {
    const { data } = await supabase.from("ref_mentor_preference").select("id");
    mentorIds = new Set((data ?? []).map((r: { id: string }) => r.id));
  }
  return { slugSets, goalIds, mentorIds };
}

export type ValidationResult = {
  clean: Record<string, unknown>;
  errors: string[];
};

/**
 * Validate + normalize a PARTIAL payload (only the provided fields). Lenient by
 * design — missing fields are never errors, so a half-finished step still saves
 * and the user can resume. Returns the cleaned values to write + any errors.
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
      case "city_village":
      case "district":
      case "state":
      case "biggest_challenge":
        clean[field] = str(v) || null;
        break;
      case "phone": {
        const p = str(v);
        if (p && !/^[+()\d][\d\s().-]{5,19}$/.test(p)) errors.push("phone: invalid format");
        else clean[field] = p || null;
        break;
      }
      case "gender":
      case "degree":
      case "branch":
      case "year_of_study": {
        const s = str(v);
        if (s && !refs.slugSets[field === "year_of_study" ? "year_of_study" : field]?.has(s))
          errors.push(`${field}: '${s}' is not a valid option`);
        else clean[field] = s || null;
        break;
      }
      case "college_id":
      case "primary_career_goal_id":
      case "preferred_mentor_pref_id": {
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!UUID_RE.test(s)) { errors.push(`${field}: not a valid id`); break; }
        if (field === "primary_career_goal_id" && !refs.goalIds.has(s))
          errors.push("primary_career_goal_id: unknown career goal");
        else if (field === "preferred_mentor_pref_id" && !refs.mentorIds.has(s))
          errors.push("preferred_mentor_pref_id: unknown mentor preference");
        else clean[field] = s;
        break;
      }
      case "career_goal_ids": {
        if (!Array.isArray(v)) { errors.push("career_goal_ids: must be a list"); break; }
        const ids = v.map(str).filter(Boolean);
        const bad = ids.filter((id) => !UUID_RE.test(id) || !refs.goalIds.has(id));
        if (bad.length) errors.push(`career_goal_ids: unknown goal(s)`);
        else clean[field] = ids;
        break;
      }
      case "skills":
      case "interests": {
        if (!Array.isArray(v)) { errors.push(`${field}: must be a list`); break; }
        const setKey = field === "skills" ? "skill" : "interest";
        const vals = v.map(str).filter(Boolean);
        const bad = vals.filter((s) => !refs.slugSets[setKey]?.has(s));
        if (bad.length) errors.push(`${field}: unknown value(s): ${bad.join(", ")}`);
        else clean[field] = vals;
        break;
      }
      case "graduation_year": {
        const n = Number(v);
        if (v === "" || v == null) { clean[field] = null; break; }
        if (!Number.isInteger(n) || n < 1950 || n > 2100) errors.push("graduation_year: out of range");
        else clean[field] = n;
        break;
      }
      case "cgpa": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const n = Number(v);
        if (Number.isNaN(n) || n < 0 || n > 100) errors.push("cgpa: out of range (0–100)");
        else clean[field] = n;
        break;
      }
      case "skill_assessment": {
        if (typeof v !== "object" || v == null || Array.isArray(v)) {
          errors.push("skill_assessment: must be an object");
          break;
        }
        const cats = refs.slugSets["skill_assessment_category"];
        const obj: Record<string, number> = {};
        for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
          if (cats && !cats.has(k)) { errors.push(`skill_assessment: unknown category '${k}'`); continue; }
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 1 || n > 5) { errors.push(`skill_assessment.${k}: must be 1–5`); continue; }
          obj[k] = n;
        }
        clean[field] = obj;
        break;
      }
    }
  }

  // Cross-field: primary goal must be one of the selected goals (when both present).
  const goals = (clean.career_goal_ids as string[] | undefined) ?? (data.career_goal_ids as string[] | undefined);
  const primary = (clean.primary_career_goal_id as string | undefined) ?? (data.primary_career_goal_id as string | undefined);
  if (primary && Array.isArray(goals) && !goals.includes(primary)) {
    errors.push("primary_career_goal_id must be one of career_goal_ids");
  }

  return { clean, errors };
}
