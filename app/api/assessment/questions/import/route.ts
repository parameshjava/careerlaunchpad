/**
 * Bulk assessment-question import (migration 144). Mirrors the exam question
 * import but for the assessment bank: no passages, kinds limited to standard /
 * data_sufficiency. One subject per file; nothing is written until commit, and
 * commit is all-or-nothing (duplicates are skipped, not blocking).
 *
 *   POST body { subject_id, commit, overrides?, data }
 *     commit=false -> dry-run: returns a per-question validated report
 *     commit=true  -> only if the report has zero blocking issues; inserts via
 *                     the import_assessment_questions() RPC (single transaction).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { validateQuestionFields } from "@/lib/exam-validation";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, on the raw file JSON
const norm = (s: string) => s.trim().toLowerCase();

// Sentinel subject_id for "All subjects" mode: instead of one subject per file,
// each question names its own `subject` + `chapter` and we resolve/insert across
// every subject. Kept in lockstep with the client (import-client.tsx).
const ALL = "__all__";

type FileQuestion = Record<string, unknown>;
type RowStatus = "ok" | "error" | "duplicate" | "unresolved";
type ReportRow = {
  row: number;
  subject?: string; // populated in "all subjects" mode (per-question subject)
  chapter: string;
  stem: string;
  difficulty: string;
  status: RowStatus;
  messages: string[];
};

export async function POST(req: NextRequest) {
  try {
    await requirePermission("exam.question.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    subject_id?: string;
    commit?: boolean;
    overrides?: Record<string, string>;
    data?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
  const isAll = subjectId === ALL;
  const commit = body.commit === true;
  const overrides = (body.overrides ?? {}) as Record<string, string>;
  const data = body.data;

  if (!subjectId) return NextResponse.json({ error: "subject_id: required" }, { status: 422 });

  // 1) File-size guard — raw byte length of the uploaded JSON.
  if (Buffer.byteLength(JSON.stringify(data ?? null), "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 2 MB limit." }, { status: 413 });
  }

  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "data: expected a JSON object." }, { status: 422 });
  }
  const file = data as Record<string, unknown>;
  const fileQuestions = Array.isArray(file.questions) ? (file.questions as FileQuestion[]) : null;
  if (!fileQuestions || fileQuestions.length === 0) {
    return NextResponse.json({ error: "data.questions: a non-empty array is required." }, { status: 422 });
  }

  const supabase = await createClient();

  // 2) Resolve the working set of subjects + chapters. Two modes:
  //  • single-subject — the file targets one subject (its `subject` must match);
  //  • all-subjects (subject_id = "__all__") — each question names its OWN
  //    subject + chapter, so we load every subject and every chapter and resolve
  //    per (subject, chapter) since chapter names aren't unique across subjects.
  const chapterByKey = new Map<string, string>(); // `${subjectId}::${normChapter}` -> chapterId
  const subjectIdByName = new Map<string, string>(); // normSubject -> subjectId (all mode)
  let selectedSubjectName = "";
  let chapters: { id: string; name: string }[] = []; // the single subject's chapters (single mode)

  if (isAll) {
    const { data: subjectRows } = await supabase.from("subject").select("id, name");
    for (const s of (subjectRows ?? []) as { id: string; name: string }[])
      subjectIdByName.set(norm(s.name), s.id);
    // Every chapter across all subjects, paging past the 1000-row cap.
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("chapter")
        .select("id, name, subject_id")
        .range(from, from + 999);
      const batch = (data ?? []) as { id: string; name: string; subject_id: string }[];
      for (const c of batch) chapterByKey.set(`${c.subject_id}::${norm(c.name)}`, c.id);
      if (batch.length < 1000) break;
    }
  } else {
    const { data: subject } = await supabase
      .from("subject")
      .select("id, name")
      .eq("id", subjectId)
      .maybeSingle();
    if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    selectedSubjectName = subject.name as string;
    const fileSubject = typeof file.subject === "string" ? file.subject : "";
    if (norm(fileSubject) !== norm(selectedSubjectName)) {
      return NextResponse.json(
        { error: `File subject "${fileSubject}" does not match the selected subject "${selectedSubjectName}".` },
        { status: 422 },
      );
    }
    const { data: chapterRows } = await supabase
      .from("chapter")
      .select("id, name")
      .eq("subject_id", subjectId);
    chapters = (chapterRows ?? []) as { id: string; name: string }[];
    for (const c of chapters) chapterByKey.set(`${subjectId}::${norm(c.name)}`, c.id);
  }

  const overrideByName = new Map(Object.entries(overrides).map(([k, v]) => [norm(k), v]));

  // 3) Preload existing stems to skip duplicates. Keyed by chapter_id::stem —
  // which already encodes the subject. Single mode scopes to the subject; all
  // mode loads the whole bank (still keyed the same way).
  const bankKey = new Set<string>();
  for (let from = 0; ; from += 1000) {
    let query = supabase.from("assessment_question").select("chapter_id, stem").range(from, from + 999);
    if (!isAll) query = query.eq("subject_id", subjectId);
    const { data } = await query;
    const batch = (data ?? []) as { chapter_id: string; stem: string }[];
    for (const r of batch) bankKey.add(`${r.chapter_id}::${norm(r.stem)}`);
    if (batch.length < 1000) break;
  }

  const fileErrors: string[] = [];
  const rows: ReportRow[] = [];
  const unresolved = new Map<string, number>();
  const seenInFile = new Set<string>();
  const resolved: Record<string, unknown>[] = [];

  fileQuestions.forEach((q, i) => {
    const messages: string[] = [];
    const chapterName = typeof q.chapter === "string" ? q.chapter.trim() : "";
    const stem = typeof q.stem === "string" ? q.stem : "";
    const difficulty = typeof q.difficulty === "string" ? q.difficulty : "";
    let status: RowStatus = "ok";

    // Shared DB-free field checks.
    const { errors: fieldErrors, fields } = validateQuestionFields(q);
    messages.push(...fieldErrors);

    // Assessment bank: no passages (Q10). Flag passage-kind AND a stray passage_ref
    // so silently-dropped data is reported rather than swallowed.
    if (fields && fields.kind === "passage")
      messages.push("kind: passage-based questions are not supported in assessments");
    if (q.passage_ref != null && String(q.passage_ref).trim() !== "")
      messages.push("passage_ref: not supported for assessment questions.");

    // Resolve this question's subject. Single mode: the selected subject. All
    // mode: each question names its own `subject` (chapters aren't unique across
    // subjects, so we must know the subject before resolving the chapter).
    let qSubjectId = subjectId;
    let qSubjectName = selectedSubjectName;
    if (isAll) {
      qSubjectName = typeof q.subject === "string" ? q.subject.trim() : "";
      if (!qSubjectName) {
        messages.push("subject: required");
        qSubjectId = "";
      } else {
        qSubjectId = subjectIdByName.get(norm(qSubjectName)) ?? "";
        if (!qSubjectId) messages.push(`Subject "${qSubjectName}" not found.`);
      }
    }

    // Resolve chapter within that subject (name → override; overrides only apply
    // in single-subject mode, where the target subject is unambiguous).
    const chapterId =
      (qSubjectId ? chapterByKey.get(`${qSubjectId}::${norm(chapterName)}`) : undefined) ??
      (isAll ? undefined : overrideByName.get(norm(chapterName)));
    if (!chapterName) messages.push("chapter: required");
    else if (qSubjectId && !chapterId) {
      if (isAll) {
        messages.push(`Chapter "${chapterName}" not found in subject "${qSubjectName}".`);
      } else {
        unresolved.set(chapterName, (unresolved.get(chapterName) ?? 0) + 1);
        messages.push(`Chapter "${chapterName}" not found in this subject.`);
        status = "unresolved";
      }
    }

    // Duplicate (chapter, stem) vs the bank and within the file — skipped, not an error.
    if (chapterId && stem && status === "ok") {
      const key = `${chapterId}::${norm(stem)}`;
      if (bankKey.has(key)) {
        messages.push("Already in the bank — will be skipped.");
        status = "duplicate";
      } else if (seenInFile.has(key)) {
        messages.push("Duplicate of another row in this file — will be skipped.");
        status = "duplicate";
      }
      seenInFile.add(key);
    }

    if (status === "ok" && messages.length) status = "error";
    rows.push({
      row: i + 1,
      subject: isAll ? qSubjectName || "—" : undefined,
      chapter: chapterName || "—",
      stem: stem.slice(0, 160),
      difficulty,
      status,
      messages,
    });

    if (status === "ok" && fields && chapterId && qSubjectId) {
      resolved.push({
        subject_id: qSubjectId,
        chapter_id: chapterId,
        kind: fields.kind,
        difficulty: fields.difficulty,
        answer_type: fields.answer_type,
        stem: fields.stem,
        stem_image_url: fields.stem_image_url,
        explanation: fields.explanation,
        source: fields.source,
        source_year: fields.source_year,
        options: fields.options,
      });
    }
  });

  const errorCount = rows.filter((r) => r.status === "error" || r.status === "unresolved").length;
  const duplicateCount = rows.filter((r) => r.status === "duplicate").length;
  const blocking = errorCount + fileErrors.length;

  const report = {
    ok: false,
    total: rows.length,
    valid: rows.filter((r) => r.status === "ok").length,
    errorCount,
    duplicateCount,
    skipped: duplicateCount,
    fileErrors,
    unresolved_chapters: [...unresolved.entries()].map(([name, count]) => ({ name, count })),
    chapters: chapters.map((c) => ({ id: c.id, name: c.name })),
    rows,
  };

  if (!commit) return NextResponse.json(report);

  if (blocking > 0) {
    return NextResponse.json({ ...report, error: "Fix every error before importing." }, { status: 422 });
  }

  // Group resolved rows by subject and import each subject's batch via the RPC
  // (which takes one subject). Single mode → exactly one group. Idempotent:
  // duplicates are skipped, so a partial failure is safe to re-run.
  const bySubject = new Map<string, Record<string, unknown>[]>();
  for (const r of resolved) {
    const { subject_id, ...rest } = r as { subject_id: string } & Record<string, unknown>;
    const list = bySubject.get(subject_id) ?? [];
    list.push(rest);
    bySubject.set(subject_id, list);
  }

  let insertedTotal = 0;
  for (const [sid, qs] of bySubject) {
    const { data: inserted, error } = await supabase.rpc("import_assessment_questions", {
      p_subject_id: sid,
      p_questions: qs,
    });
    if (error) return NextResponse.json({ ...report, ok: false, error: error.message }, { status: 500 });
    insertedTotal += (inserted as number) ?? 0;
  }

  return NextResponse.json({ ...report, ok: true, inserted: insertedTotal });
}
