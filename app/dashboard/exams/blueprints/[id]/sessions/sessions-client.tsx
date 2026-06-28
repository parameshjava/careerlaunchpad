"use client";

// Create a sitting (POSTs to .../sessions, which generates the paper) and list
// existing sittings with a link into each one.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionSummary } from "@/lib/exam-query";

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

export function SessionsClient({
  blueprintId,
  published,
  initialSessions,
}: {
  blueprintId: string;
  published: boolean;
  initialSessions: SessionSummary[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState("online");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setError("");
    setCreating(true);
    const res = await fetch(`/api/exam/blueprints/${blueprintId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        mode,
        opens_at: opensAt || null,
        closes_at: closesAt || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) return setError(data.error ?? "Could not create sitting");
    router.push(`/dashboard/exams/sessions/${data.session_id}`);
  }

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {published && (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="label">Sitting label</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Batch 2026 — Mock 1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mode">Mode</Label>
              <select id="mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="online">Online</option>
                <option value="offline">Offline (PDF)</option>
              </select>
            </div>
            <div />
            <div className="grid gap-1.5">
              <Label htmlFor="opens">Opens at</Label>
              <Input id="opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closes">Closes at</Label>
              <Input id="closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={create} disabled={creating || !label.trim()}>
                {creating ? "Generating paper…" : "Create sitting & generate paper"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {initialSessions.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No sittings yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {initialSessions.map((s) => (
            <li key={s.id}>
              <Link href={`/dashboard/exams/sessions/${s.id}`}>
                <Card className="hover:border-primary/50 transition">
                  <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {s.mode} · {s.questionCount} questions · {s.rosterCount} assigned
                      </div>
                    </div>
                    <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
