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
  mentor_preference: "ref_mentor_preference", // legacy (Excel intake/analytics)
  // Step 6 "Tell Us"
  language: "ref_language",
  family_relation: "ref_family_relation",
  family_occupation: "ref_family_occupation",
  income_band: "ref_income_band",
  reservation_category: "ref_reservation_category",
  caste_certificate_status: "ref_caste_certificate_status",
  hobby: "ref_hobby",
};

/** student_profile columns each step may write (the form's per-step field map). */
export const STEP_FIELDS: Record<number, string[]> = {
  1: ["full_name", "phone", "gender", "city_village", "district", "state"],
  2: ["college_id", "roll_number", "degree", "branch", "year_of_study", "graduation_year", "cgpa"],
  3: ["preferred_category_slugs"],
  4: ["skill_assessment"],
  5: ["skills", "interests"],
  // Step 6 "Tell Us" (all optional)
  6: [
    "is_first_generation", "date_of_birth", "languages",
    "caste_certificate_status", "reservation_category", "income_band",
    "family_members", "hobbies", "custom_hobbies", "biggest_challenge",
  ],
};

/** Minimum student age (years). Students must have completed 12th standard to be
 * here, so a DOB younger than this is rejected by both the picker and the API. */
export const MIN_AGE_YEARS = 17;

export const ALL_FIELDS = Object.values(STEP_FIELDS).flat();

/** Fields that count toward profileCompleteness (steps 1–5). Step 6 "Tell Us" is
 * optional background enrichment ("share what you're comfortable with"), and much
 * of it is conditional — e.g. reservation_category only applies to students who
 * hold a caste certificate, and custom_hobbies is a niche write-in escape hatch.
 * Counting those would make 100% structurally unreachable for most students and
 * mis-fire the approval email's "complete your profile" nudge, so the metric
 * deliberately ignores Step 6 (the fields still round-trip via ALL_FIELDS). */
export const COMPLETENESS_FIELDS = Object.entries(STEP_FIELDS)
  .filter(([step]) => Number(step) !== 6)
  .flatMap(([, fields]) => fields);

/** Grandfathered columns the wizard no longer writes (Step 3 moved to
 * preference categories in #42) but the admin grid / analytics / Excel intake
 * still read + write. Kept OUT of ALL_FIELDS so student completeness ignores
 * them, but still selected and validatable. */
export const LEGACY_FIELDS = ["career_goal_ids", "primary_career_goal_id", "preferred_mentor_pref_id"];

/** The columns returned by GET /api/registration/profile. */
export const PROFILE_SELECT = [...ALL_FIELDS, "college_id", ...LEGACY_FIELDS].join(", ");

/**
 * Profile completeness as a 0–100 %: how many of the core profile fields (steps
 * 1–5, see COMPLETENESS_FIELDS) carry a value. One source of truth for the admin
 * grid and the approval email's "complete your profile" nudge. A field counts as
 * filled when it's a non-empty string/number, array, or object (skill_assessment).
 */
export function profileCompleteness(profile: Record<string, unknown> | null | undefined): number {
  if (!profile) return 0;
  const filled = COMPLETENESS_FIELDS.filter((f) => {
    const v = profile[f];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return true; // numbers / booleans
  }).length;
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
}

/** Fields required before registration can be marked 'submitted'. Only the first
 * two steps are mandatory — career goals, self-assessment, skills and mentor
 * (steps 3–6) are optional, so a student can submit right after Academics. */
export const REQUIRED_FIELDS: { step: number; field: string }[] = [
  { step: 1, field: "full_name" },
  { step: 1, field: "phone" },
  { step: 2, field: "college_id" },
  { step: 2, field: "roll_number" },
];

type Refs = {
  slugSets: Record<string, Set<string>>; // gender/degree/branch/year_of_study/skill/interest/skill_assessment_category
  goalIds: Set<string>;
  mentorIds: Set<string>;
  categorySlugs: Set<string>; // ref_preference_category.slug (Step 3)
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
  // Step 6 "Tell Us"
  if (fields.includes("languages")) wantSlug.push(["language", "ref_language"]);
  if (fields.includes("hobbies")) wantSlug.push(["hobby", "ref_hobby"]);
  if (fields.includes("caste_certificate_status")) wantSlug.push(["caste_certificate_status", "ref_caste_certificate_status"]);
  if (fields.includes("reservation_category")) wantSlug.push(["reservation_category", "ref_reservation_category"]);
  if (fields.includes("income_band")) wantSlug.push(["income_band", "ref_income_band"]);
  if (fields.includes("family_members")) {
    wantSlug.push(["family_relation", "ref_family_relation"]);
    wantSlug.push(["family_occupation", "ref_family_occupation"]);
  }

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
  let categorySlugs = new Set<string>();
  if (fields.includes("preferred_category_slugs")) {
    const { data } = await supabase.from("ref_preference_category").select("slug");
    categorySlugs = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  }
  return { slugSets, goalIds, mentorIds, categorySlugs };
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
  const writable = new Set([...ALL_FIELDS, ...LEGACY_FIELDS]);
  const fields = Object.keys(data).filter((f) => writable.has(f));
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
        clean[field] = str(v) || null;
        break;
      case "biggest_challenge": {
        // Free text authored as Markdown; cap length as a safety bound.
        const t = str(v);
        if (t.length > 5000) errors.push("biggest_challenge: too long (max 5000 chars)");
        else clean[field] = t || null;
        break;
      }
      case "phone": {
        const p = str(v);
        if (p && !/^[+()\d][\d\s().-]{5,19}$/.test(p)) errors.push("phone: invalid format");
        else clean[field] = p || null;
        break;
      }
      case "roll_number": {
        const s = str(v);
        if (s && (s.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9/-]*$/.test(s)))
          errors.push("roll_number: invalid format");
        else clean[field] = s || null;
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
      case "preferred_category_slugs": {
        if (!Array.isArray(v)) { errors.push("preferred_category_slugs: must be a list"); break; }
        const vals = v.map(str).filter(Boolean);
        if (vals.length > 2) { errors.push("preferred_category_slugs: pick at most 2"); break; }
        const bad = vals.filter((s) => !refs.categorySlugs.has(s));
        if (bad.length) errors.push(`preferred_category_slugs: unknown value(s): ${bad.join(", ")}`);
        else clean[field] = vals;
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
      // ---- Step 6 "Tell Us" ---------------------------------------------
      case "is_first_generation": {
        if (v === "" || v == null) { clean[field] = null; break; }
        if (typeof v === "boolean") { clean[field] = v; break; }
        const s = str(v).toLowerCase();
        if (s === "yes" || s === "true") clean[field] = true;
        else if (s === "no" || s === "false") clean[field] = false;
        else errors.push("is_first_generation: must be yes/no");
        break;
      }
      case "date_of_birth": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const s = str(v);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
          errors.push("date_of_birth: must be YYYY-MM-DD");
          break;
        }
        // The picker enforces the same range, but a direct API call bypasses it —
        // bound it server-side too. Students must be at least 17 (they need to have
        // completed 12th standard to be here), which also rules out future dates.
        const dob = new Date(`${s}T00:00:00Z`);
        const now = new Date();
        const maxDob = Date.UTC(now.getUTCFullYear() - MIN_AGE_YEARS, now.getUTCMonth(), now.getUTCDate());
        if (dob.getUTCFullYear() < 1900) errors.push("date_of_birth: year is out of range");
        else if (dob.getTime() > maxDob) errors.push(`date_of_birth: you must be at least ${MIN_AGE_YEARS} years old`);
        else clean[field] = s;
        break;
      }
      case "caste_certificate_status":
      case "reservation_category":
      case "income_band": {
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!refs.slugSets[field]?.has(s)) errors.push(`${field}: '${s}' is not a valid option`);
        else clean[field] = s;
        break;
      }
      case "languages":
      case "hobbies": {
        if (!Array.isArray(v)) { errors.push(`${field}: must be a list`); break; }
        const setKey = field === "languages" ? "language" : "hobby";
        const vals = v.map(str).filter(Boolean);
        const bad = vals.filter((s) => !refs.slugSets[setKey]?.has(s));
        if (bad.length) errors.push(`${field}: unknown value(s): ${bad.join(", ")}`);
        else clean[field] = vals;
        break;
      }
      case "custom_hobbies": {
        // Free-text write-ins (not in ref_hobby). Trim, drop blanks, dedupe.
        // Reject (don't silently truncate) over-length entries or too many —
        // the UI caps both (maxLength 60, max 20), so this only guards direct API use.
        if (!Array.isArray(v)) { errors.push("custom_hobbies: must be a list"); break; }
        const vals = Array.from(new Set(v.map(str).filter(Boolean)));
        if (vals.some((s) => s.length > 100)) errors.push("custom_hobbies: each hobby must be 100 characters or fewer");
        else if (vals.length > 20) errors.push("custom_hobbies: too many (max 20)");
        else clean[field] = vals;
        break;
      }
      case "family_members": {
        if (!Array.isArray(v)) { errors.push("family_members: must be a list"); break; }
        if (v.length > 12) { errors.push("family_members: too many (max 12)"); break; }
        const rel = refs.slugSets["family_relation"];
        const occ = refs.slugSets["family_occupation"];
        const out: { relation: string; occupation: string }[] = [];
        let bad = false;
        for (const m of v) {
          if (typeof m !== "object" || m == null) { bad = true; continue; }
          const relation = str((m as Record<string, unknown>).relation);
          const occupation = str((m as Record<string, unknown>).occupation);
          if (!relation && !occupation) continue; // skip empty rows
          if (relation && rel && !rel.has(relation)) { errors.push(`family_members: unknown relation '${relation}'`); bad = true; }
          if (occupation && occ && !occ.has(occupation)) { errors.push(`family_members: unknown occupation '${occupation}'`); bad = true; }
          out.push({ relation, occupation });
        }
        if (bad) { errors.push("family_members: invalid entries"); break; }
        clean[field] = out;
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
