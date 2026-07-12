"use client";

/**
 * Admin JSON question import: pick subject → download schema/sample → upload a
 * .json file → validated preview of every question → commit (only when all
 * checks pass). Wired to POST /api/exam/questions/import (dry-run vs commit).
 * The parsed file is held in memory so re-validate/commit don't re-upload.
 */
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const STATUS_TONE: Record<RowStatus, "good" | "bad" | "warn"> = {
  ok: "good",
  error: "bad",
  duplicate: "warn",
  unresolved: "warn",
};

export function ImportQuestionsClient({ subjects }: { subjects: Subject[] }) {
  const [subjectId, setSubjectId] = useState("");
  const [parsed, setParsed] = useState<unknown>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

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
      if (body.error) setError(body.error);
      if (commit && body.ok) setDone(body.inserted ?? 0);
    } else {
      setReport(null);
      setError(body.error ?? "Request failed.");
    }
  }

  const blocking = report
    ? report.errorCount + report.duplicateCount + report.fileErrors.length
    : 1;
  const canValidate = !!subjectId && parsed != null && !busy;

  return (
    <div className="grid gap-6">
      {/* 1 — subject */}
      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">1 · Choose the subject</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          One subject per file — the file&apos;s <code>subject</code> must match this.
        </p>
        <select
          className="border-input bg-background h-9 w-full max-w-md rounded-md border px-3 text-sm"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setReport(null);
            setDone(null);
          }}
        >
          <option value="">Select a subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </section>

      {/* 2 — schema + sample */}
      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">2 · Get the format</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          Subjects and chapters are referenced <b>by name and must already exist</b>.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/exam/question-import.schema.json" target="_blank" download>
              ⬇ JSON schema
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/exam/question-import.sample.json" target="_blank" download>
              ⬇ Sample file
            </Link>
          </Button>
        </div>
      </section>

      {/* 3 — upload + validate */}
      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">3 · Upload &amp; validate</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          Max 2&nbsp;MB. We validate every question first — nothing is saved yet.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept=".json,application/json"
            className="max-w-xs"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <Button onClick={() => run(false)} disabled={!canValidate}>
            {busy ? "Validating…" : "Validate"}
          </Button>
        </div>
        {fileName && <p className="text-muted-foreground mt-2 text-xs">Loaded: {fileName}</p>}
        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
      </section>

      {done != null && (
        <section className="border-primary/40 bg-primary/5 rounded-xl border p-5">
          <p className="text-sm font-medium">
            ✅ Imported {done} question{done === 1 ? "" : "s"}. They now appear in the bank.
          </p>
        </section>
      )}

      {report && done == null && (
        <section className="bg-card rounded-xl border p-5 shadow-sm">
          <h2 className="font-semibold">Preview</h2>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>Total: <b className="text-foreground">{report.total}</b></span>
            <span>Valid: <b className="text-foreground">{report.valid}</b></span>
            <span>Errors: <b className="text-foreground">{report.errorCount}</b></span>
            <span>Duplicates: <b className="text-foreground">{report.duplicateCount}</b></span>
          </div>

          {report.fileErrors.length > 0 && (
            <ul className="text-destructive mt-3 list-disc pl-5 text-sm">
              {report.fileErrors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}

          {/* Unresolved chapter mapping */}
          {report.unresolved_chapters.length > 0 && (
            <div className="border-amber-300 bg-amber-50 mt-4 rounded-lg border p-4 dark:bg-amber-950/20">
              <p className="text-sm font-medium">Map unrecognised chapters</p>
              <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
                Pick the matching chapter, then re-validate. (New chapters must be created in Subjects first.)
              </p>
              <div className="grid gap-2">
                {report.unresolved_chapters.map((u) => (
                  <div key={u.name} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-40 font-medium">
                      {u.name} <span className="text-muted-foreground">×{u.count}</span>
                    </span>
                    <select
                      className="border-input bg-background h-9 min-w-52 rounded-md border px-2 text-sm"
                      value={overrides[u.name] ?? ""}
                      onChange={(e) =>
                        setOverrides((o) => ({ ...o, [u.name]: e.target.value }))
                      }
                    >
                      <option value="">Map to…</option>
                      {report.chapters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
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

          {/* Every question, with status */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-muted-foreground border-b text-left">
                <tr>
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Chapter</th>
                  <th className="py-2 pr-3 font-medium">Question</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.row} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{r.row}</td>
                    <td className="py-2 pr-3">{r.chapter}</td>
                    <td className="text-muted-foreground py-2 pr-3">{r.stem || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="py-2 text-amber-600">{r.messages.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button onClick={() => run(true)} disabled={busy || blocking > 0}>
              {busy ? "Importing…" : `Import ${report.valid} question${report.valid === 1 ? "" : "s"}`}
            </Button>
            {blocking > 0 && (
              <span className="text-muted-foreground text-sm">
                Resolve all {blocking} issue{blocking === 1 ? "" : "s"} to enable import.
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "bad" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "bad"
      ? "bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-primary/10 text-primary";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
