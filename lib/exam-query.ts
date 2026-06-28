// Typed data-access for the exam module (docs/EXAM_MODULE_SPEC.md). Pattern
// mirrors lib/students-query.ts: each function takes a SupabaseClient and returns
// typed rows. All reads are bounded by the RLS in migration 021 — an unauthorized
// caller (or one outside their college scope) simply gets an empty list. This file
// grows per build phase; authoring reads (subjects/chapters/passages/questions)
// land first.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Difficulty = "easy" | "medium" | "hard" | "very_hard";
export type QuestionKind = "standard" | "passage" | "data_sufficiency";
export type AnswerType = "single" | "multi";
export type ActiveStatus = "active" | "archived";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "very_hard"];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  very_hard: "Very hard",
};

export type Subject = { id: string; name: string; status: ActiveStatus };
export type Chapter = { id: string; subjectId: string; name: string };
export type Passage = { id: string; subjectId: string; title: string | null; body: string };

export type QuestionOption = { id: string; label: string; isCorrect: boolean; position: number };

export type QuestionListItem = {
  id: string;
  subjectId: string;
  chapterId: string;
  chapterName: string | null;
  kind: QuestionKind;
  difficulty: Difficulty;
  answerType: AnswerType;
  stem: string;
  status: ActiveStatus;
  version: number;
  /** Options in order, with the correct one(s) flagged — for inline answer display. */
  options: { label: string; isCorrect: boolean }[];
};

export type QuestionFull = QuestionListItem & {
  passageId: string | null;
  stemImageUrl: string | null;
  explanation: string | null;
  options: QuestionOption[];
};

// Supabase types a to-one embed as a possible array; normalize to a single row.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// Map chapter ids → names. `question`/`exam_section_chapter` reference `chapter`
// via a COMPOSITE foreign key (chapter_id, subject_id), which PostgREST can't
// embed by `chapter_id` alone, so we resolve names with a plain lookup instead.
async function chapterNameMap(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const { data } = await supabase.from("chapter").select("id, name").in("id", uniq);
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
}

// Subjects are global/common (migration 025) — not scoped to a college.
export async function fetchSubjects(
  supabase: SupabaseClient,
  opts: { includeArchived?: boolean } = {},
): Promise<Subject[]> {
  let q = supabase.from("subject").select("id, name, status").order("name");
  if (!opts.includeArchived) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(`subject: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    status: r.status as ActiveStatus,
  }));
}

export async function fetchChapters(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from("chapter")
    .select("id, subject_id, name")
    .eq("subject_id", subjectId)
    .order("name");
  if (error) throw new Error(`chapter: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    subjectId: r.subject_id as string,
    name: r.name as string,
  }));
}

export async function fetchPassages(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<Passage[]> {
  const { data, error } = await supabase
    .from("passage")
    .select("id, subject_id, title, body")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`passage: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    subjectId: r.subject_id as string,
    title: (r.title as string | null) ?? null,
    body: r.body as string,
  }));
}

export type QuestionFilters = {
  subjectId?: string;
  chapterId?: string;
  difficulty?: Difficulty;
  includeArchived?: boolean;
  limit?: number;
};

export async function fetchQuestions(
  supabase: SupabaseClient,
  filters: QuestionFilters = {},
): Promise<QuestionListItem[]> {
  let q = supabase
    .from("question")
    .select(
      "id, subject_id, chapter_id, kind, difficulty, answer_type, stem, status, version",
    )
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.subjectId) q = q.eq("subject_id", filters.subjectId);
  if (filters.chapterId) q = q.eq("chapter_id", filters.chapterId);
  if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
  if (!filters.includeArchived) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(`question: ${error.message}`);
  const rows = data ?? [];
  const names = await chapterNameMap(supabase, rows.map((r) => r.chapter_id as string));

  // Options for all listed questions in one query (for inline answer display).
  const optsByQ = new Map<string, { label: string; isCorrect: boolean; position: number }[]>();
  if (rows.length > 0) {
    const { data: opts } = await supabase
      .from("question_option")
      .select("question_id, label, is_correct, position")
      .in("question_id", rows.map((r) => r.id as string));
    for (const o of opts ?? []) {
      const key = o.question_id as string;
      (optsByQ.get(key) ?? optsByQ.set(key, []).get(key)!).push({
        label: o.label as string,
        isCorrect: o.is_correct as boolean,
        position: o.position as number,
      });
    }
  }

  return rows.map((r) => {
    const options = (optsByQ.get(r.id as string) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ label: o.label, isCorrect: o.isCorrect }));
    return {
      id: r.id as string,
      subjectId: r.subject_id as string,
      chapterId: r.chapter_id as string,
      chapterName: names.get(r.chapter_id as string) ?? null,
      kind: r.kind as QuestionKind,
      difficulty: r.difficulty as Difficulty,
      answerType: r.answer_type as AnswerType,
      stem: r.stem as string,
      status: r.status as ActiveStatus,
      version: r.version as number,
      options,
    };
  });
}

// ----------------------------------------------------------------------------
// Blueprints
// ----------------------------------------------------------------------------

export type BlueprintStatus = "draft" | "published" | "archived";

export type ChapterQuota = { chapterId: string; chapterName?: string | null; pct: number };

export type BlueprintSection = {
  id: string;
  subjectId: string;
  subjectName?: string | null;
  numQuestions: number;
  marksPerQuestion: number;
  pctEasy: number;
  pctMedium: number;
  pctHard: number;
  pctVeryHard: number;
  position: number;
  chapterQuota: ChapterQuota[];
};

export type Blueprint = {
  id: string;
  title: string;
  durationMinutes: number;
  generationStrategy: "fixed" | "per_student";
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarkPerWrong: number;
  status: BlueprintStatus;
  sections: BlueprintSection[];
};

export type BlueprintListItem = {
  id: string;
  title: string;
  durationMinutes: number;
  status: BlueprintStatus;
  sectionCount: number;
  totalQuestions: number;
};

export async function fetchBlueprints(supabase: SupabaseClient): Promise<BlueprintListItem[]> {
  const { data, error } = await supabase
    .from("exam")
    .select("id, title, duration_minutes, status, exam_section(num_questions)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`exam: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const sections = (r.exam_section as { num_questions: number }[] | null) ?? [];
    return {
      id: r.id as string,
      title: r.title as string,
      durationMinutes: r.duration_minutes as number,
      status: r.status as BlueprintStatus,
      sectionCount: sections.length,
      totalQuestions: sections.reduce((sum, s) => sum + (s.num_questions ?? 0), 0),
    };
  });
}

export async function fetchBlueprint(
  supabase: SupabaseClient,
  id: string,
): Promise<Blueprint | null> {
  const { data, error } = await supabase
    .from("exam")
    .select(
      "id, title, duration_minutes, generation_strategy, shuffle_questions, shuffle_options, negative_mark_per_wrong, status, " +
        "exam_section(id, subject_id, num_questions, marks_per_question, pct_easy, pct_medium, pct_hard, pct_very_hard, position, subject:subject_id(name), exam_section_chapter(chapter_id, pct))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`exam: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;

  const rawSections = (row.exam_section as Record<string, unknown>[] | null) ?? [];
  // Resolve quota chapter names via a plain lookup (composite FK — see chapterNameMap).
  const chNames = await chapterNameMap(
    supabase,
    rawSections.flatMap((s) =>
      ((s.exam_section_chapter as Record<string, unknown>[]) ?? []).map((q) => q.chapter_id as string),
    ),
  );
  const sections: BlueprintSection[] = rawSections
    .map((s) => {
      const subj = one<{ name: string | null }>(s.subject as never);
      const quotas = ((s.exam_section_chapter as Record<string, unknown>[]) ?? []).map((q) => {
        return {
          chapterId: q.chapter_id as string,
          chapterName: chNames.get(q.chapter_id as string) ?? null,
          pct: q.pct as number,
        };
      });
      return {
        id: s.id as string,
        subjectId: s.subject_id as string,
        subjectName: subj?.name ?? null,
        numQuestions: s.num_questions as number,
        marksPerQuestion: Number(s.marks_per_question),
        pctEasy: s.pct_easy as number,
        pctMedium: s.pct_medium as number,
        pctHard: s.pct_hard as number,
        pctVeryHard: s.pct_very_hard as number,
        position: s.position as number,
        chapterQuota: quotas,
      };
    })
    .sort((a, b) => a.position - b.position);

  return {
    id: row.id as string,
    title: row.title as string,
    durationMinutes: row.duration_minutes as number,
    generationStrategy: row.generation_strategy as "fixed" | "per_student",
    shuffleQuestions: row.shuffle_questions as boolean,
    shuffleOptions: row.shuffle_options as boolean,
    negativeMarkPerWrong: Number(row.negative_mark_per_wrong),
    status: row.status as BlueprintStatus,
    sections,
  };
}

// ----------------------------------------------------------------------------
// Sessions (a conduct event of a blueprint) + roster
// ----------------------------------------------------------------------------

export type SessionStatus = "scheduled" | "open" | "closed" | "graded";
export type SessionMode = "online" | "offline";

export type SessionSummary = {
  id: string;
  examId: string;
  examTitle?: string | null;
  durationMinutes?: number | null;
  label: string;
  mode: SessionMode;
  opensAt: string | null;
  closesAt: string | null;
  status: SessionStatus;
  resultsPublished: boolean;
  paperId: string | null;
  questionCount: number;
  rosterCount: number;
};

export type RosterEntry = {
  studentId: string;
  name: string | null;
  email: string | null;
  rosterStatus: "invited" | "started" | "submitted";
  attemptStatus: "in_progress" | "submitted" | "graded" | null;
  score: number | null;
};

function mapSessionRow(r: Record<string, unknown>): SessionSummary {
  const paper = one<{ id: string; exam_paper_question: { count: number }[] }>(r.exam_paper as never);
  const rosterAgg = (r.exam_session_student as { count: number }[] | null) ?? [];
  const exam = one<{ title: string | null; duration_minutes: number | null }>(r.exam as never);
  return {
    id: r.id as string,
    examId: r.exam_id as string,
    examTitle: exam?.title ?? null,
    durationMinutes: exam?.duration_minutes ?? null,
    label: r.label as string,
    mode: r.mode as SessionMode,
    opensAt: (r.opens_at as string | null) ?? null,
    closesAt: (r.closes_at as string | null) ?? null,
    status: r.status as SessionStatus,
    resultsPublished: r.results_published as boolean,
    paperId: paper?.id ?? null,
    questionCount: paper?.exam_paper_question?.[0]?.count ?? 0,
    rosterCount: rosterAgg[0]?.count ?? 0,
  };
}

const SESSION_SELECT =
  "id, exam_id, label, mode, opens_at, closes_at, status, results_published, " +
  "exam:exam_id(title, duration_minutes), exam_paper(id, exam_paper_question(count)), exam_session_student(count)";

export async function fetchSessions(
  supabase: SupabaseClient,
  examId: string,
): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from("exam_session")
    .select(SESSION_SELECT)
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`exam_session: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapSessionRow);
}

// Exams the caller is assigned to evaluate (exam_staff), each with its sittings.
// RLS: exam_staff self-read, exam + exam_session staff-read (021/024).
export type EvaluatorSitting = { id: string; label: string; status: SessionStatus; mode: SessionMode };
export type EvaluatorExam = { examId: string; title: string; sittings: EvaluatorSitting[] };

export async function fetchEvaluatorExams(
  supabase: SupabaseClient,
  userId: string,
): Promise<EvaluatorExam[]> {
  const { data, error } = await supabase
    .from("exam_staff")
    .select("exam:exam_id(id, title, exam_session(id, label, status, mode))")
    .eq("user_id", userId);
  if (error) throw new Error(`exam_staff: ${error.message}`);

  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => {
      const e = one<Record<string, unknown>>(r.exam as never);
      if (!e) return null;
      const sittings = ((e.exam_session as Record<string, unknown>[]) ?? []).map((s) => ({
        id: s.id as string,
        label: s.label as string,
        status: s.status as SessionStatus,
        mode: s.mode as SessionMode,
      }));
      return { examId: e.id as string, title: e.title as string, sittings } as EvaluatorExam;
    })
    .filter((x): x is EvaluatorExam => x !== null);
}

// All exams (with sittings) — for blanket evaluators (mentors/employers holding
// exam.evaluate) and admins, who evaluate across every exam. RLS bounds the rows.
export async function fetchAllEvaluatorExams(supabase: SupabaseClient): Promise<EvaluatorExam[]> {
  const { data, error } = await supabase
    .from("exam")
    .select("id, title, exam_session(id, label, status, mode)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`exam: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((e) => ({
    examId: e.id as string,
    title: e.title as string,
    sittings: ((e.exam_session as Record<string, unknown>[]) ?? []).map((s) => ({
      id: s.id as string,
      label: s.label as string,
      status: s.status as SessionStatus,
      mode: s.mode as SessionMode,
    })),
  }));
}

// All sittings visible to the caller, optionally scoped to one college. Used by
// the College Admin "sittings" list (RLS already bounds them to their college);
// pass collegeId to filter explicitly.
export async function fetchCollegeSessions(
  supabase: SupabaseClient,
  collegeId?: string,
): Promise<SessionSummary[]> {
  let q = supabase.from("exam_session").select(SESSION_SELECT).order("created_at", { ascending: false });
  if (collegeId) q = q.eq("college_id", collegeId);
  const { data, error } = await q;
  if (error) throw new Error(`exam_session: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapSessionRow);
}

export async function fetchSession(
  supabase: SupabaseClient,
  id: string,
): Promise<SessionSummary | null> {
  const { data, error } = await supabase
    .from("exam_session")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`exam_session: ${error.message}`);
  if (!data) return null;
  return mapSessionRow(data as unknown as Record<string, unknown>);
}

export async function fetchRoster(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<RosterEntry[]> {
  // student_id FKs to app_user (email). NOTE: student_profile has TWO FKs to
  // app_user (user_id and reviewed_by), so we can't embed it via app_user
  // unambiguously — fetch names/emails with plain lookups instead.
  const { data, error } = await supabase
    .from("exam_session_student")
    .select("student_id, status")
    .eq("session_id", sessionId);
  if (error) throw new Error(`exam_session_student: ${error.message}`);

  const studentIds = (data ?? []).map((r) => r.student_id as string);

  // Emails (app_user) + names (student_profile.user_id) + attempts, by student.
  const [accounts, profiles, attempts] = await Promise.all([
    studentIds.length
      ? supabase.from("app_user").select("id, email").in("id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    studentIds.length
      ? supabase.from("student_profile").select("user_id, full_name").in("user_id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.from("exam_attempt").select("student_id, status, score").eq("session_id", sessionId),
  ]);
  const emailById = new Map<string, string | null>(
    (accounts.data ?? []).map((a) => [a.id as string, (a.email as string | null) ?? null]),
  );
  const nameById = new Map<string, string | null>(
    (profiles.data ?? []).map((p) => [p.user_id as string, (p.full_name as string | null) ?? null]),
  );
  const byStudent = new Map<string, { status: string; score: number | null }>(
    (attempts.data ?? []).map((a) => [a.student_id as string, { status: a.status as string, score: a.score as number | null }]),
  );

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const sid = r.student_id as string;
    const attempt = byStudent.get(sid);
    return {
      studentId: sid,
      name: nameById.get(sid) ?? null,
      email: emailById.get(sid) ?? null,
      rosterStatus: r.status as RosterEntry["rosterStatus"],
      attemptStatus: (attempt?.status as RosterEntry["attemptStatus"]) ?? null,
      score: attempt?.score ?? null,
    };
  });
}

// ----------------------------------------------------------------------------
// Student-facing: my assigned sittings + my result
// ----------------------------------------------------------------------------

export type StudentSession = {
  sessionId: string;
  label: string;
  sessionStatus: SessionStatus;
  opensAt: string | null;
  closesAt: string | null;
  resultsPublished: boolean;
  // Drives the student list. Derived from the roster row only — students no
  // longer read exam_attempt directly (that would leak score before publish;
  // see migration 023). "submitted" means the attempt is done; the score is
  // revealed only via get_exam_result() once results are published.
  rosterStatus: "invited" | "started" | "submitted";
};

// A student can read their roster rows + the sessions they're on (RLS in 021/023),
// but NOT the exam table — so we surface the session label, not the exam title.
export async function fetchStudentSessions(
  supabase: SupabaseClient,
  studentId: string,
): Promise<StudentSession[]> {
  const { data, error } = await supabase
    .from("exam_session_student")
    .select("status, session:session_id(id, label, status, opens_at, closes_at, results_published)")
    .eq("student_id", studentId);
  if (error) throw new Error(`exam_session_student: ${error.message}`);

  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => {
      const s = one<Record<string, unknown>>(r.session as never);
      if (!s) return null;
      return {
        sessionId: s.id as string,
        label: s.label as string,
        sessionStatus: s.status as SessionStatus,
        opensAt: (s.opens_at as string | null) ?? null,
        closesAt: (s.closes_at as string | null) ?? null,
        resultsPublished: s.results_published as boolean,
        rosterStatus: r.status as StudentSession["rosterStatus"],
      } as StudentSession;
    })
    .filter((x): x is StudentSession => x !== null);
}

// ----------------------------------------------------------------------------
// Print / PDF (offline conduct) — the full hydrated paper incl. the answer key
// ----------------------------------------------------------------------------

export type PrintOption = { label: string; isCorrect: boolean; position: number };
export type PrintQuestion = {
  position: number;
  stem: string;
  stemImageUrl: string | null;
  kind: QuestionKind;
  answerType: AnswerType;
  difficulty: Difficulty;
  marks: number;
  passageId: string | null;
  passageTitle: string | null;
  passageBody: string | null;
  options: PrintOption[];
};
export type PrintPaper = {
  questions: PrintQuestion[];
  totalMarks: number;
};

export async function fetchPaperForPrint(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<PrintPaper | null> {
  const { data: paper } = await supabase
    .from("exam_paper")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!paper) return null;

  const { data, error } = await supabase
    .from("exam_paper_question")
    .select(
      "position, section:section_id(marks_per_question), " +
        "question:question_id(stem, stem_image_url, kind, answer_type, difficulty, passage_id, " +
        "passage:passage_id(title, body), question_option(label, is_correct, position))",
    )
    .eq("paper_id", paper.id)
    .order("position");
  if (error) throw new Error(`exam_paper_question: ${error.message}`);

  let totalMarks = 0;
  const questions: PrintQuestion[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const q = one<Record<string, unknown>>(r.question as never)!;
    const section = one<{ marks_per_question: number }>(r.section as never);
    const passage = one<{ title: string | null; body: string }>(q.passage as never);
    const marks = Number(section?.marks_per_question ?? 1);
    totalMarks += marks;
    const options = ((q.question_option as Record<string, unknown>[]) ?? [])
      .map((o) => ({
        label: o.label as string,
        isCorrect: o.is_correct as boolean,
        position: o.position as number,
      }))
      .sort((a, b) => a.position - b.position);
    return {
      position: r.position as number,
      stem: q.stem as string,
      stemImageUrl: (q.stem_image_url as string | null) ?? null,
      kind: q.kind as QuestionKind,
      answerType: q.answer_type as AnswerType,
      difficulty: q.difficulty as Difficulty,
      marks,
      passageId: (q.passage_id as string | null) ?? null,
      passageTitle: passage?.title ?? null,
      passageBody: passage?.body ?? null,
      options,
    };
  });

  return { questions, totalMarks };
}

export async function fetchQuestionFull(
  supabase: SupabaseClient,
  id: string,
): Promise<QuestionFull | null> {
  const { data, error } = await supabase
    .from("question")
    .select(
      "id, subject_id, chapter_id, passage_id, kind, difficulty, answer_type, stem, stem_image_url, explanation, status, version, question_option(id, label, is_correct, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`question: ${error.message}`);
  if (!data) return null;
  const names = await chapterNameMap(supabase, [data.chapter_id as string]);
  const chapter = { name: names.get(data.chapter_id as string) ?? null };
  const options = ((data.question_option as unknown[]) ?? [])
    .map((o) => {
      const opt = o as { id: string; label: string; is_correct: boolean; position: number };
      return {
        id: opt.id,
        label: opt.label,
        isCorrect: opt.is_correct,
        position: opt.position,
      };
    })
    .sort((a, b) => a.position - b.position);
  return {
    id: data.id as string,
    subjectId: data.subject_id as string,
    chapterId: data.chapter_id as string,
    chapterName: chapter?.name ?? null,
    passageId: (data.passage_id as string | null) ?? null,
    kind: data.kind as QuestionKind,
    difficulty: data.difficulty as Difficulty,
    answerType: data.answer_type as AnswerType,
    stem: data.stem as string,
    stemImageUrl: (data.stem_image_url as string | null) ?? null,
    explanation: (data.explanation as string | null) ?? null,
    status: data.status as ActiveStatus,
    version: data.version as number,
    options,
  };
}
