// College analytics for the insights dashboard (preview-requirements: skills
// pie, primary-goals pie, all-goals pie, and the student skill-assessment
// breakdown). Like lib/students-query, we aggregate over BOTH places a student
// can live (migration 011): registered students in `student_profile` and
// not-yet-claimed imported students in `student_intake` — so the charts reflect
// every student of the college, not only those who have signed in.
//
// Scoping is enforced by RLS, not here: student_profile is readable by the
// Owner (user.manage / '*') and by a College Admin for their own college
// (college.students.view); student_intake by holders of student.intake.import
// (Owner) or college-scoped admins. An unauthorized caller simply reads no rows
// and gets empty charts. The page layer additionally gates the route and locks
// the college selector to a College Admin's own college.
import type { SupabaseClient } from "@supabase/supabase-js";

/** One slice of a pie chart (a skill or a career goal) with its tally. */
export type Slice = { key: string; label: string; value: number };

/** One axis of the skill-assessment chart: the average (1–5) and how many
 * students answered it. New assessment dimensions added to
 * ref_skill_assessment_category appear here automatically. */
export type AssessmentDatum = { key: string; label: string; average: number; responses: number };

export type CollegeRef = {
  id: string;
  name: string;
  place: string | null;
  state: string | null;
  district: string | null;
  pincode: string | null;
  address: string | null;
  established_in: number | null;
  ownership_type: string | null;
  status: string | null;
};

// Full college record for the details panel (mirrors the import page).
const COLLEGE_SELECT =
  "id, name, place, state, district, pincode, address, established_in, ownership_type, status";

export type CollegeAnalytics = {
  college: CollegeRef | null;
  totals: { students: number; registered: number; imported: number; withAssessment: number };
  skills: Slice[];
  primaryGoals: Slice[];
  allGoals: Slice[];
  assessment: AssessmentDatum[];
};

// The student-shaped fields we aggregate, common to student_profile and
// student_intake (they mirror each other column-for-column — migration 011).
type StudentRow = {
  skills: string[] | null;
  career_goal_ids: string[] | null;
  primary_career_goal_id: string | null;
  skill_assessment: Record<string, number> | null;
};

type RefRow = { id?: string; slug: string; label: string; sort_order?: number };

/** Load the slug/id → label maps the aggregation needs (public-read ref tables). */
async function loadRefMaps(supabase: SupabaseClient) {
  const [skills, goals, categories] = await Promise.all([
    supabase.from("ref_skill").select("slug, label, sort_order").order("sort_order"),
    supabase.from("ref_career_goal").select("id, slug, label, sort_order").order("sort_order"),
    supabase
      .from("ref_skill_assessment_category")
      .select("slug, label, sort_order")
      .order("sort_order"),
  ]);

  const skillRows = (skills.data ?? []) as RefRow[];
  const goalRows = (goals.data ?? []) as RefRow[];
  const categoryRows = (categories.data ?? []) as RefRow[];

  return {
    skillLabel: new Map(skillRows.map((r) => [r.slug, r.label])),
    skillOrder: skillRows.map((r) => r.slug),
    goalLabelById: new Map(goalRows.map((r) => [r.id as string, r.label])),
    goalOrderById: goalRows.map((r) => r.id as string),
    categories: categoryRows, // ordered; drives the assessment axes
  };
}

/** Tally a slug/id keyed counter into ordered, labelled slices (drop zeros). */
function toSlices(
  counts: Map<string, number>,
  order: string[],
  label: (key: string) => string | undefined,
): Slice[] {
  // Keep the ref's sort order; append any unknown keys (defensive) at the end.
  const keys = [...order, ...[...counts.keys()].filter((k) => !order.includes(k))];
  return keys
    .map((key) => ({ key, label: label(key) ?? key, value: counts.get(key) ?? 0 }))
    .filter((s) => s.value > 0);
}

function aggregate(rows: StudentRow[], refs: Awaited<ReturnType<typeof loadRefMaps>>) {
  const skillCounts = new Map<string, number>();
  const primaryCounts = new Map<string, number>();
  const allGoalCounts = new Map<string, number>();
  // category slug -> { sum, n } for averaging the 1–5 self-assessment
  const assess = new Map<string, { sum: number; n: number }>();
  let withAssessment = 0;

  for (const row of rows) {
    for (const slug of row.skills ?? []) {
      skillCounts.set(slug, (skillCounts.get(slug) ?? 0) + 1);
    }
    if (row.primary_career_goal_id) {
      primaryCounts.set(
        row.primary_career_goal_id,
        (primaryCounts.get(row.primary_career_goal_id) ?? 0) + 1,
      );
    }
    for (const id of row.career_goal_ids ?? []) {
      allGoalCounts.set(id, (allGoalCounts.get(id) ?? 0) + 1);
    }
    const sa = row.skill_assessment;
    if (sa && typeof sa === "object" && Object.keys(sa).length > 0) {
      withAssessment += 1;
      for (const [slug, raw] of Object.entries(sa)) {
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        const cur = assess.get(slug) ?? { sum: 0, n: 0 };
        cur.sum += n;
        cur.n += 1;
        assess.set(slug, cur);
      }
    }
  }

  const skills = toSlices(skillCounts, refs.skillOrder, (k) => refs.skillLabel.get(k));
  const primaryGoals = toSlices(primaryCounts, refs.goalOrderById, (k) => refs.goalLabelById.get(k));
  const allGoals = toSlices(allGoalCounts, refs.goalOrderById, (k) => refs.goalLabelById.get(k));

  // Assessment uses ALL categories in ref order (even unanswered → average 0),
  // so the chart shape is stable and new dimensions appear automatically.
  const assessment: AssessmentDatum[] = refs.categories.map((c) => {
    const a = assess.get(c.slug);
    return {
      key: c.slug,
      label: c.label,
      average: a && a.n ? Math.round((a.sum / a.n) * 10) / 10 : 0,
      responses: a?.n ?? 0,
    };
  });

  return { skills, primaryGoals, allGoals, assessment, withAssessment };
}

const STUDENT_FIELDS = "skills, career_goal_ids, primary_career_goal_id, skill_assessment";

/**
 * Analytics for one college, aggregated over its registered + imported students.
 * Returns empty (zeroed) charts when the college has no students or the caller
 * isn't authorized to read them (RLS returns no rows).
 */
export async function fetchCollegeAnalytics(
  supabase: SupabaseClient,
  collegeId: string,
): Promise<CollegeAnalytics> {
  const [refs, collegeRes, profileRes, intakeRes] = await Promise.all([
    loadRefMaps(supabase),
    supabase.from("college").select(COLLEGE_SELECT).eq("id", collegeId).maybeSingle(),
    supabase.from("student_profile").select(STUDENT_FIELDS).eq("college_id", collegeId),
    supabase
      .from("student_intake")
      .select(STUDENT_FIELDS)
      .eq("college_id", collegeId)
      .in("status", ["pending", "invited"]),
  ]);

  if (profileRes.error) throw new Error(`student_profile: ${profileRes.error.message}`);
  if (intakeRes.error) throw new Error(`student_intake: ${intakeRes.error.message}`);

  const registered = (profileRes.data ?? []) as StudentRow[];
  const imported = (intakeRes.data ?? []) as StudentRow[];
  const agg = aggregate([...registered, ...imported], refs);

  return {
    college: (collegeRes.data as CollegeRef | null) ?? null,
    totals: {
      students: registered.length + imported.length,
      registered: registered.length,
      imported: imported.length,
      withAssessment: agg.withAssessment,
    },
    skills: agg.skills,
    primaryGoals: agg.primaryGoals,
    allGoals: agg.allGoals,
    assessment: agg.assessment,
  };
}

/**
 * The same shape for a single signed-in student (the self-view). The pies show
 * the student's own selections (each = 1) and the assessment chart shows their
 * own 1–5 scores. Reads only their own profile (RLS student_profile_self).
 */
export async function fetchStudentAnalytics(
  supabase: SupabaseClient,
  userId: string,
): Promise<CollegeAnalytics> {
  const [refs, profileRes] = await Promise.all([
    loadRefMaps(supabase),
    supabase.from("student_profile").select(STUDENT_FIELDS).eq("user_id", userId).maybeSingle(),
  ]);
  if (profileRes.error) throw new Error(`student_profile: ${profileRes.error.message}`);

  const row = (profileRes.data as StudentRow | null) ?? null;
  const agg = aggregate(row ? [row] : [], refs);

  return {
    college: null,
    totals: {
      students: row ? 1 : 0,
      registered: row ? 1 : 0,
      imported: 0,
      withAssessment: agg.withAssessment,
    },
    skills: agg.skills,
    primaryGoals: agg.primaryGoals,
    allGoals: agg.allGoals,
    assessment: agg.assessment,
  };
}
