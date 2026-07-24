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

/** One subject in a course's syllabus, with the chapters in scope (names only). */
export type StudentSyllabusSubject = { subjectId: string; name: string; chapters: string[] };

/** A competitive exam the course prepares for (for the student details page). */
export type StudentCourseExam = { id: string; code: string; name: string; description: string | null };

/** One course as a card on the student's Courses list (issue #49). A course is
 * shown ONCE; its individual batches (dated runs) live on the details page. */
export type StudentCourseCard = {
  courseId: string;
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  examCodes: string[];
  subjectCount: number;
  chapterCount: number;
  batchCount: number;
  feeFromPaise: number;
  feeToPaise: number;
  enrolled: boolean;
};

/** One dated run of a course the student can enrol into, with its own fee.
 * `enrollmentStatus` mirrors batch.enrollment_status (migration 139): a visible
 * batch can be not-yet-open, open, or closed for new enrolments. */
export type StudentCourseBatch = {
  batchId: string;
  name: string;
  academicYear: string | null;
  deliveryMode: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  enrollmentStatus: "not_open" | "open" | "closed";
  feeLines: CourseFeeLineInput[];
  feePaise: number;
  enrolled: boolean;
};

/** A course's read-only details for a student: the course itself (prose, exams,
 * syllabus) plus the batches open for enrolment at their college. */
export type StudentCourseWithBatches = {
  courseId: string;
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  exams: StudentCourseExam[];
  syllabus: StudentSyllabusSubject[];
  batches: StudentCourseBatch[];
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

// A batch's college-scoping + open-status share the same shape across the two
// student reads below; kept as a small helper to avoid drift.
async function openBatchIdsForStudentCollege(
  supabase: SupabaseClient,
  studentId: string
): Promise<string[] | null> {
  const { data: sp } = await supabase
    .from("student_profile")
    .select("college_id")
    .eq("user_id", studentId)
    .maybeSingle();
  const collegeId = (sp as { college_id?: string | null } | null)?.college_id;
  if (!collegeId) return null;
  const { data: bc } = await supabase.from("batch_college").select("batch_id").eq("college_id", collegeId);
  const ids = ((bc ?? []) as { batch_id: string }[]).map((x) => x.batch_id);
  return ids;
}

// Flat (exam, subject, chapter) syllabus rows → subjects with a de-duped chapter
// list (a subject shared by two exams appears once, union of chapters).
function groupSyllabus(
  rows: { subject_id: string; subject_name: string; subject_sort: number; chapter_id: string | null; chapter_name: string | null }[]
): StudentSyllabusSubject[] {
  const bySubject = new Map<string, { name: string; sort: number; chapters: Map<string, string> }>();
  for (const r of rows) {
    const entry = bySubject.get(r.subject_id) ?? { name: r.subject_name, sort: r.subject_sort, chapters: new Map() };
    if (r.chapter_id && r.chapter_name) entry.chapters.set(r.chapter_id, r.chapter_name);
    bySubject.set(r.subject_id, entry);
  }
  return [...bySubject.entries()]
    .sort((a, b) => a[1].sort - b[1].sort || a[1].name.localeCompare(b[1].name))
    .map(([subjectId, v]) => ({ subjectId, name: v.name, chapters: [...v.chapters.values()] }));
}

/** The courses a student may enrol into: one card per COURSE that has an
 * open/running batch at their college, with a fee range, batch count, exam
 * codes, and syllabus size. RLS scopes every read to the catalog + their own
 * enrolments. Batches are NOT surfaced here — they live on the details page. */
export async function fetchOpenCoursesForStudent(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudentCourseCard[]> {
  const batchIds = await openBatchIdsForStudentCollege(supabase, studentId);
  if (!batchIds || batchIds.length === 0) return [];

  const { data: batches, error } = await supabase
    .from("batch")
    .select("id, course_id, status, fee_component(amount_paise)")
    .in("id", batchIds)
    .in("status", ["open", "running"]);
  if (error) throw new Error(`batch: ${error.message}`);
  const batchRows = (batches ?? []) as unknown as {
    id: string; course_id: string; fee_component: { amount_paise: number }[];
  }[];
  if (batchRows.length === 0) return [];

  const openBatchIds = batchRows.map((b) => b.id);
  const { data: enr } = await supabase
    .from("student_enrollment")
    .select("batch_id")
    .eq("student_id", studentId)
    .in("batch_id", openBatchIds)
    .neq("status", "cancelled");
  const enrolledBatch = new Set(((enr ?? []) as { batch_id: string }[]).map((x) => x.batch_id));

  // Roll batches up to their course.
  type Agg = { batchCount: number; feeFrom: number; feeTo: number; enrolled: boolean };
  const byCourse = new Map<string, Agg>();
  for (const b of batchRows) {
    const fee = (b.fee_component ?? []).reduce((s, f) => s + f.amount_paise, 0);
    const a = byCourse.get(b.course_id) ?? { batchCount: 0, feeFrom: Infinity, feeTo: 0, enrolled: false };
    a.batchCount += 1;
    a.feeFrom = Math.min(a.feeFrom, fee);
    a.feeTo = Math.max(a.feeTo, fee);
    if (enrolledBatch.has(b.id)) a.enrolled = true;
    byCourse.set(b.course_id, a);
  }
  const courseIds = [...byCourse.keys()];

  // Course rows + the exam codes each targets, and syllabus-size counts derived
  // from the (authenticated-readable) exam↔subject / exam↔chapter link tables.
  const [{ data: courses, error: cErr }, { data: subs }, { data: chs }] = await Promise.all([
    supabase
      .from("course")
      .select("id, slug, name, category, description, course_competitive_exam(competitive_exam:competitive_exam_id(id, code))")
      .in("id", courseIds),
    supabase.from("competitive_exam_subject").select("competitive_exam_id, subject_id"),
    supabase.from("competitive_exam_subject_chapter").select("competitive_exam_id, chapter_id"),
  ]);
  if (cErr) throw new Error(`course: ${cErr.message}`);

  const courseRows = (courses ?? []) as unknown as {
    id: string; slug: string; name: string; category: string | null; description: string | null;
    course_competitive_exam: { competitive_exam: { id: string; code: string } | null }[];
  }[];

  // exam → subjects / chapters, so a course's syllabus size = union over its exams.
  const subjOfExam = new Map<string, Set<string>>();
  for (const r of (subs ?? []) as { competitive_exam_id: string; subject_id: string }[]) {
    (subjOfExam.get(r.competitive_exam_id) ?? subjOfExam.set(r.competitive_exam_id, new Set()).get(r.competitive_exam_id)!).add(r.subject_id);
  }
  const chapOfExam = new Map<string, Set<string>>();
  for (const r of (chs ?? []) as { competitive_exam_id: string; chapter_id: string }[]) {
    (chapOfExam.get(r.competitive_exam_id) ?? chapOfExam.set(r.competitive_exam_id, new Set()).get(r.competitive_exam_id)!).add(r.chapter_id);
  }

  return courseRows
    .map((c) => {
      const agg = byCourse.get(c.id)!;
      const exams = c.course_competitive_exam.map((t) => t.competitive_exam).filter(Boolean) as { id: string; code: string }[];
      const subjectSet = new Set<string>();
      const chapterSet = new Set<string>();
      for (const ex of exams) {
        subjOfExam.get(ex.id)?.forEach((s) => subjectSet.add(s));
        chapOfExam.get(ex.id)?.forEach((ch) => chapterSet.add(ch));
      }
      return {
        courseId: c.id,
        slug: c.slug,
        name: c.name,
        category: c.category,
        description: c.description,
        examCodes: exams.map((e) => e.code),
        subjectCount: subjectSet.size,
        chapterCount: chapterSet.size,
        batchCount: agg.batchCount,
        feeFromPaise: agg.feeFrom === Infinity ? 0 : agg.feeFrom,
        feeToPaise: agg.feeTo,
        enrolled: agg.enrolled,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A course's full details for a student: prose + competitive exams + inherited
 * syllabus, plus the batches open for enrolment at their college (each with its
 * own fee + enrolment state). RLS scopes the catalog reads; syllabus names come
 * from the course_syllabus RPC (migration 138, SECURITY DEFINER). */
export async function fetchStudentCourseWithBatches(
  supabase: SupabaseClient,
  courseId: string,
  studentId: string
): Promise<StudentCourseWithBatches | null> {
  const { data: course, error: cErr } = await supabase
    .from("course")
    .select(
      "id, slug, name, category, description, " +
        "course_competitive_exam(competitive_exam:competitive_exam_id(id, code, name, description))"
    )
    .eq("id", courseId)
    .maybeSingle();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  if (!course) return null;
  const c = course as unknown as {
    id: string; slug: string; name: string; category: string | null; description: string | null;
    course_competitive_exam: { competitive_exam: StudentCourseExam | null }[];
  };

  const collegeBatchIds = await openBatchIdsForStudentCollege(supabase, studentId);

  const [{ data: syl, error: sylErr }, batchesRes] = await Promise.all([
    supabase.rpc("course_syllabus", { p_course_id: courseId }),
    collegeBatchIds && collegeBatchIds.length
      ? supabase
          .from("batch")
          .select("id, name, academic_year, delivery_mode, start_date, end_date, status, enrollment_status, fee_component(label, amount_paise, sort_order)")
          .eq("course_id", courseId)
          .in("id", collegeBatchIds)
          .in("status", ["open", "running"])
          .order("start_date", { ascending: true, nullsFirst: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sylErr) throw new Error(`course_syllabus: ${sylErr.message}`);
  if (batchesRes.error) throw new Error(`batch: ${batchesRes.error.message}`);

  const batchRows = (batchesRes.data ?? []) as unknown as {
    id: string; name: string; academic_year: string | null; delivery_mode: string | null;
    start_date: string | null; end_date: string | null; status: string; enrollment_status: string | null;
    fee_component: { label: string; amount_paise: number; sort_order: number }[];
  }[];

  // Which of these batches the student is already in (non-cancelled).
  let enrolledBatch = new Set<string>();
  if (batchRows.length) {
    const { data: enr } = await supabase
      .from("student_enrollment")
      .select("batch_id")
      .eq("student_id", studentId)
      .in("batch_id", batchRows.map((b) => b.id))
      .neq("status", "cancelled");
    enrolledBatch = new Set(((enr ?? []) as { batch_id: string }[]).map((x) => x.batch_id));
  }

  const batches: StudentCourseBatch[] = batchRows.map((b) => {
    const feeLines = [...(b.fee_component ?? [])]
      .sort((a, z) => a.sort_order - z.sort_order)
      .map((f) => ({ label: f.label, amountPaise: f.amount_paise }));
    return {
      batchId: b.id,
      name: b.name,
      academicYear: b.academic_year,
      deliveryMode: b.delivery_mode,
      startDate: b.start_date,
      endDate: b.end_date,
      status: b.status,
      enrollmentStatus: (b.enrollment_status ?? "not_open") as StudentCourseBatch["enrollmentStatus"],
      feeLines,
      feePaise: feeLines.reduce((s, f) => s + f.amountPaise, 0),
      enrolled: enrolledBatch.has(b.id),
    };
  });

  return {
    courseId: c.id,
    slug: c.slug,
    name: c.name,
    category: c.category,
    description: c.description,
    exams: c.course_competitive_exam.map((t) => t.competitive_exam).filter((e): e is StudentCourseExam => Boolean(e)),
    syllabus: groupSyllabus(
      (syl ?? []) as { subject_id: string; subject_name: string; subject_sort: number; chapter_id: string | null; chapter_name: string | null }[]
    ),
    batches,
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
