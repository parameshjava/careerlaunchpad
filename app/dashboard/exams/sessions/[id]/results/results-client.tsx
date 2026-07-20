"use client";

// Admin results view: summary stats, the subject-averages chart, the roster with
// scores, and the publish toggle (gates whether students can see their result).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RosterEntry, SubjectAvg } from "@/lib/exam-query";

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
  subjectAvgs,
  canPublish,
}: {
  sessionId: string;
  resultsPublished: boolean;
  roster: RosterEntry[];
  subjectAvgs: SubjectAvg[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const graded = roster.filter((r) => r.score != null);
  const scores = graded.map((r) => r.score as number);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const max = scores.length ? Math.max(...scores).toString() : "—";

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

      <div className="flex justify-end">
        {/* Prints the letterhead statement embedded in this page (ResultsPrint). */}
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

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

      {subjectAvgs.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-2 text-sm font-medium">Average score by subject</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={subjectAvgs} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="subject" fontSize={12} />
                <YAxis
                  fontSize={12}
                  domain={[0, Math.max(...subjectAvgs.map((s) => s.max))]}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${value} / ${(item.payload as SubjectAvg).max} marks (avg)`,
                    (item.payload as SubjectAvg).subject,
                  ]}
                />
                <Bar dataKey="avg" fill="var(--brand-blue)" radius={[4, 4, 0, 0]} />
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
                    {r.abortCount > 0 && <Badge variant="destructive">AB ×{r.abortCount}</Badge>}
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
