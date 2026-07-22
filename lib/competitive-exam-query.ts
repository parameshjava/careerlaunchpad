// Typed data-access for competitive exams (issue #49). A competitive exam (ICET, MAT,
// Bank PO…) is a first-class entity that OWNS a syllabus — subjects + the
// chapters in scope, reusing the shared `subject`/`chapter` taxonomy. Courses
// reference exams and inherit their syllabi. Schema in 125_fees.sql.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompetitiveExamListRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  subjectCount: number;
  chapterCount: number;
  courseCount: number;
};

export type CompetitiveExamDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  subjects: { subjectId: string; chapterIds: string[] }[];
};

/** An exam's syllabus with names, for read-only display (e.g. the course editor). */
export type CompetitiveExamSyllabus = {
  id: string;
  code: string;
  name: string;
  subjects: { subjectId: string; name: string; chapters: { id: string; name: string }[] }[];
};

export async function fetchCompetitiveExams(supabase: SupabaseClient): Promise<CompetitiveExamListRow[]> {
  // No PostgREST embeds here: the counts come from separate queries tallied in
  // JS. This is deliberately embed-free so it can't hit "ambiguous relationship"
  // errors (competitive_exam_subject_chapter references two tables).
  const { data: exams, error } = await supabase
    .from("competitive_exam")
    .select("id, code, name, is_active, sort_order")
    .order("sort_order");
  if (error) throw new Error(`competitive_exam: ${error.message}`);
  const examRows = (exams ?? []) as { id: string; code: string; name: string; is_active: boolean }[];
  if (examRows.length === 0) return [];

  const [subjRes, chapRes, courseRes] = await Promise.all([
    supabase.from("competitive_exam_subject").select("competitive_exam_id"),
    supabase.from("competitive_exam_subject_chapter").select("competitive_exam_id"),
    supabase.from("course_competitive_exam").select("competitive_exam_id"),
  ]);
  if (subjRes.error) throw new Error(`competitive_exam_subject: ${subjRes.error.message}`);
  if (chapRes.error) throw new Error(`competitive_exam_subject_chapter: ${chapRes.error.message}`);
  if (courseRes.error) throw new Error(`course_competitive_exam: ${courseRes.error.message}`);

  const tally = (rows: { competitive_exam_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.competitive_exam_id, (m.get(r.competitive_exam_id) ?? 0) + 1);
    return m;
  };
  const subjectCounts = tally((subjRes.data ?? []) as { competitive_exam_id: string }[]);
  const chapterCounts = tally((chapRes.data ?? []) as { competitive_exam_id: string }[]);
  const courseCounts = tally((courseRes.data ?? []) as { competitive_exam_id: string }[]);

  return examRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isActive: r.is_active,
    subjectCount: subjectCounts.get(r.id) ?? 0,
    chapterCount: chapterCounts.get(r.id) ?? 0,
    courseCount: courseCounts.get(r.id) ?? 0,
  }));
}

export async function fetchCompetitiveExam(
  supabase: SupabaseClient,
  id: string
): Promise<CompetitiveExamDetail | null> {
  // Embed-free (see fetchCompetitiveExams): base row + subjects + chapters as
  // three separate queries, assembled in JS.
  const { data, error } = await supabase
    .from("competitive_exam")
    .select("id, code, name, description, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`competitive_exam: ${error.message}`);
  if (!data) return null;

  const [{ data: subjRows, error: se }, { data: chRows, error: chErr }] = await Promise.all([
    supabase
      .from("competitive_exam_subject")
      .select("subject_id, sort_order")
      .eq("competitive_exam_id", id),
    supabase
      .from("competitive_exam_subject_chapter")
      .select("subject_id, chapter_id")
      .eq("competitive_exam_id", id),
  ]);
  if (se) throw new Error(`competitive_exam_subject: ${se.message}`);
  if (chErr) throw new Error(`competitive_exam_subject_chapter: ${chErr.message}`);

  const row = data as unknown as {
    id: string; code: string; name: string; description: string | null; is_active: boolean;
  };
  const subjects = (subjRows ?? []) as { subject_id: string; sort_order: number }[];
  const bySubject = new Map<string, string[]>();
  for (const c of (chRows ?? []) as { subject_id: string; chapter_id: string }[]) {
    const list = bySubject.get(c.subject_id) ?? [];
    list.push(c.chapter_id);
    bySubject.set(c.subject_id, list);
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    subjects: [...subjects]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ subjectId: s.subject_id, chapterIds: bySubject.get(s.subject_id) ?? [] })),
  };
}

/** Every active exam with its syllabus resolved to subject/chapter NAMES — used
 * to preview the inherited syllabus in the course editor. */
export async function fetchCompetitiveExamsWithSyllabus(
  supabase: SupabaseClient
): Promise<CompetitiveExamSyllabus[]> {
  const { data: exams, error: ee } = await supabase
    .from("competitive_exam")
    .select("id, code, name, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (ee) throw new Error(`competitive_exam: ${ee.message}`);
  const examRows = (exams ?? []) as { id: string; code: string; name: string }[];
  if (examRows.length === 0) return [];

  const [{ data: tes, error: e1 }, { data: tesc, error: e2 }] = await Promise.all([
    supabase.from("competitive_exam_subject").select("competitive_exam_id, subject_id, sort_order"),
    supabase.from("competitive_exam_subject_chapter").select("competitive_exam_id, subject_id, chapter_id"),
  ]);
  if (e1) throw new Error(`competitive_exam_subject: ${e1.message}`);
  if (e2) throw new Error(`competitive_exam_subject_chapter: ${e2.message}`);
  const tesRows = (tes ?? []) as { competitive_exam_id: string; subject_id: string; sort_order: number }[];
  const tescRows = (tesc ?? []) as { competitive_exam_id: string; subject_id: string; chapter_id: string }[];

  // Resolve the subject + chapter names referenced by any exam.
  const subjectIds = [...new Set(tesRows.map((r) => r.subject_id))];
  const chapterIds = [...new Set(tescRows.map((r) => r.chapter_id))];
  const [{ data: subs }, { data: chs }] = await Promise.all([
    subjectIds.length
      ? supabase.from("subject").select("id, name").in("id", subjectIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    chapterIds.length
      ? supabase.from("chapter").select("id, name").in("id", chapterIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const subjectName = new Map((subs ?? []).map((s) => [s.id as string, s.name as string]));
  const chapterName = new Map((chs ?? []).map((c) => [c.id as string, c.name as string]));

  return examRows.map((exam) => {
    const subjects = tesRows
      .filter((r) => r.competitive_exam_id === exam.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({
        subjectId: r.subject_id,
        name: subjectName.get(r.subject_id) ?? "Subject",
        chapters: tescRows
          .filter((c) => c.competitive_exam_id === exam.id && c.subject_id === r.subject_id)
          .map((c) => ({ id: c.chapter_id, name: chapterName.get(c.chapter_id) ?? "Chapter" })),
      }));
    return { id: exam.id, code: exam.code, name: exam.name, subjects };
  });
}
