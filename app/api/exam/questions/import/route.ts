/**
 * Bulk question import (docs/superpowers/specs/2026-07-12-admin-question-bulk-
 * import-design.md). Admin-only. One subject per file; nothing is written until
 * commit, and commit is all-or-nothing.
 *
 *   POST body { subject_id, commit, overrides?, data }
 *     commit=false -> dry-run: returns a per-question validated report
 *     commit=true  -> only if the report has zero blocking issues; inserts via
 *                     the import_questions() RPC (single transaction).
 *
 * Report: { ok, total, valid, errorCount, duplicateCount, fileErrors[],
 *           unresolved_chapters:[{name,count}], chapters:[{id,name}],
 *           rows:[{row, chapter, stem, difficulty, status, messages}], inserted? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { validateQuestionFields } from "@/lib/exam-validation";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, on the raw file JSON
const norm = (s: string) => s.trim().toLowerCase();

type FileQuestion = Record<string, unknown>;
type RowStatus = "ok" | "error" | "duplicate" | "unresolved";
type ReportRow = {
  row: number;
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
  const filePassages = Array.isArray(file.passages) ? (file.passages as Record<string, unknown>[]) : [];

  const supabase = await createClient();

  // 2) Subject must exist and the file's subject must match the selected one.
  const { data: subject } = await supabase
    .from("subject")
    .select("id, name")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  const fileSubject = typeof file.subject === "string" ? file.subject : "";
  if (norm(fileSubject) !== norm(subject.name as string)) {
    return NextResponse.json(
      { error: `File subject "${fileSubject}" does not match the selected subject "${subject.name}".` },
      { status: 422 },
    );
  }

  // 3) Preload the subject's chapters (name→id) and ALL existing stems.
  const { data: chapterRows } = await supabase
    .from("chapter")
    .select("id, name")
    .eq("subject_id", subjectId);
  const chapters = (chapterRows ?? []) as { id: string; name: string }[];
  const chapterByName = new Map(chapters.map((c) => [norm(c.name), c.id]));
  const overrideByName = new Map(Object.entries(overrides).map(([k, v]) => [norm(k), v]));

  // Fetch every existing stem for the subject, paging past Supabase's 1000-row
  // cap — otherwise a subject with >1000 questions (e.g. Arithmetic) would leave
  // some bank duplicates undetected in the dry-run and only fail at commit.
  const bankKey = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("question")
      .select("chapter_id, stem")
      .eq("subject_id", subjectId)
      .range(from, from + 999);
    const batch = (data ?? []) as { chapter_id: string; stem: string }[];
    for (const r of batch) bankKey.add(`${r.chapter_id}::${norm(r.stem)}`);
    if (batch.length < 1000) break;
  }

  // Passage structural checks (blocking) + the set of valid refs.
  const fileErrors: string[] = [];
  const passageRefs = new Set<string>();
  for (const p of filePassages) {
    const ref = String(p.ref ?? "").trim();
    const pbody = typeof p.body === "string" ? p.body.trim() : "";
    if (!ref) fileErrors.push("A passage is missing its 'ref'.");
    else if (passageRefs.has(ref)) fileErrors.push(`Duplicate passage ref "${ref}".`);
    else passageRefs.add(ref);
    if (!pbody) fileErrors.push(`Passage "${ref || "?"}" is missing 'body'.`);
  }

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

    // Resolve chapter by name → override.
    const chapterId = chapterByName.get(norm(chapterName)) ?? overrideByName.get(norm(chapterName));
    if (!chapterName) messages.push("chapter: required");
    else if (!chapterId) {
      unresolved.set(chapterName, (unresolved.get(chapterName) ?? 0) + 1);
      messages.push(`Chapter "${chapterName}" not found in this subject.`);
      status = "unresolved";
    }

    // passage_ref rules.
    const kind = typeof q.kind === "string" ? q.kind : "standard";
    const passageRef = q.passage_ref == null ? "" : String(q.passage_ref);
    if (kind === "passage") {
      if (!passageRef) messages.push("passage_ref: required for a passage question.");
      else if (!passageRefs.has(passageRef)) messages.push(`passage_ref "${passageRef}" not found in passages.`);
    } else if (passageRef) {
      messages.push("passage_ref: only allowed on passage questions.");
    }

    // Duplicate (chapter, stem) vs the bank and within the file. Duplicates are
    // NOT errors — they are simply skipped on import (so a file that partially
    // overlaps the bank still imports its new questions).
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
    rows.push({ row: i + 1, chapter: chapterName || "—", stem: stem.slice(0, 160), difficulty, status, messages });

    if (status === "ok" && fields && chapterId) {
      resolved.push({
        chapter_id: chapterId,
        passage_ref: kind === "passage" ? passageRef : null,
        kind: fields.kind,
        difficulty: fields.difficulty,
        answer_type: fields.answer_type,
        stem: fields.stem,
        stem_image_url: fields.stem_image_url,
        explanation: fields.explanation,
        options: fields.options,
      });
    }
  });

  const errorCount = rows.filter((r) => r.status === "error" || r.status === "unresolved").length;
  const duplicateCount = rows.filter((r) => r.status === "duplicate").length;
  // Duplicates are skipped, not blocking — only genuine errors block the import.
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

  const { data: inserted, error } = await supabase.rpc("import_questions", {
    p_subject_id: subjectId,
    p_passages: filePassages.map((p) => ({
      ref: String(p.ref ?? ""),
      title: typeof p.title === "string" ? p.title : null,
      body: typeof p.body === "string" ? p.body : "",
    })),
    p_questions: resolved,
  });
  if (error) return NextResponse.json({ ...report, ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ...report, ok: true, inserted });
}
