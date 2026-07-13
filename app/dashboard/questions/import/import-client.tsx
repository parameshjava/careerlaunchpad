"use client";

/**
 * Admin JSON question import: pick subject → download schema/sample → upload a
 * .json file → validated preview of every question → commit (only when all
 * checks pass). Wired to POST /api/exam/questions/import (dry-run vs commit).
 * The parsed file is held in memory so re-validate/commit don't re-upload.
 * Built to docs/STYLE_GUIDE.md: shadcn primitives + brand tokens, mobile-first.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Subject = { id: string; name: string };
type RowStatus = "ok" | "error" | "duplicate" | "unresolved";
type ReportRow = {
  row: number;
  chapter: string;
  stem: string;
  difficulty: string;
  status: RowStatus;
  messages: string[];
};
type Report = {
  ok: boolean;
  total: number;
  valid: number;
  errorCount: number;
  duplicateCount: number;
  fileErrors: string[];
  unresolved_chapters: { name: string; count: number }[];
  chapters: { id: string; name: string }[];
  rows: ReportRow[];
  inserted?: number;
  error?: string;
};

// Shapes read straight from the parsed upload (held in memory) so the preview can
// render each question exactly as the student sees it — same RichContent renderer.
type FileOption = { label?: string; is_correct?: boolean };
type FileQuestion = {
  chapter?: string;
  kind?: string;
  difficulty?: string;
  answer_type?: string;
  stem?: string;
  explanation?: string;
  passage_ref?: string;
  options?: FileOption[];
};
type FilePassage = { ref?: string; title?: string; body?: string };
type FileData = { subject?: string; passages?: FilePassage[]; questions?: FileQuestion[] };

const STATUS_VARIANT: Record<RowStatus, "default" | "destructive" | "secondary" | "outline"> = {
  ok: "default",
  error: "destructive",
  duplicate: "secondary",
  unresolved: "outline",
};

// Build a JSON Schema TAILORED to the chosen subject: `subject` is fixed (const)
// and `chapter` is constrained to that subject's real chapters — so an AI agent
// (or a human) can only produce values the importer will accept.
function buildSchema(subject: string, chapterNames: string[]) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `CareerLaunchPad question import — ${subject}`,
    description:
      "One subject per file. `subject` is fixed to the selected subject; `chapter` must be one of the enumerated chapters (they must already exist in the bank).",
    type: "object",
    required: ["subject", "questions"],
    additionalProperties: false,
    properties: {
      subject: { const: subject, description: "Must be exactly this subject." },
      passages: {
        type: "array",
        description: "Optional. Referenced by passage-type questions via passage_ref.",
        items: {
          type: "object",
          required: ["ref", "body"],
          additionalProperties: false,
          properties: {
            ref: { type: "string", minLength: 1, description: 'File-local id, e.g. "p1".' },
            title: { type: "string" },
            body: { type: "string", minLength: 1, description: "Markdown + LaTeX." },
          },
        },
      },
      questions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["chapter", "difficulty", "answer_type", "stem", "explanation", "options"],
          additionalProperties: false,
          properties: {
            chapter:
              chapterNames.length > 0
                ? { enum: chapterNames, description: "Must be one of the subject's chapters." }
                : {
                    type: "string",
                    minLength: 1,
                    description: "This subject has no chapters yet — add chapters first.",
                  },
            kind: { enum: ["standard", "passage", "data_sufficiency"], default: "standard" },
            passage_ref: {
              type: "string",
              description: "Required iff kind = passage; must match a passages[].ref.",
            },
            difficulty: { enum: ["easy", "medium", "hard", "very_hard"] },
            answer_type: { enum: ["single", "multi"] },
            stem: { type: "string", minLength: 1, description: "Markdown + LaTeX." },
            stem_image_url: { type: "string" },
            explanation: {
              type: "string",
              minLength: 1,
              description: "Required. Worked solution (Markdown + LaTeX).",
            },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 5,
              description: "4 or 5 options. single ⇒ exactly 1 is_correct; multi ⇒ ≥1.",
              items: {
                type: "object",
                required: ["label", "is_correct"],
                additionalProperties: false,
                properties: {
                  label: { type: "string", minLength: 1 },
                  is_correct: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  };
}

// A minimal valid example for the subject, using its first chapter.
function buildSample(subject: string, chapterNames: string[]) {
  const chapter = chapterNames[0] ?? "An existing chapter name";
  return {
    subject,
    questions: [
      {
        chapter,
        kind: "standard",
        difficulty: "easy",
        answer_type: "single",
        stem: "Replace with the question text (Markdown + LaTeX supported).",
        explanation: "Replace with the worked solution.",
        options: [
          { label: "Correct option", is_correct: true },
          { label: "Distractor 1", is_correct: false },
          { label: "Distractor 2", is_correct: false },
          { label: "Distractor 3", is_correct: false },
        ],
      },
    ],
  };
}

function downloadJSON(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportQuestionsClient({ subjects }: { subjects: Subject[] }) {
  const [subjectId, setSubjectId] = useState("");
  const [chapters, setChapters] = useState<string[]>([]);
  const [parsed, setParsed] = useState<unknown>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? "";

  // Load the subject's chapters so the downloadable schema can enumerate them.
  useEffect(() => {
    if (!subjectId) {
      setChapters([]);
      return;
    }
    fetch(`/api/exam/chapters?subject_id=${subjectId}`)
      .then((r) => r.json())
      .then((d) => setChapters(((d.chapters ?? []) as { name: string }[]).map((c) => c.name)))
      .catch(() => setChapters([]));
  }, [subjectId]);

  function onPickFile(f: File | null) {
    setReport(null);
    setDone(null);
    setError(null);
    setOverrides({});
    setFileName(f?.name ?? null);
    if (!f) {
      setParsed(null);
      return;
    }
    f.text()
      .then((t) => setParsed(JSON.parse(t)))
      .catch(() => {
        setParsed(null);
        setError("That file is not valid JSON.");
      });
  }

  async function run(commit: boolean, ov: Record<string, string> = overrides) {
    if (!subjectId || parsed == null) return;
    setBusy(true);
    setError(null);
    if (commit) setDone(null);
    const res = await fetch("/api/exam/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject_id: subjectId, commit, overrides: ov, data: parsed }),
    });
    const body: Report = await res.json().catch(() => ({}) as Report);
    setBusy(false);
    if (Array.isArray(body.rows)) {
      setReport(body);
      setPage(0);
      if (body.error) setError(body.error);
      if (commit && body.ok) setDone(body.inserted ?? 0);
    } else {
      setReport(null);
      setError(body.error ?? "Request failed.");
    }
  }

  const blocking = report ? report.errorCount + report.fileErrors.length : 1;
  const canValidate = !!subjectId && parsed != null && !busy;
  const fileRef = useRef<HTMLInputElement>(null);
  const fileData = parsed as FileData | null;

  // Pagination — review a large import one set at a time.
  const allRows = report?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = allRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function PageBar() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground text-xs">
          Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, allRows.length)} of{" "}
          {allRows.length}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Questions per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[20, 30, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Prev
          </Button>
          <span className="text-muted-foreground tabular-nums text-xs">
            {safePage + 1}/{pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* 1 — subject */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Choose the subject</CardTitle>
          <CardDescription>
            One subject per file — the file&apos;s <code>subject</code> must match this.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={subjectId}
            onValueChange={(v) => {
              setSubjectId(v);
              setReport(null);
              setDone(null);
            }}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a subject…" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 2 — schema + sample */}
      <Card>
        <CardHeader>
          <CardTitle>2 · Get the format</CardTitle>
          <CardDescription>
            The schema is <b>tailored to the selected subject</b> — the subject is fixed and only
            its chapters are allowed. Hand it to an AI agent (or author by hand) to produce only
            valid questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={!subjectId}
              onClick={() =>
                downloadJSON(`${subjectName || "questions"}-import.schema.json`, buildSchema(subjectName, chapters))
              }
            >
              ⬇ JSON schema
            </Button>
            <Button
              variant="outline"
              disabled={!subjectId}
              onClick={() =>
                downloadJSON(`${subjectName || "questions"}-import.sample.json`, buildSample(subjectName, chapters))
              }
            >
              ⬇ Sample file
            </Button>
          </div>
          {subjectId ? (
            <p className="text-muted-foreground text-xs">
              For <b>{subjectName}</b>: {chapters.length} valid chapter
              {chapters.length === 1 ? "" : "s"} enumerated in the schema.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Select a subject above to download its tailored schema.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3 — upload + validate */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Upload &amp; validate</CardTitle>
          <CardDescription>
            Max 2&nbsp;MB. We validate every question first — nothing is saved yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Native file input is hidden; a styled Browse button triggers it so
              the control matches the rest of the UI. Validate appears only once a
              file has been chosen. */}
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              {fileName ? "Choose a different file" : "Browse…"}
            </Button>
            <span className="text-muted-foreground text-sm">
              {fileName ?? "No file chosen"}
            </span>
            {parsed != null && (
              <Button onClick={() => run(false)} disabled={!canValidate}>
                {busy ? "Validating…" : "Validate"}
              </Button>
            )}
          </div>
          {!subjectId && parsed != null && (
            <p className="text-muted-foreground mt-2 text-xs">
              Select a subject in step 1 to enable validation.
            </p>
          )}
          {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
        </CardContent>
      </Card>

      {done != null && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm font-medium">
              ✅ Imported {done} question{done === 1 ? "" : "s"}. They now appear in the bank.
            </p>
          </CardContent>
        </Card>
      )}

      {report && done == null && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                Total: <b className="text-foreground">{report.total}</b>
              </span>
              <span>
                Valid: <b className="text-foreground">{report.valid}</b>
              </span>
              <span>
                Errors: <b className="text-foreground">{report.errorCount}</b>
              </span>
              <span>
                Skipped (already in bank): <b className="text-foreground">{report.duplicateCount}</b>
              </span>
            </div>

            {report.fileErrors.length > 0 && (
              <ul className="text-destructive list-disc pl-5 text-sm">
                {report.fileErrors.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}

            {/* Unresolved chapter mapping */}
            {report.unresolved_chapters.length > 0 && (
              <div className="bg-muted/40 rounded-lg border p-4">
                <p className="text-sm font-medium">Map unrecognised chapters</p>
                <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
                  Pick the matching chapter, then re-validate. (New chapters must be created in
                  Subjects first.)
                </p>
                <div className="grid gap-2">
                  {report.unresolved_chapters.map((u) => (
                    <div key={u.name} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-40 font-medium">
                        {u.name} <span className="text-muted-foreground">×{u.count}</span>
                      </span>
                      <Select
                        value={overrides[u.name] ?? ""}
                        onValueChange={(v) => setOverrides((o) => ({ ...o, [u.name]: v }))}
                      >
                        <SelectTrigger className="min-w-52">
                          <SelectValue placeholder="Map to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {report.chapters.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => run(false)}
                  disabled={busy}
                >
                  Re-validate
                </Button>
              </div>
            )}

            {/* Paginated so a large import is reviewed one set at a time. */}
            {allRows.length > pageSize && PageBar()}

            {/* Every question rendered as the student sees it (same RichContent
                renderer as the attempt UI), with the correct option marked for the
                admin to verify before committing. */}
            <div className="grid gap-2">
              {pageRows.map((r) => {
                const q = fileData?.questions?.[r.row - 1];
                const passage =
                  q?.passage_ref != null
                    ? fileData?.passages?.find((p) => p.ref === q.passage_ref)
                    : undefined;
                return (
                  <div key={r.row} className="rounded-lg border p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground tabular-nums">Q{r.row}</span>
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                      <span className="text-muted-foreground">{r.chapter}</span>
                      {q?.difficulty && <Badge variant="outline">{q.difficulty}</Badge>}
                      {q?.kind && q.kind !== "standard" && <Badge variant="outline">{q.kind}</Badge>}
                      {q?.answer_type === "multi" && <Badge variant="outline">multi-select</Badge>}
                    </div>

                    {passage?.body && (
                      <div className="bg-muted/40 mb-2 rounded-md border p-2.5">
                        {passage.title && (
                          <p className="mb-1 text-xs font-semibold">{passage.title}</p>
                        )}
                        <RichContent content={passage.body} className="text-sm" />
                      </div>
                    )}

                    {q?.stem ? (
                      <RichContent content={q.stem} className="text-sm font-medium" />
                    ) : (
                      <p className="text-muted-foreground text-sm">— (no stem)</p>
                    )}

                    <ol className="mt-2 grid gap-1">
                      {(q?.options ?? []).map((o, oi) => (
                        <li
                          key={oi}
                          className={cn(
                            "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                            o.is_correct ? "border-primary/50 bg-primary/5" : "border-transparent",
                          )}
                        >
                          <span className="font-semibold">{String.fromCharCode(65 + oi)}.</span>
                          <RichContent content={o.label ?? ""} inline className="flex-1" />
                          {o.is_correct && (
                            <span className="text-primary text-xs font-medium whitespace-nowrap">
                              ✓ correct
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>

                    {q?.explanation && (
                      <div className="bg-muted/50 mt-2 rounded-md border px-2.5 py-1.5 text-sm">
                        <span className="text-foreground font-semibold">Explanation</span>
                        <RichContent
                          content={q.explanation}
                          className="text-muted-foreground mt-0.5"
                        />
                      </div>
                    )}

                    {r.messages.length > 0 && (
                      <p className="text-destructive mt-2 text-xs">{r.messages.join("; ")}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {allRows.length > pageSize && PageBar()}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => run(true)} disabled={busy || blocking > 0 || report.valid === 0}>
                {busy ? "Importing…" : `Import ${report.valid} question${report.valid === 1 ? "" : "s"}`}
              </Button>
              {blocking > 0 ? (
                <span className="text-muted-foreground text-sm">
                  Fix all {blocking} error{blocking === 1 ? "" : "s"} to enable import.
                </span>
              ) : (
                report.duplicateCount > 0 && (
                  <span className="text-muted-foreground text-sm">
                    {report.duplicateCount} already in the bank will be skipped.
                  </span>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
