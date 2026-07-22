// Typed data-access for the courses catalog (issue #49; schema in
// supabase/migrations/125_fees.sql). A course is a reusable TEMPLATE: its
// details, the competitive exams it prepares for, and a default fee.
// Its SYLLABUS is not stored on the course — it is inherited from the exams it
// targets (see lib/competitive-exam-query.ts). Mirrors lib/exam-query.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseStatus = "active" | "archived";

/** One row in the courses list, with rollup counts. */
export type CourseListRow = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  status: CourseStatus;
  competitiveExamCount: number;
  batchCount: number;
};

/** A subject with the chapters available under it (for the syllabus picker). */
export type SubjectWithChapters = {
  id: string;
  name: string;
  chapters: { id: string; name: string }[];
};

/** A default fee line on the course template (amount in paise). */
export type CourseFeeLineInput = { label: string; amountPaise: number };

/** The full editable course (template). */
export type CourseDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  status: CourseStatus;
  competitiveExamIds: string[];
  feeLines: CourseFeeLineInput[];
};

/** Rupees (as typed by a human, e.g. "18000" or "18,000.50") → integer paise. */
export function rupeesToPaise(input: string | number): number {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

/** Integer paise → a plain rupee string for an input field, e.g. 1800000 → "18000". */
export function paiseToRupeeInput(paise: number): string {
  return (paise / 100).toString();
}

// ---- Reads -----------------------------------------------------------------

export async function fetchCourses(supabase: SupabaseClient): Promise<CourseListRow[]> {
  const { data, error } = await supabase
    .from("course")
    .select("id, slug, name, category, status, created_at, course_competitive_exam(count), batch(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`course: ${error.message}`);
  type CountRow = { count: number }[];
  return (data ?? []).map((c) => {
    const row = c as unknown as {
      id: string; slug: string; name: string; category: string | null; status: CourseStatus;
      course_competitive_exam: CountRow; batch: CountRow;
    };
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      status: row.status,
      competitiveExamCount: row.course_competitive_exam?.[0]?.count ?? 0,
      batchCount: row.batch?.[0]?.count ?? 0,
    };
  });
}

export async function fetchCourse(
  supabase: SupabaseClient,
  id: string
): Promise<CourseDetail | null> {
  const { data, error } = await supabase
    .from("course")
    .select(
      "id, slug, name, description, category, status, " +
        "course_competitive_exam(competitive_exam_id), " +
        "course_fee_line(label, amount_paise, sort_order)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`course: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as {
    id: string; slug: string; name: string; description: string | null;
    category: string | null; status: CourseStatus;
    course_competitive_exam: { competitive_exam_id: string }[];
    course_fee_line: { label: string; amount_paise: number; sort_order: number }[];
  };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    competitiveExamIds: row.course_competitive_exam.map((t) => t.competitive_exam_id),
    feeLines: [...row.course_fee_line]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ label: f.label, amountPaise: f.amount_paise })),
  };
}

/** All active subjects with their chapters, grouped for a syllabus picker. */
export async function fetchSubjectsWithChapters(
  supabase: SupabaseClient
): Promise<SubjectWithChapters[]> {
  const { data: subjects, error: se } = await supabase
    .from("subject")
    .select("id, name")
    .eq("status", "active")
    .order("name");
  if (se) throw new Error(`subject: ${se.message}`);
  const subjectRows = (subjects ?? []) as { id: string; name: string }[];
  if (subjectRows.length === 0) return [];

  const { data: chapters, error: ce } = await supabase
    .from("chapter")
    .select("id, subject_id, name")
    .in("subject_id", subjectRows.map((s) => s.id))
    .order("name");
  if (ce) throw new Error(`chapter: ${ce.message}`);

  const bySubject = new Map<string, { id: string; name: string }[]>();
  for (const ch of (chapters ?? []) as { id: string; subject_id: string; name: string }[]) {
    const list = bySubject.get(ch.subject_id) ?? [];
    list.push({ id: ch.id, name: ch.name });
    bySubject.set(ch.subject_id, list);
  }
  return subjectRows.map((s) => ({ id: s.id, name: s.name, chapters: bySubject.get(s.id) ?? [] }));
}
