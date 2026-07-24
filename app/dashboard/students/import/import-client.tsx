"use client";

/**
 * Admin Excel intake: pick a college → download the template → upload the
 * filled file → see the per-row import + invite report. Wired to
 * /api/admin/intake/{template,import}. See docs/REGISTRATION_AND_INTAKE_API.md.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollegePicker, type College } from "@/components/colleges/college-picker";

type ReportRow = { row: number; email: string | null; result: string; invite?: string; warnings?: string[] };
type Report = {
  total: number; created: number; updated: number; invited: number; invite_skipped: number; rejected?: number; rows: ReportRow[];
};

export function ImportClient() {
  const [college, setCollege] = useState<College | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  // Download the template via fetch → Blob → synthetic <a download> click rather
  // than a plain <a href> navigation to the API route: the latter silently does
  // nothing when the request fails (or is blocked), whereas this surfaces the
  // server's error message and forces a real file save with the right filename.
  async function downloadTemplate() {
    if (!college) { setDlError("Please choose a college first (step 1)."); return; }
    setDlBusy(true); setDlError(null);
    try {
      const res = await fetch(`/api/admin/intake/template?college_id=${college.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      // The server always sends a college-specific filename via Content-Disposition;
      // the static fallback is only for the unlikely case that header is stripped
      // (avoids duplicating the server's name-sanitization logic here).
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/.exec(cd);
      const filename = match?.[1] ?? "intake-template.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer the revoke: revoking synchronously right after click() can cancel
      // the download on some browsers (notably iOS/mobile Safari) before they've
      // committed it. A short timeout lets the download start first.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Could not download the template.");
    } finally {
      setDlBusy(false);
    }
  }

  async function upload() {
    if (!college || !file) return;
    setBusy(true); setError(null); setReport(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("college_id", college.id);
    const res = await fetch("/api/admin/intake/import", { method: "POST", body: fd });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Import failed."); return; }
    setReport(body);
  }

  return (
    <div className="grid gap-6">
      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">
          1 · Choose a college <span className="text-destructive" aria-hidden="true">*</span>
        </h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          Required — the template and every imported student will be tied to this college.
        </p>
        <div className="max-w-md">
          <CollegePicker value={college} details={false} label={null} onChange={(c) => { setCollege(c); setReport(null); setDlError(null); }} />
        </div>
      </section>

      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">2 · Download the template</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          Fill one row per student. Only <b>Email</b> is required; everything else can be filled later by the student.
        </p>
        <Button onClick={downloadTemplate} disabled={dlBusy} variant="outline">
          {dlBusy ? "Preparing…" : "⬇ Download Excel template"}
        </Button>
        {dlError && <p className="text-destructive mt-3 text-sm">{dlError}</p>}
      </section>

      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">3 · Upload the filled file</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          Each imported student is automatically invited by email. Re-uploading updates existing rows.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept=".xlsx"
            className="max-w-xs"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button onClick={upload} disabled={!college || !file || busy}>
            {busy ? "Importing…" : "Import & invite"}
          </Button>
        </div>
        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
      </section>

      {report && (
        <section className="bg-card rounded-xl border p-5 shadow-sm">
          <h2 className="font-semibold">Import report</h2>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>Total rows: <b className="text-foreground">{report.total}</b></span>
            <span>Created: <b className="text-foreground">{report.created}</b></span>
            <span>Updated: <b className="text-foreground">{report.updated}</b></span>
            <span>Invited: <b className="text-foreground">{report.invited}</b></span>
            <span>Invites skipped: <b className="text-foreground">{report.invite_skipped}</b></span>
            {!!report.rejected && (
              <span>Rejected: <b className="text-destructive">{report.rejected}</b></span>
            )}
          </div>
          {!!report.rejected && (
            <p className="text-muted-foreground mt-2 text-sm">
              {report.rejected} row{report.rejected === 1 ? "" : "s"} were not imported because of the errors noted below — fix them and re-upload (re-uploading updates existing rows).
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-muted-foreground border-b text-left">
                <tr>
                  <th className="py-2 pr-3 font-medium">Row</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Invite</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.row} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 tabular-nums">{r.row}</td>
                    <td className="py-2 pr-3">{r.email ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.result === "error" ? "bad" : "good"}>{r.result}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.invite ?? "—"}</td>
                    <td className="py-2 text-amber-600">{r.warnings?.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
    }`}>
      {children}
    </span>
  );
}

