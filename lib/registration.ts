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
import {
  OTHER_TEXT_MAX,
  currentYearOfStudy,
  durationOf,
  resolveBranchPair,
  type BranchMode,
  type DegreeBranchRow,
} from "@/lib/degree-branch";
import { ADDRESS_LINE_MAX, FLAT_BUILDING_MAX, PINCODE_RE, isAddressSource } from "@/lib/geo";

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
  // pincode anchors the address (#101): it resolves district + state from
  // the geocoder so a student types six digits instead of three place names.
  // address_source records how they got filled — see the note in validatePartial.
  1: ["full_name", "phone", "gender", "flat_building", "address", "latitude", "longitude", "pincode", "address_source", "city_village", "district", "state"],
  // degree_other / branch_other capture the free text behind an "Other" pick
  // (issue #99) — before them, a student whose course wasn't listed picked
  // "Other" and their real answer was thrown away.
  2: ["college_id", "roll_number", "registration_number", "apaar_id", "degree", "degree_other", "branch", "branch_other", "year_of_study", "graduation_year", "cgpa"],
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
/** Optional identity fields that must NOT count toward completeness. Like Step 6,
 * these have no `required` prop and many students won't have them (a university
 * registration number isn't universal; APAAR/ABC ID is explicitly "leave blank if
 * you don't have one yet") — counting them would make 100% structurally
 * unreachable and mis-fire the "complete your profile" nudge. */
/** degree_other/branch_other join them for the same reason and one more: they are
 * only reachable by the minority who pick "Other", so counting them would cap
 * every correctly-catalogued student below 100%. */
/** address_source joins them for a different reason: it is not something a
 * student fills in at all — it's provenance metadata the form stamps (#101).
 * Counting it would mean a student who typed their address by hand scored the
 * same as one who used the location button, and a legacy row (source null) could
 * never reach 100%. `pincode` DOES count: it is a real address field, and the
 * whole point is that it's the easiest one to provide. */
export const COMPLETENESS_EXCLUDE = new Set([
  "registration_number", "apaar_id", "degree_other", "branch_other", "address_source",
  // The map pin is an optional convenience, and most students will finish their
  // address without opening a map at all — counting it would cap them below 100%
  // for declining a feature.
  "latitude", "longitude",
]);

export const COMPLETENESS_FIELDS = Object.entries(STEP_FIELDS)
  .filter(([step]) => Number(step) !== 6)
  .flatMap(([, fields]) => fields)
  .filter((f) => !COMPLETENESS_EXCLUDE.has(f));

/**
 * Columns the DATABASE owns, never the client. `entry_academic_year` is stamped by a
 * trigger (migration 162) from whatever year_of_study a writer supplies — that is
 * what makes the year self-rolling instead of a snapshot that goes stale. It is
 * SELECTED (the read paths derive the current year from it) but deliberately absent
 * from STEP_FIELDS, so a crafted PATCH can't back-date a student's cohort.
 */
export const DERIVED_FIELDS = ["entry_academic_year"];

/** Grandfathered columns the wizard no longer writes (Step 3 moved to
 * preference categories in #42) but the admin grid / analytics / Excel intake
 * still read + write. Kept OUT of ALL_FIELDS so student completeness ignores
 * them, but still selected and validatable. */
export const LEGACY_FIELDS = ["career_goal_ids", "primary_career_goal_id", "preferred_mentor_pref_id"];

/** The columns returned by GET /api/registration/profile. */
export const PROFILE_SELECT = [...ALL_FIELDS, "college_id", ...LEGACY_FIELDS, ...DERIVED_FIELDS].join(", ");

/**
 * Profile completeness as a 0–100 %: how many of the core profile fields (steps
 * 1–5, see COMPLETENESS_FIELDS) carry a value. One source of truth for the admin
 * grid and the approval email's "complete your profile" nudge. A field counts as
 * filled when it's a non-empty string/number, array, or object (skill_assessment).
 */
export function profileCompleteness(
  profile: Record<string, unknown> | null | undefined,
  /**
   * The degrees that have NO branch (`branch_mode = 'none'`: MBA, MCA, M.Com,
   * B.Pharm, Pharm.D, B.Arch, Other). For a student on one of these the Branch field
   * is never rendered and the API forces `branch` to null, so counting it capped them
   * at 16/17 = 94% forever — the admin grid showed them permanently incomplete and the
   * approval email nagged them to fill a field they will never be shown. Same reason
   * degree_other/branch_other are in COMPLETENESS_EXCLUDE.
   *
   * Optional so existing callers keep working; omitting it just counts `branch` as
   * before, which is correct for every branch-bearing degree.
   */
  noBranchDegrees?: Set<string> | null,
): number {
  if (!profile) return 0;
  const skipBranch =
    !!noBranchDegrees && typeof profile.degree === "string" && noBranchDegrees.has(profile.degree);
  const fields = skipBranch ? COMPLETENESS_FIELDS.filter((f) => f !== "branch") : COMPLETENESS_FIELDS;
  const filled = fields.filter((f) => {
    const v = profile[f];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return true; // numbers / booleans
  }).length;
  return Math.round((filled / fields.length) * 100);
}

/** The `branch_mode = 'none'` degree slugs, for profileCompleteness(). */
export const noBranchDegreeSet = (degrees: { slug: string; branch_mode: string }[]) =>
  new Set(degrees.filter((d) => d.branch_mode === "none").map((d) => d.slug));

/** Fields required before registration can be marked 'submitted'. Only the first
 * two steps are mandatory — career goals, self-assessment, skills and mentor
 * (steps 3–6) are optional, so a student can submit right after Academics. */
export const REQUIRED_FIELDS: { step: number; field: string }[] = [
  { step: 1, field: "full_name" },
  { step: 1, field: "phone" },
  { step: 2, field: "college_id" },
];

/**
 * Human-friendly field names for user-facing validation messages, so a raw
 * column name (e.g. `apaar_id`) never reaches a student. One source of truth for
 * the messages built in validatePartial(); `labelFor` falls back to a
 * title-cased, de-underscored slug for any field not listed.
 */
export const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  phone: "Mobile number",
  gender: "Gender",
  latitude: "Pinned latitude",
  longitude: "Pinned longitude",
  flat_building: "Flat / building / street",
  address: "Address",
  pincode: "PIN code",
  address_source: "Address source",
  city_village: "Village / Mandal / City",
  district: "District",
  state: "State",
  college_id: "College",
  roll_number: "Roll number",
  registration_number: "University registration number",
  apaar_id: "APAAR / ABC ID",
  degree: "Degree",
  degree_other: "Degree (other)",
  branch: "Branch",
  branch_other: "Branch (other)",
  year_of_study: "Year of study",
  graduation_year: "Graduation year",
  cgpa: "CGPA / percentage",
  preferred_category_slugs: "Career paths",
  career_goal_ids: "Career goals",
  primary_career_goal_id: "Primary career goal",
  preferred_mentor_pref_id: "Preferred mentor type",
  skills: "Skills",
  interests: "Interests",
  skill_assessment: "Skill assessment",
  is_first_generation: "First-generation learner",
  date_of_birth: "Date of birth",
  languages: "Languages",
  caste_certificate_status: "Caste certificate status",
  reservation_category: "Reservation category",
  income_band: "Family income",
  family_members: "Family members",
  hobbies: "Hobbies",
  custom_hobbies: "Hobbies",
  biggest_challenge: "Your biggest challenge",
};

export const labelFor = (field: string): string =>
  FIELD_LABELS[field] ??
  field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type Refs = {
  slugSets: Record<string, Set<string>>; // gender/degree/branch/year_of_study/skill/interest/skill_assessment_category
  goalIds: Set<string>;
  mentorIds: Set<string>;
  categorySlugs: Set<string>; // ref_preference_category.slug (Step 3)
  branchModes: Map<string, BranchMode>; // ref_degree.slug -> branch_mode (#99)
  pairs: DegreeBranchRow[];             // ref_degree_branch (#99)
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

  // Degree → Branch (#99). Loaded whenever EITHER field is in play, because the
  // rules are cross-field in both directions: a new degree can invalidate a
  // stored branch, and a branch is only meaningful against a degree.
  //
  // Deliberately NOT filtered by is_active — matching the slug loads above.
  // Deactivating a branch (or a mapping row) hides it from NEW pickers; it must
  // not start rejecting the save of a student who already holds that value.
  const branchModes = new Map<string, BranchMode>();
  let pairs: DegreeBranchRow[] = [];
  if (fields.includes("degree") || fields.includes("branch")) {
    const [degrees, map] = await Promise.all([
      supabase.from("ref_degree").select("slug, branch_mode"),
      supabase.from("ref_degree_branch").select("degree_slug, branch_slug, sort_order, group_label"),
    ]);
    for (const d of (degrees.data ?? []) as { slug: string; branch_mode: BranchMode }[]) {
      branchModes.set(d.slug, d.branch_mode);
    }
    pairs = (map.data ?? []) as DegreeBranchRow[];
  }

  return { slugSets, goalIds, mentorIds, categorySlugs, branchModes, pairs };
}

/**
 * Replace the STORED year_of_study with the CURRENT one, derived from the anchor.
 *
 * Every read path goes through here rather than deriving in the client, for two
 * reasons: the client would need the ref data loaded before it could derive (a race
 * on first paint), and the enrolment filter has to derive server-side anyway. The
 * form then hydrates with the right year and, because answer→anchor→answer is
 * idempotent, re-saving Step 2 doesn't move the anchor.
 *
 * Falls back to the stored slug whenever derivation is impossible (no anchor,
 * 'passed_out', degree 'other') — see currentYearOfStudy.
 */
export async function withCurrentYearOfStudy<T extends Record<string, unknown>>(
  row: T | null,
): Promise<T | null> {
  if (!row) return row;
  const { getDegreeBranchData } = await import("@/lib/ref-cache");
  const { degree } = await getDegreeBranchData();
  const duration = durationOf(row.degree as string | null, degree);
  const current = currentYearOfStudy(
    row.entry_academic_year as number | null,
    row.year_of_study as string | null,
    duration,
  );
  return { ...row, year_of_study: current };
}

export type ValidationResult = {
  clean: Record<string, unknown>;
  errors: string[];
};

/**
 * Validate + normalize a PARTIAL payload (only the provided fields). Lenient by
 * design — missing fields are never errors, so a half-finished step still saves
 * and the user can resume. Returns the cleaned values to write + any errors.
 *
 * `stored` is the row already on disk (degree/branch only). It exists because the
 * degree→branch rule is genuinely cross-field: a PATCH of just `{degree: 'mba'}`
 * has to null out a branch it can't see, and a PATCH of just `{branch}` has to be
 * checked against the degree the student saved earlier. Callers that omit it get
 * the safe reading — "no degree stored" — which turns a lone branch into a
 * user-facing "choose your degree first" rather than an unvalidated write.
 */
export async function validatePartial(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  stored?: { degree?: string | null; branch?: string | null } | null,
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
      case "latitude":
      case "longitude": {
        // The map pin (#101 follow-up). Bounded to real coordinates, and rounded to
        // 6dp to match the numeric(9,6) column — an unrounded double would be
        // silently truncated by Postgres, so it is done here where it's visible.
        if (v === "" || v == null) { clean[field] = null; break; }
        const n = Number(v);
        const limit = field === "latitude" ? 90 : 180;
        if (!Number.isFinite(n) || n < -limit || n > limit)
          errors.push(`${labelFor(field)} is not a valid coordinate.`);
        else clean[field] = Math.round(n * 1e6) / 1e6;
        break;
      }
      case "flat_building":
      case "address": {
        // Free text (#101). Bounded to match the CHECKs in migration 163 so an
        // over-long paste is a readable validation error rather than a 500 from the
        // database.
        const s2 = str(v);
        const cap = field === "address" ? ADDRESS_LINE_MAX : FLAT_BUILDING_MAX;
        if (s2.length > cap)
          errors.push(`Please keep your ${labelFor(field).toLowerCase()} under ${cap} characters.`);
        else clean[field] = s2 || null;
        break;
      }
      case "pincode": {
        // Accept as typed (a student may paste "522 201") and store digits only,
        // matching the CHECK on student_profile.pincode (migration 163).
        const s = str(v).replace(/[\s-]/g, "");
        if (!s) { clean[field] = null; break; }
        if (!PINCODE_RE.test(s)) errors.push(`${labelFor("pincode")} must be 6 digits.`);
        else clean[field] = s;
        break;
      }
      case "address_source": {
        // Provenance, self-reported by the form. Constrained to the enum so a
        // stray value can't hit the DB CHECK and turn a save into a 500 — but
        // deliberately NOT verified, because the server has no way to know how a
        // student filled a text input. It informs data-quality reporting only, and
        // is never read as a trust or authorization signal.
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!isAddressSource(s)) errors.push("Unrecognised address source.");
        else clean[field] = s;
        break;
      }
      case "degree_other":
      case "branch_other": {
        // Free text behind an "Other" pick. Whether it's KEPT is decided by the
        // cross-field pass below (it's dropped when the field isn't on 'other');
        // here we only bound it.
        const s = str(v);
        if (s.length > OTHER_TEXT_MAX)
          errors.push(`Please keep your ${labelFor(field).toLowerCase()} under ${OTHER_TEXT_MAX} characters.`);
        else clean[field] = s || null;
        break;
      }
      case "biggest_challenge": {
        // Free text authored as Markdown; cap length as a safety bound.
        const t = str(v);
        if (t.length > 5000) errors.push(`${labelFor("biggest_challenge")} is too long (maximum 5000 characters).`);
        else clean[field] = t || null;
        break;
      }
      case "phone": {
        const p = str(v);
        if (p && !/^[+()\d][\d\s().-]{5,19}$/.test(p)) errors.push("Please enter a valid mobile number.");
        else clean[field] = p || null;
        break;
      }
      case "roll_number":
      case "registration_number": {
        // Roll number (class/exam id) and university registration/enrollment no.
        // share the same lenient free-text rule: alphanumeric + '/' and '-'.
        const s = str(v);
        if (s && (s.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9/-]*$/.test(s)))
          errors.push(`Please enter a valid ${labelFor(field).toLowerCase()} (letters, numbers, / and - only).`);
        else clean[field] = s || null;
        break;
      }
      case "apaar_id": {
        // APAAR / ABC ID — a 12-digit number. Accept as typed (with spaces or
        // hyphens) and store digits-only; validated only when a value is given.
        const s = str(v).replace(/[\s-]/g, "");
        if (s && !/^\d{12}$/.test(s)) errors.push(`${labelFor("apaar_id")} must be a 12-digit number.`);
        else clean[field] = s || null;
        break;
      }
      case "gender":
      case "degree":
      case "branch":
      case "year_of_study": {
        const s = str(v);
        if (s && !refs.slugSets[field === "year_of_study" ? "year_of_study" : field]?.has(s))
          errors.push(`Please choose a valid ${labelFor(field).toLowerCase()}.`);
        else clean[field] = s || null;
        break;
      }
      case "college_id":
      case "primary_career_goal_id":
      case "preferred_mentor_pref_id": {
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!UUID_RE.test(s)) { errors.push(`Please select a valid ${labelFor(field).toLowerCase()}.`); break; }
        if (field === "primary_career_goal_id" && !refs.goalIds.has(s))
          errors.push(`Please select a valid ${labelFor("primary_career_goal_id").toLowerCase()}.`);
        else if (field === "preferred_mentor_pref_id" && !refs.mentorIds.has(s))
          errors.push(`Please select a valid ${labelFor("preferred_mentor_pref_id").toLowerCase()}.`);
        else clean[field] = s;
        break;
      }
      case "career_goal_ids": {
        if (!Array.isArray(v)) { errors.push(`${labelFor("career_goal_ids")} must be a list.`); break; }
        const ids = v.map(str).filter(Boolean);
        const bad = ids.filter((id) => !UUID_RE.test(id) || !refs.goalIds.has(id));
        if (bad.length) errors.push("One or more selected career goals are invalid.");
        else clean[field] = ids;
        break;
      }
      case "preferred_category_slugs": {
        if (!Array.isArray(v)) { errors.push(`${labelFor("preferred_category_slugs")} must be a list.`); break; }
        const vals = v.map(str).filter(Boolean);
        if (vals.length > 2) { errors.push("Please pick at most 2 career paths."); break; }
        const bad = vals.filter((s) => !refs.categorySlugs.has(s));
        if (bad.length) errors.push("One or more selected career paths are invalid.");
        else clean[field] = vals;
        break;
      }
      case "skills":
      case "interests": {
        if (!Array.isArray(v)) { errors.push(`${labelFor(field)} must be a list.`); break; }
        const setKey = field === "skills" ? "skill" : "interest";
        const vals = v.map(str).filter(Boolean);
        const bad = vals.filter((s) => !refs.slugSets[setKey]?.has(s));
        if (bad.length) errors.push(`One or more selected ${labelFor(field).toLowerCase()} are invalid.`);
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
        else errors.push("Please select yes or no.");
        break;
      }
      case "date_of_birth": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const s = str(v);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
          errors.push("Please enter a valid date of birth.");
          break;
        }
        // The picker enforces the same range, but a direct API call bypasses it —
        // bound it server-side too. Students must be at least 17 (they need to have
        // completed 12th standard to be here), which also rules out future dates.
        const dob = new Date(`${s}T00:00:00Z`);
        const now = new Date();
        const maxDob = Date.UTC(now.getUTCFullYear() - MIN_AGE_YEARS, now.getUTCMonth(), now.getUTCDate());
        if (dob.getUTCFullYear() < 1900) errors.push("Please enter a valid date of birth.");
        else if (dob.getTime() > maxDob) errors.push(`You must be at least ${MIN_AGE_YEARS} years old.`);
        else clean[field] = s;
        break;
      }
      case "caste_certificate_status":
      case "reservation_category":
      case "income_band": {
        const s = str(v);
        if (!s) { clean[field] = null; break; }
        if (!refs.slugSets[field]?.has(s)) errors.push(`Please choose a valid ${labelFor(field).toLowerCase()}.`);
        else clean[field] = s;
        break;
      }
      case "languages":
      case "hobbies": {
        if (!Array.isArray(v)) { errors.push(`${labelFor(field)} must be a list.`); break; }
        const setKey = field === "languages" ? "language" : "hobby";
        const vals = v.map(str).filter(Boolean);
        const bad = vals.filter((s) => !refs.slugSets[setKey]?.has(s));
        if (bad.length) errors.push(`One or more selected ${labelFor(field).toLowerCase()} are invalid.`);
        else clean[field] = vals;
        break;
      }
      case "custom_hobbies": {
        // Free-text write-ins (not in ref_hobby). Trim, drop blanks, dedupe.
        // Reject (don't silently truncate) over-length entries or too many —
        // the UI caps both (maxLength 60, max 20), so this only guards direct API use.
        if (!Array.isArray(v)) { errors.push("Hobbies must be a list."); break; }
        const vals = Array.from(new Set(v.map(str).filter(Boolean)));
        if (vals.some((s) => s.length > 100)) errors.push("Each hobby must be 100 characters or fewer.");
        else if (vals.length > 20) errors.push("Please add at most 20 hobbies.");
        else clean[field] = vals;
        break;
      }
      case "family_members": {
        if (!Array.isArray(v)) { errors.push(`${labelFor("family_members")} must be a list.`); break; }
        if (v.length > 12) { errors.push("Please add at most 12 family members."); break; }
        const rel = refs.slugSets["family_relation"];
        const occ = refs.slugSets["family_occupation"];
        const out: { relation: string; occupation: string }[] = [];
        let bad = false;
        for (const m of v) {
          if (typeof m !== "object" || m == null) { bad = true; continue; }
          const relation = str((m as Record<string, unknown>).relation);
          const occupation = str((m as Record<string, unknown>).occupation);
          if (!relation && !occupation) continue; // skip empty rows
          if (relation && rel && !rel.has(relation)) { errors.push(`'${relation}' is not a valid family relation.`); bad = true; }
          if (occupation && occ && !occ.has(occupation)) { errors.push(`'${occupation}' is not a valid occupation.`); bad = true; }
          out.push({ relation, occupation });
        }
        if (bad) { errors.push("Some family member entries are invalid."); break; }
        clean[field] = out;
        break;
      }
      case "graduation_year": {
        const n = Number(v);
        if (v === "" || v == null) { clean[field] = null; break; }
        if (!Number.isInteger(n) || n < 1950 || n > 2100) errors.push(`${labelFor("graduation_year")} must be between 1950 and 2100.`);
        else clean[field] = n;
        break;
      }
      case "cgpa": {
        if (v === "" || v == null) { clean[field] = null; break; }
        const n = Number(v);
        if (Number.isNaN(n) || n < 0 || n > 100) errors.push(`${labelFor("cgpa")} must be between 0 and 100.`);
        else clean[field] = n;
        break;
      }
      case "skill_assessment": {
        if (typeof v !== "object" || v == null || Array.isArray(v)) {
          errors.push(`${labelFor("skill_assessment")} is invalid.`);
          break;
        }
        const cats = refs.slugSets["skill_assessment_category"];
        const obj: Record<string, number> = {};
        for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
          if (cats && !cats.has(k)) { errors.push(`'${k}' is not a valid skill category.`); continue; }
          const n = Number(raw);
          // 0 = "no skill" (a deliberate answer); 1–5 = beginner→confident.
          // Categories the student hasn't answered are simply absent from the map.
          if (!Number.isInteger(n) || n < 0 || n > 5) { errors.push("Each skill rating must be between 0 and 5."); continue; }
          obj[k] = n;
        }
        clean[field] = obj;
        break;
      }
    }
  }

  // Cross-field: degree ⇄ branch (#99). Runs after the per-field pass because it
  // needs the CLEANED slugs, and it can override `clean.branch` — a degree with no
  // branch, or a degree change that orphans the stored branch, nulls it here.
  const pair = resolveBranchPair({
    provided: data,
    clean,
    stored,
    branchModes: refs.branchModes,
    pairs: refs.pairs,
  });
  Object.assign(clean, pair.patch);
  errors.push(...pair.errors);

  // Cross-field: primary goal must be one of the selected goals (when both present).
  const goals = (clean.career_goal_ids as string[] | undefined) ?? (data.career_goal_ids as string[] | undefined);
  const primary = (clean.primary_career_goal_id as string | undefined) ?? (data.primary_career_goal_id as string | undefined);
  if (primary && Array.isArray(goals) && !goals.includes(primary)) {
    errors.push("Your primary career goal must be one of your selected career goals.");
  }

  return { clean, errors };
}
