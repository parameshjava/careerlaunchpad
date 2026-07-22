// Server-only helpers for writing a competitive exam and its syllabus rows
// (subjects + per-subject chapters). Shared by the create/update API routes.
// Non-transactional (same approach as course-write): create rolls back the exam
// row on child failure; update deletes-then-reinserts the syllabus.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompetitiveExamPayload = {
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  subjects: { subjectId: string; chapterIds: string[] }[];
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function parseCompetitiveExamPayload(
  body: unknown
): { ok: true; value: CompetitiveExamPayload } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const code = (str(b.code) ?? "").toUpperCase();
  if (!code) return { ok: false, error: "A short code is required (e.g. ICET)." };

  const name = str(b.name);
  if (!name) return { ok: false, error: "A name is required." };

  const subjectsIn = Array.isArray(b.subjects) ? b.subjects : [];
  const subjects: CompetitiveExamPayload["subjects"] = [];
  for (const s of subjectsIn) {
    const sid = str((s as Record<string, unknown>)?.subjectId);
    if (!sid) return { ok: false, error: "Each syllabus subject needs a subjectId." };
    const raw = (s as Record<string, unknown>)?.chapterIds;
    const chapterIds = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    subjects.push({ subjectId: sid, chapterIds });
  }

  return {
    ok: true,
    value: {
      code,
      name,
      description: str(b.description),
      isActive: b.isActive === undefined ? true : Boolean(b.isActive),
      subjects,
    },
  };
}

export async function writeCompetitiveExamSyllabus(
  supabase: SupabaseClient,
  examId: string,
  subjects: CompetitiveExamPayload["subjects"]
): Promise<{ error?: string }> {
  if (!subjects.length) return {};
  const subjectRows = subjects.map((s, i) => ({
    competitive_exam_id: examId,
    subject_id: s.subjectId,
    sort_order: i,
  }));
  const { error } = await supabase.from("competitive_exam_subject").insert(subjectRows);
  if (error) return { error: `subjects: ${error.message}` };

  const chapterRows = subjects.flatMap((s) =>
    s.chapterIds.map((chapterId) => ({
      competitive_exam_id: examId,
      subject_id: s.subjectId,
      chapter_id: chapterId,
    }))
  );
  if (chapterRows.length) {
    const { error: ce } = await supabase.from("competitive_exam_subject_chapter").insert(chapterRows);
    if (ce) return { error: `chapters: ${ce.message}` };
  }
  return {};
}

export async function deleteCompetitiveExamSyllabus(
  supabase: SupabaseClient,
  examId: string
): Promise<{ error?: string }> {
  for (const table of ["competitive_exam_subject_chapter", "competitive_exam_subject"]) {
    const { error } = await supabase.from(table).delete().eq("competitive_exam_id", examId);
    if (error) return { error: `${table}: ${error.message}` };
  }
  return {};
}
