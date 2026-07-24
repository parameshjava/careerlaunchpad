"use client";

/**
 * Admin JSON import for ASSESSMENT questions: pick subject → download schema/sample
 * → upload a .json file → validated preview of every question → commit (only when
 * all checks pass). Wired to POST /api/assessment/questions/import (dry-run vs
 * commit). Mirrors the exam question import, minus passages (assessment is
 * standalone MCQs). Built to docs/STYLE_GUIDE.md: shadcn primitives, mobile-first.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RichContent } from "@/components/exam/RichContent";
import { Button } from "@/components/ui/button";
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

type FileOption = { label?: string; is_correct?: boolean };
type FileQuestion = {
  chapter?: string;
  kind?: string;
  difficulty?: string;
  answer_type?: string;
  stem?: string;
  explanation?: string;
  options?: FileOption[];
};
type FileData = { subject?: string; questions?: FileQuestion[] };

const STATUS_VARIANT: Record<RowStatus, "default" | "destructive" | "secondary" | "outline"> = {
  ok: "default",
  error: "destructive",
  duplicate: "secondary",
  unresolved: "outline",
};

// A JSON Schema TAILORED to the chosen subject: `subject` is fixed (const) and
// `chapter` is constrained to that subject's real chapters — so an AI agent (or a
// human) can only produce values the importer will accept. No passages.
function buildSchema(subject: string, chapterNames: string[]) {
  // A "there exists a correct option" subschema, reused by the single/multi rules.
  const hasCorrect = {
    type: "object",
    properties: { is_correct: { const: true } },
    required: ["is_correct"],
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `CareerLaunchpad assessment-question import — ${subject}`,
    description:
      [
        "Import file for CareerLaunchpad per-chapter assessment questions.",
        "How the importer behaves:",
        "• One subject per file — `subject` MUST equal the selected subject exactly.",
        "• `chapter` MUST already exist in that subject (pick from the enum); unknown chapters are reported, not created.",
        "• Standalone MCQs only — no passages.",
        "• A question with the same chapter + stem as one already in the bank is SKIPPED (safe to re-run).",
        "• Nothing is saved until every question passes validation in the preview.",
        "Content fields (stem, options, explanation) accept Markdown and LaTeX ($…$).",
      ].join("\n"),
    type: "object",
    required: ["subject", "questions"],
    additionalProperties: false,
    properties: {
      subject: { const: subject, description: "Must be exactly this subject." },
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
            kind: {
              enum: ["standard", "data_sufficiency"],
              default: "standard",
              description: "'standard' MCQ, or 'data_sufficiency' (statement-sufficiency style).",
            },
            difficulty: { enum: ["easy", "medium", "hard", "very_hard"] },
            answer_type: {
              enum: ["single", "multi"],
              description: "'single' = exactly one correct option; 'multi' = one or more.",
            },
            stem: { type: "string", minLength: 1, description: "Question text. Markdown + LaTeX." },
            stem_image_url: { type: "string", description: "Optional image URL / R2 object key." },
            explanation: {
              type: "string",
              minLength: 1,
              description: "Required. Worked solution (Markdown + LaTeX).",
            },
            source: {
              type: "string",
              description: 'Optional. The paper/test this question appeared in, e.g. "ICET 2019 - Slot 2".',
            },
            source_year: {
              type: "integer",
              minimum: 1900,
              maximum: 2100,
              description: "Optional. The year of that paper, e.g. 2019.",
            },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 5,
              description: "4 or 5 options. Correctness is enforced by answer_type (see allOf).",
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
          // Machine-enforce the correctness rule so a validator (or an AI agent
          // checking against the schema) catches it BEFORE upload — not just at the
          // server dry-run: single ⇒ exactly one correct; multi ⇒ at least one.
          allOf: [
            {
              if: { properties: { answer_type: { const: "single" } }, required: ["answer_type"] },
              then: {
                properties: {
                  options: { contains: hasCorrect, minContains: 1, maxContains: 1 },
                },
              },
            },
            {
              if: { properties: { answer_type: { const: "multi" } }, required: ["answer_type"] },
              then: { properties: { options: { contains: hasCorrect, minContains: 1 } } },
            },
          ],
        },
      },
    },
    examples: [buildSample(subject, chapterNames)],
  };
}

// A valid example for the subject, using its first chapter — one of each shape
// (single-correct, multi-correct, data-sufficiency) so an author or AI agent sees
// the full vocabulary at a glance.
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
        stem: "Single-correct example. What is $2 + 2$?",
        explanation: "Replace with the worked solution.",
        source: "ICET 2019 - Slot 2",
        source_year: 2019,
        options: [
          { label: "4", is_correct: true },
          { label: "3", is_correct: false },
          { label: "5", is_correct: false },
          { label: "22", is_correct: false },
        ],
      },
      {
        chapter,
        kind: "standard",
        difficulty: "medium",
        answer_type: "multi",
        stem: "Multi-correct example — select all prime numbers.",
        explanation: "2, 3 and 5 are prime; 4 is not.",
        options: [
          { label: "2", is_correct: true },
          { label: "3", is_correct: true },
          { label: "4", is_correct: false },
          { label: "5", is_correct: true },
        ],
      },
      {
        chapter,
        kind: "data_sufficiency",
        difficulty: "hard",
        answer_type: "single",
        stem: "Data-sufficiency example. Is $x > 0$? (1) $x^2 = 9$. (2) $x = 3$.",
        explanation: "Statement (2) alone fixes x = 3 > 0; (1) allows ±3.",
        options: [
          { label: "Statement I alone is sufficient, but statement II alone is not.", is_correct: false },
          { label: "Statement II alone is sufficient, but statement I alone is not.", is_correct: true },
          { label: "Both statements together are sufficient, but neither alone is.", is_correct: false },
          { label: "Each statement alone is sufficient.", is_correct: false },
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

export function ImportAssessmentQuestionsClient({ subjects }: { subjects: Subject[] }) {
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
    const res = await fetch("/api/assessment/questions/import", {
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
                downloadJSON(
                  `${subjectName || "assessment-questions"}-import.schema.json`,
                  buildSchema(subjectName, chapters),
                )
              }
            >
              ⬇ JSON schema
            </Button>
            <Button
              variant="outline"
              disabled={!subjectId}
              onClick={() =>
                downloadJSON(
                  `${subjectName || "assessment-questions"}-import.sample.json`,
                  buildSample(subjectName, chapters),
                )
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
            <span className="text-muted-foreground text-sm">{fileName ?? "No file chosen"}</span>
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

            {allRows.length > pageSize && PageBar()}

            <div className="grid gap-2">
              {pageRows.map((r) => {
                const q = fileData?.questions?.[r.row - 1];
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
                        <RichContent content={q.explanation} className="text-muted-foreground mt-0.5" />
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
