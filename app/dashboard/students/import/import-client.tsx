"use client";

/**
 * Admin Excel intake: pick a college → download the template → upload the
 * filled file → see the per-row import + invite report. Wired to
 * /api/admin/intake/{template,import}. See docs/REGISTRATION_AND_INTAKE_API.md.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type College = { id: string; name: string; place: string | null; state?: string | null };
type ReportRow = { row: number; email: string | null; result: string; invite?: string; warnings?: string[] };
type Report = {
  total: number; created: number; updated: number; invited: number; invite_skipped: number; rows: ReportRow[];
};

export function ImportClient() {
  const [college, setCollege] = useState<College | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

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
        <h2 className="font-semibold">1 · Choose a college</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          The template and every imported student will be tied to this college.
        </p>
        <CollegePicker college={college} onPick={(c) => { setCollege(c); setReport(null); }} />
      </section>

      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold">2 · Download the template</h2>
        <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
          Fill one row per student. Only <b>Email</b> is required; everything else can be filled later by the student.
        </p>
        <Button asChild disabled={!college} variant="outline">
          <a href={college ? `/api/admin/intake/template?college_id=${college.id}` : undefined} aria-disabled={!college}>
            ⬇ Download Excel template
          </a>
        </Button>
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
          </div>
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

function CollegePicker({ college, onPick }: { college: College | null; onPick: (c: College | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (college || query.trim().length < 2) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query)}`);
      if (res.ok) { setResults((await res.json()).results); setOpen(true); }
    }, 250);
  }, [query, college]);

  // Once a college is picked, show its full details (no truncation) with a
  // "Change" action, rather than cramming the long name into the search input.
  if (college) {
    const location = [college.place, college.state].filter(Boolean).join(", ");
    return (
      <div className="grid max-w-md gap-1.5">
        <Label>College</Label>
        <div className="border-input bg-muted/30 flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <p className="font-medium break-words">{college.name}</p>
            {location && (
              <p className="text-muted-foreground mt-0.5 text-sm break-words">{location}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => { onPick(null); setQuery(""); setResults([]); setOpen(false); }}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid max-w-md gap-1.5">
      <Label>College</Label>
      <Input
        autoComplete="off"
        placeholder="Search colleges…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="border-input bg-background absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="hover:bg-muted w-full px-3 py-2 text-left" onClick={() => { onPick(c); setOpen(false); }}>
                {c.name}{c.place ? <span className="text-muted-foreground"> — {c.place}{c.state ? `, ${c.state}` : ""}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
