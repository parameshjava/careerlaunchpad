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
  /** Provenance (migration 145): the paper/test the question appeared in. */
  source: string | null;
  sourceYear: number | null;
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

// Map chapter ids → names. `question`/`exam_section_chapter`/`assessment_question`
// reference `chapter` via a COMPOSITE foreign key (chapter_id, subject_id), which
// PostgREST can't embed by `chapter_id` alone, so we resolve names with a plain
// lookup instead. Shared with the assessment bank (lib/assessment-query.ts).
export async function chapterNameMap(
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

export type ChapterCounts = Record<
  string,
  { easy: number; medium: number; hard: number; very_hard: number }
>;

/** Active-question counts per chapter, split by difficulty (migration 097). */
export async function fetchChapterCounts(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<ChapterCounts> {
  const { data, error } = await supabase.rpc("chapter_question_counts", {
    p_subject_ids: [subjectId],
  });
  if (error) throw new Error(`chapter_question_counts: ${error.message}`);
  const out: ChapterCounts = {};
  for (const r of (data ?? []) as { chapter_id: string; difficulty: string; n: number }[]) {
    const c = (out[r.chapter_id] ??= { easy: 0, medium: 0, hard: 0, very_hard: 0 });
    if (r.difficulty in c) c[r.difficulty as keyof typeof c] = Number(r.n);
  }
  return out;
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
  offset?: number;
};

export async function fetchQuestions(
  supabase: SupabaseClient,
  filters: QuestionFilters = {},
): Promise<{ questions: QuestionListItem[]; total: number }> {
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  let q = supabase
    .from("question")
    .select(
      "id, subject_id, chapter_id, kind, difficulty, answer_type, stem, status, version, source, source_year",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (filters.subjectId) q = q.eq("subject_id", filters.subjectId);
  if (filters.chapterId) q = q.eq("chapter_id", filters.chapterId);
  if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
  if (!filters.includeArchived) q = q.eq("status", "active");
  const { data, error, count } = await q;
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

  const questions = rows.map((r) => {
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
      source: (r.source as string | null) ?? null,
      sourceYear: (r.source_year as number | null) ?? null,
      options,
    };
  });
  return { questions, total: count ?? questions.length };
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
  /** Wizard resume point (migration 094). 1-based; 1 = start. */
  draftStep: number;
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

// A row for the "Exam papers" list: an exam (blueprint) joined to its sitting,
// so DRAFTS (no sitting yet) also appear — they were previously invisible
// because that list only queried sessions.
export type ExamCard = {
  id: string;
  title: string;
  collegeName: string | null;
  examStatus: BlueprintStatus; // draft | published | archived
  durationMinutes: number;
  sectionCount: number;
  totalQuestions: number;
  draftStep: number;
  createdAt: string;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  opensAt: string | null;
  closesAt: string | null;
  /** ALL sittings' statuses (not just the newest) — drives Open/Closed tabs. */
  sessionCount: number;
  sessionStatuses: SessionStatus[];
  /** Whether the newest sitting's results are visible to students. */
  resultsPublished: boolean;
  /** Student attempts across all sittings — 0 means the exam is safe to delete. */
  attemptCount: number;
};

export async function fetchExamCards(
  supabase: SupabaseClient,
  collegeId?: string,
): Promise<ExamCard[]> {
  let q = supabase
    .from("exam")
    .select(
      "id, title, duration_minutes, status, draft_step, created_at, college:college_id(name), " +
        "exam_section(num_questions), exam_session(id, status, opens_at, closes_at, results_published, created_at, exam_attempt(count))",
    )
    .order("created_at", { ascending: false });
  if (collegeId) {
    // A college's papers are exams it owns OR exams conducting a sitting there —
    // centrally created exams have a different/null college_id, so filtering on
    // exam.college_id alone hides them from college admins.
    const { data: sess, error: sessErr } = await supabase
      .from("exam_session")
      .select("exam_id")
      .eq("college_id", collegeId);
    if (sessErr) throw new Error(`exam_session: ${sessErr.message}`);
    const ids = [...new Set((sess ?? []).map((r) => r.exam_id as string))];
    q = ids.length
      ? q.or(`college_id.eq.${collegeId},id.in.(${ids.join(",")})`)
      : q.eq("college_id", collegeId);
  }
  const { data, error } = await q;
  if (error) throw new Error(`exam: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const sections = (r.exam_section as { num_questions: number }[] | null) ?? [];
    const rawSessions = (r.exam_session as Record<string, unknown>[] | null) ?? [];
    // The wizard owns one sitting per exam; if several exist take the newest.
    const sess = rawSessions
      .slice()
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
    return {
      id: r.id as string,
      title: r.title as string,
      collegeName: one<{ name: string | null }>(r.college as never)?.name ?? null,
      examStatus: r.status as BlueprintStatus,
      durationMinutes: r.duration_minutes as number,
      sectionCount: sections.length,
      totalQuestions: sections.reduce((s, x) => s + (x.num_questions ?? 0), 0),
      draftStep: (r.draft_step as number) ?? 1,
      createdAt: (r.created_at as string) ?? "",
      sessionId: (sess?.id as string) ?? null,
      sessionStatus: (sess?.status as SessionStatus) ?? null,
      opensAt: (sess?.opens_at as string | null) ?? null,
      closesAt: (sess?.closes_at as string | null) ?? null,
      sessionCount: rawSessions.length,
      sessionStatuses: rawSessions.map((s) => s.status as SessionStatus),
      resultsPublished: (sess?.results_published as boolean) ?? false,
      attemptCount: rawSessions.reduce(
        (n, s) => n + Number((s.exam_attempt as { count: number }[] | null)?.[0]?.count ?? 0),
        0,
      ),
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
      "id, title, duration_minutes, generation_strategy, shuffle_questions, shuffle_options, negative_mark_per_wrong, status, draft_step, " +
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
    draftStep: (row.draft_step as number) ?? 1,
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
  collegeName?: string | null;
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
  rollNumber: string | null;
  rosterStatus: "invited" | "started" | "submitted";
  attemptId: string | null;
  attemptStatus: "in_progress" | "submitted" | "graded" | "aborted" | null;
  score: number | null;
  leaveCount: number;
  abortCount: number;
  resumeCount: number;
  lastPosition: number | null;
  startedAt: string | null;
  submittedAt: string | null;
};

function mapSessionRow(r: Record<string, unknown>): SessionSummary {
  const paper = one<{ id: string; exam_paper_question: { count: number }[] }>(r.exam_paper as never);
  const rosterAgg = (r.exam_session_student as { count: number }[] | null) ?? [];
  const exam = one<{ title: string | null; duration_minutes: number | null }>(r.exam as never);
  return {
    id: r.id as string,
    examId: r.exam_id as string,
    examTitle: exam?.title ?? null,
    collegeName: one<{ name: string | null }>(r.college as never)?.name ?? null,
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
  "college:college_id(name), " +
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
      ? supabase.from("student_profile").select("user_id, full_name, roll_number").in("user_id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.from("exam_attempt").select("id, student_id, status, score, leave_count, abort_count, resume_count, last_position, started_at, submitted_at").eq("session_id", sessionId),
  ]);
  const emailById = new Map<string, string | null>(
    (accounts.data ?? []).map((a) => [a.id as string, (a.email as string | null) ?? null]),
  );
  const nameById = new Map<string, string | null>(
    (profiles.data ?? []).map((p) => [p.user_id as string, (p.full_name as string | null) ?? null]),
  );
  const rollById = new Map<string, string | null>(
    (profiles.data ?? []).map((p) => [p.user_id as string, (p.roll_number as string | null) ?? null]),
  );
  const byStudent = new Map<string, { attemptId: string; status: string; score: number | null; leaveCount: number; abortCount: number; resumeCount: number; lastPosition: number | null; startedAt: string | null; submittedAt: string | null }>(
    (attempts.data ?? []).map((a) => [a.student_id as string, {
      attemptId: a.id as string,
      status: a.status as string,
      score: a.score as number | null,
      leaveCount: (a.leave_count as number) ?? 0,
      abortCount: (a.abort_count as number) ?? 0,
      resumeCount: (a.resume_count as number) ?? 0,
      lastPosition: (a.last_position as number | null) ?? null,
      startedAt: (a.started_at as string | null) ?? null,
      submittedAt: (a.submitted_at as string | null) ?? null,
    }]),
  );

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const sid = r.student_id as string;
    const attempt = byStudent.get(sid);
    return {
      studentId: sid,
      name: nameById.get(sid) ?? null,
      email: emailById.get(sid) ?? null,
      rollNumber: rollById.get(sid) ?? null,
      rosterStatus: r.status as RosterEntry["rosterStatus"],
      attemptId: attempt?.attemptId ?? null,
      attemptStatus: (attempt?.status as RosterEntry["attemptStatus"]) ?? null,
      score: attempt?.score ?? null,
      leaveCount: attempt?.leaveCount ?? 0,
      abortCount: attempt?.abortCount ?? 0,
      resumeCount: attempt?.resumeCount ?? 0,
      lastPosition: attempt?.lastPosition ?? null,
      startedAt: attempt?.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? null,
    };
  });
}

// ----------------------------------------------------------------------------
// Live monitoring board (issue #78) — per student, per section: attempted /
// marked-for-review / correct, computed LIVE while the sitting runs (no grading
// needed). "Attempted" and "correct" derive from exam_attempt_question
// .selected_option_ids (written live by save_exam_answer) vs. question_option
// .is_correct; "marked" from exam_attempt_question.marked_for_review (migration
// 151). Correctness uses the SAME exact-set-match rule as _grade_attempts (022),
// so live counts and final grades agree. All reads are RLS-bounded to callers
// with exam.results.view_all for the sitting's college.
// ----------------------------------------------------------------------------

// Per (student, section) aggregates from the exam_session_progress RPC (migration
// 152). The RPC does the counting in SQL and returns only these ~(students ×
// sections) rows, so we never pull the raw exam_attempt_question rows to the
// client (which would exceed PostgREST's 1000-row cap and undercount) — see the
// migration for the exact-match rule, which mirrors the grader.
type ProgressRow = {
  student_id: string;
  section_id: string;
  attempted: number;
  marked: number;
  correct: number;
  awarded: number;
};

async function fetchProgressRows(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ProgressRow[]> {
  const { data, error } = await supabase.rpc("exam_session_progress", { p_session_id: sessionId });
  if (error) throw new Error(`exam_session_progress: ${error.message}`);
  return (data ?? []) as ProgressRow[];
}

// A sitting's ordered sections with the metadata every results/monitoring view
// needs (subject, position, and the fixed per-section counts). Small — one row
// per section — so a plain read is fine.
type SectionMeta = {
  sectionId: string;
  subject: string;
  position: number;
  numQuestions: number;
  marksPerQuestion: number;
};

async function fetchSessionSectionMeta(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SectionMeta[]> {
  const { data: sess } = await supabase
    .from("exam_session")
    .select("exam_id")
    .eq("id", sessionId)
    .maybeSingle();
  const examId = (sess?.exam_id as string | undefined) ?? null;
  if (!examId) return [];
  const { data } = await supabase
    .from("exam_section")
    .select("id, position, num_questions, marks_per_question, subject:subject_id(name)")
    .eq("exam_id", examId)
    .order("position");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
    sectionId: s.id as string,
    subject: one<{ name: string | null }>(s.subject as never)?.name ?? "—",
    position: s.position as number,
    numQuestions: (s.num_questions as number) ?? 0,
    marksPerQuestion: Number(s.marks_per_question ?? 0),
  }));
}

export type LiveSectionColumn = { sectionId: string; subject: string; position: number; total: number };

export type LiveSectionCell = { total: number; attempted: number; marked: number; correct: number };

export type LiveStudentRow = {
  studentId: string;
  name: string | null;
  email: string | null;
  rollNumber: string | null;
  rosterStatus: RosterEntry["rosterStatus"];
  attemptId: string | null;
  attemptStatus: RosterEntry["attemptStatus"];
  resumeCount: number;
  /** Proctoring signals: times the student left the exam window / was auto-aborted. */
  leaveCount: number;
  abortCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  /** Keyed by sectionId → this student's counts for that section. */
  perSection: Record<string, LiveSectionCell>;
  totalQuestions: number;
  totalAttempted: number;
  totalMarked: number;
  totalCorrect: number;
};

export type SessionLiveProgress = {
  sections: LiveSectionColumn[];
  students: LiveStudentRow[];
};

export async function fetchSessionLiveProgress(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionLiveProgress> {
  // Ordered section columns (subject + total questions) — the table's header.
  const sectionMeta = await fetchSessionSectionMeta(supabase, sessionId);
  if (sectionMeta.length === 0) return { sections: [], students: [] };
  const sections: LiveSectionColumn[] = sectionMeta.map((s) => ({
    sectionId: s.sectionId,
    subject: s.subject,
    position: s.position,
    total: s.numQuestions,
  }));
  const sectionTotals = new Map(sections.map((s) => [s.sectionId, s.total]));
  const totalQuestions = sections.reduce((n, s) => n + s.total, 0);

  // Roster + identity (student_profile has two FKs to app_user → plain lookups).
  const { data: rosterRows } = await supabase
    .from("exam_session_student")
    .select("student_id, status")
    .eq("session_id", sessionId);
  const studentIds = (rosterRows ?? []).map((r) => r.student_id as string);

  const [accounts, profiles, attempts, progressRows] = await Promise.all([
    studentIds.length
      ? supabase.from("app_user").select("id, email").in("id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    studentIds.length
      ? supabase.from("student_profile").select("user_id, full_name, roll_number").in("user_id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase
      .from("exam_attempt")
      .select("id, student_id, status, resume_count, leave_count, abort_count, started_at, submitted_at")
      .eq("session_id", sessionId),
    fetchProgressRows(supabase, sessionId),
  ]);
  const emailById = new Map<string, string | null>(
    (accounts.data ?? []).map((a) => [a.id as string, (a.email as string | null) ?? null]),
  );
  const nameById = new Map<string, string | null>(
    (profiles.data ?? []).map((p) => [p.user_id as string, (p.full_name as string | null) ?? null]),
  );
  const rollById = new Map<string, string | null>(
    (profiles.data ?? []).map((p) => [p.user_id as string, (p.roll_number as string | null) ?? null]),
  );
  type AttemptMeta = {
    id: string;
    status: RosterEntry["attemptStatus"];
    resumeCount: number;
    leaveCount: number;
    abortCount: number;
    startedAt: string | null;
    submittedAt: string | null;
  };
  const attemptByStudent = new Map<string, AttemptMeta>(
    (attempts.data ?? []).map((a) => [
      a.student_id as string,
      {
        id: a.id as string,
        status: a.status as RosterEntry["attemptStatus"],
        resumeCount: (a.resume_count as number) ?? 0,
        leaveCount: (a.leave_count as number) ?? 0,
        abortCount: (a.abort_count as number) ?? 0,
        startedAt: (a.started_at as string | null) ?? null,
        submittedAt: (a.submitted_at as string | null) ?? null,
      },
    ]),
  );
  // Per-student, per-section counts come pre-aggregated from the RPC: attempted /
  // marked / correct are computed in SQL (correct via the grader's exact-set-match
  // rule), so no raw answer rows cross the wire and there's no 1000-row cap to hit.
  const cellsByStudent = new Map<string, Record<string, LiveSectionCell>>();
  for (const r of progressRows) {
    const bucket = cellsByStudent.get(r.student_id) ?? cellsByStudent.set(r.student_id, {}).get(r.student_id)!;
    bucket[r.section_id] = {
      total: sectionTotals.get(r.section_id) ?? 0,
      attempted: Number(r.attempted),
      marked: Number(r.marked),
      correct: Number(r.correct),
    };
  }

  const students: LiveStudentRow[] = studentIds.map((sid) => {
    const attempt = attemptByStudent.get(sid);
    const perSection: Record<string, LiveSectionCell> = {};
    for (const s of sections) {
      const c = cellsByStudent.get(sid)?.[s.sectionId];
      perSection[s.sectionId] = c ?? { total: s.total, attempted: 0, marked: 0, correct: 0 };
    }
    const totalAttempted = Object.values(perSection).reduce((n, c) => n + c.attempted, 0);
    const totalMarked = Object.values(perSection).reduce((n, c) => n + c.marked, 0);
    const totalCorrect = Object.values(perSection).reduce((n, c) => n + c.correct, 0);
    const roster = (rosterRows ?? []).find((r) => r.student_id === sid);
    return {
      studentId: sid,
      name: nameById.get(sid) ?? null,
      email: emailById.get(sid) ?? null,
      rollNumber: rollById.get(sid) ?? null,
      rosterStatus: (roster?.status as RosterEntry["rosterStatus"]) ?? "invited",
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      resumeCount: attempt?.resumeCount ?? 0,
      leaveCount: attempt?.leaveCount ?? 0,
      abortCount: attempt?.abortCount ?? 0,
      startedAt: attempt?.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? null,
      perSection,
      totalQuestions,
      totalAttempted,
      totalMarked,
      totalCorrect,
    };
  });
  // Stable order → stable SNO. Roll number first (natural roster order), then name.
  students.sort((a, b) => {
    const ra = a.rollNumber ?? "";
    const rb = b.rollNumber ?? "";
    if (ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true });
    return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
  });

  return { sections, students };
}

// Per-subject average score across a sitting's graded attempts (admin results
// chart). `max` is the section's full marks so the chart can show avg vs. total.
export type SubjectAvg = { subject: string; avg: number; max: number };

export async function fetchSubjectAverages(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SubjectAvg[]> {
  // Only graded attempts count toward the average.
  const { data: gradedAtt, error: aErr } = await supabase
    .from("exam_attempt")
    .select("student_id")
    .eq("session_id", sessionId)
    .eq("status", "graded");
  if (aErr) throw new Error(`exam_attempt: ${aErr.message}`);
  const gradedStudents = new Set((gradedAtt ?? []).map((a) => a.student_id as string));
  if (gradedStudents.size === 0) return [];

  // Awarded marks are pre-summed per (student, section) in SQL by the RPC; the
  // section columns/maxes come from the (small) section-meta read. No raw
  // attempt_question rows are pulled to the client.
  const [sectionMeta, progressRows] = await Promise.all([
    fetchSessionSectionMeta(supabase, sessionId),
    fetchProgressRows(supabase, sessionId),
  ]);
  const sectionSubject = new Map(sectionMeta.map((m) => [m.sectionId, m]));

  type Acc = { subject: string; position: number; sum: number; max: number };
  const bySubject = new Map<string, Acc>();
  // Seed each subject's full marks from the blueprint (a subject can span sections).
  for (const m of sectionMeta) {
    const acc = bySubject.get(m.subject) ?? { subject: m.subject, position: m.position, sum: 0, max: 0 };
    acc.max += m.numQuestions * m.marksPerQuestion;
    acc.position = Math.min(acc.position, m.position);
    bySubject.set(m.subject, acc);
  }
  // Sum awarded marks over graded students only.
  for (const r of progressRows) {
    if (!gradedStudents.has(r.student_id)) continue;
    const m = sectionSubject.get(r.section_id);
    if (!m) continue;
    bySubject.get(m.subject)!.sum += Number(r.awarded);
  }
  return Array.from(bySubject.values())
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      subject: s.subject,
      avg: Math.round((s.sum / gradedStudents.size) * 100) / 100,
      max: s.max,
    }));
}

// Per-student, per-subject marks for a sitting — the subject-wise breakdown on
// the printed Statement of Results. `subjects` are the ordered columns (section
// order) with each subject's full marks; `byStudent` maps studentId -> {subject:
// awarded marks}. Returned as plain objects so it serializes server -> client.
export type SubjectColumn = { subject: string; max: number };
export type StudentSubjectMarks = {
  subjects: SubjectColumn[];
  byStudent: Record<string, Record<string, number>>;
};

export async function fetchSubjectMarksByStudent(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<StudentSubjectMarks> {
  // Awarded marks are pre-summed per (student, section) in SQL by the RPC; the
  // subject columns/maxes come from the (small) section-meta read. No raw
  // attempt_question rows are pulled to the client.
  const [sectionMeta, progressRows] = await Promise.all([
    fetchSessionSectionMeta(supabase, sessionId),
    fetchProgressRows(supabase, sessionId),
  ]);
  if (!sectionMeta.length) return { subjects: [], byStudent: {} };
  const sectionSubject = new Map(sectionMeta.map((m) => [m.sectionId, m.subject]));

  // Sum a student's per-section awarded marks up to their subject totals.
  const byStudent: Record<string, Record<string, number>> = {};
  for (const r of progressRows) {
    const subject = sectionSubject.get(r.section_id);
    if (!subject) continue;
    const rec = (byStudent[r.student_id] ??= {});
    rec[subject] = (rec[subject] ?? 0) + Number(r.awarded);
  }

  // Aggregate section maxes into subject columns (a subject can span sections).
  const subjAgg = new Map<string, { max: number; position: number }>();
  for (const m of sectionMeta) {
    const secMax = m.numQuestions * m.marksPerQuestion;
    const cur = subjAgg.get(m.subject);
    if (cur) { cur.max += secMax; cur.position = Math.min(cur.position, m.position); }
    else subjAgg.set(m.subject, { max: secMax, position: m.position });
  }
  const subjects = Array.from(subjAgg.entries())
    .sort((a, b) => a[1].position - b[1].position)
    .map(([subject, v]) => ({ subject, max: v.max }));

  return { subjects, byStudent };
}

// ----------------------------------------------------------------------------
// Result-email delivery state (issue #77) — the counts the session console shows
// beside the publish button, from exam_result_notification (migration 157).
// ----------------------------------------------------------------------------

export type ResultNotificationSummary = {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  /** Eligible students with no email address on their account — not sendable. */
  skipped: number;
  lastSentAt: string | null;
};

/**
 * Never throws: this is a status strip, and a sitting whose emails have never
 * been queued legitimately has no rows. A failure here must not take down the
 * session console.
 */
export async function fetchResultNotificationSummary(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ResultNotificationSummary | null> {
  const { data, error } = await supabase.rpc("exam_result_notification_summary", {
    p_session_id: sessionId,
  });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  const n = (k: string) => Number(d[k] ?? 0) || 0;
  const total = n("total");
  if (total === 0) return null;
  return {
    total,
    pending: n("pending"),
    sent: n("sent"),
    failed: n("failed"),
    skipped: n("skipped"),
    lastSentAt: (d.last_sent_at as string | null) ?? null,
  };
}

// ----------------------------------------------------------------------------
// Student-facing "my exams" list lives in the list_my_exam_sessions() RPC
// (migration 102) — students can't read the exam/exam_section tables directly.
// ----------------------------------------------------------------------------

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
  const questions: PrintQuestion[] = [];
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    // The embedded question can be null when the caller lacks bank-read rights
    // (question RLS is admin-only). Skip rather than crash the page.
    const q = one<Record<string, unknown>>(r.question as never);
    if (!q) continue;
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
    questions.push({
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
    });
  }

  return { questions, totalMarks };
}

export async function fetchQuestionFull(
  supabase: SupabaseClient,
  id: string,
): Promise<QuestionFull | null> {
  const { data, error } = await supabase
    .from("question")
    .select(
      "id, subject_id, chapter_id, passage_id, kind, difficulty, answer_type, stem, stem_image_url, explanation, status, version, source, source_year, question_option(id, label, is_correct, position)",
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
    source: (data.source as string | null) ?? null,
    sourceYear: (data.source_year as number | null) ?? null,
    options,
  };
}
