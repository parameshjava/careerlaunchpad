"use client";

// Admin results view: summary stats, a score-distribution chart, the roster with
// scores, and the publish toggle (gates whether students can see their result).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RosterEntry } from "@/lib/exam-query";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-muted-foreground text-sm font-medium">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function ResultsClient({
  sessionId,
  resultsPublished,
  roster,
  canPublish,
}: {
  sessionId: string;
  resultsPublished: boolean;
  roster: RosterEntry[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const graded = roster.filter((r) => r.score != null);
  const scores = graded.map((r) => r.score as number);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const max = scores.length ? Math.max(...scores).toString() : "—";

  // Score distribution in 5 buckets between min and max.
  const histogram = useMemo(() => {
    if (scores.length === 0) return [];
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    const span = Math.max(1, hi - lo);
    const bins = 5;
    const counts = Array.from({ length: bins }, (_, i) => ({
      range: `${Math.round(lo + (span * i) / bins)}–${Math.round(lo + (span * (i + 1)) / bins)}`,
      count: 0,
    }));
    for (const s of scores) {
      const idx = Math.min(bins - 1, Math.floor(((s - lo) / span) * bins));
      counts[idx].count += 1;
    }
    return counts;
  }, [scores]);

  async function togglePublish() {
    setError("");
    setBusy(true);
    const res = await fetch(`/api/exam/sessions/${sessionId}/publish-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !resultsPublished }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not update");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Assigned" value={String(roster.length)} />
        <Stat label="Graded" value={String(graded.length)} />
        <Stat label="Average" value={avg} />
        <Stat label="Highest" value={max} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Results to students</div>
            <div className="text-muted-foreground text-xs">
              {resultsPublished ? "Published — students can see their scores." : "Hidden from students."}
            </div>
          </div>
          {canPublish && (
            <Button variant={resultsPublished ? "outline" : "default"} disabled={busy} onClick={togglePublish}>
              {resultsPublished ? "Unpublish" : "Publish results"}
            </Button>
          )}
        </CardContent>
      </Card>

      {histogram.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-2 text-sm font-medium">Score distribution</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--brand-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-2 pt-6">
          <h2 className="text-sm font-semibold">Students ({roster.length})</h2>
          {roster.length === 0 ? (
            <p className="text-muted-foreground text-sm">No students assigned.</p>
          ) : (
            <ul className="grid gap-2">
              {roster.map((r) => (
                <li key={r.studentId} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{r.name ?? r.email ?? r.studentId}</div>
                    <div className="text-muted-foreground text-xs">{r.email}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{r.rosterStatus}</Badge>
                    <span className="tabular-nums font-medium">{r.score ?? "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
