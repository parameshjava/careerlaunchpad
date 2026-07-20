"use client";

// Conduct a sitting: open/close it, assign students, print the offline question
// paper / answer key directly (separate sheets — the print-only PaperPrint block
// is embedded by the page), and view the roster + scores. Results printing lives
// on the Results page.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { printAs } from "./paper-print";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RosterEntry, SessionSummary } from "@/lib/exam-query";

export function SessionDetailClient({
  session,
  roster,
  canPrintPaper,
}: {
  session: SessionSummary;
  roster: RosterEntry[];
  canPrintPaper: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function action(label: string, url: string, body?: unknown) {
    setError("");
    setBusy(label);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(data.error ?? "Action failed");
    router.refresh();
  }

  const submitted = roster.filter((r) => r.rosterStatus === "submitted").length;

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Status + actions */}
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <Badge variant={session.status === "open" ? "default" : "secondary"}>{session.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Opening is automatic at the start time; there is no manual Open,
                and a closed sitting is final. Close is only an early-stop. */}
            {session.status !== "closed" && session.status !== "graded" && (
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => action("close", `/api/exam/sessions/${session.id}/close`, { status: "closed" })}>
                Close now
              </Button>
            )}
            {canPrintPaper && (
              <>
                <Button size="sm" onClick={() => printAs("paper")}>
                  <Printer /> Print paper
                </Button>
                <Button size="sm" onClick={() => printAs("key")}>
                  <Printer /> Print key
                </Button>
              </>
            )}
            {/* A scheduled sitting has no results yet. */}
            {session.status === "scheduled" ? (
              <Button size="sm" variant="outline" disabled title="Results appear once the exam runs">
                Results
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/dashboard/exams/sessions/${session.id}/results`}>Results</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Roster */}
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Roster ({roster.length})</h2>
            <span className="text-muted-foreground text-xs">{submitted} submitted</span>
          </div>
          {roster.length === 0 ? (
            <p className="text-muted-foreground text-sm">No students assigned yet.</p>
          ) : (
            <ul className="grid gap-2">
              {roster.map((r) => (
                <li key={r.studentId} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{r.name ?? r.email ?? r.studentId}</div>
                    <div className="text-muted-foreground text-xs">{r.email}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      {r.attemptStatus === "aborted" ? (
                        <Badge variant="destructive">Aborted</Badge>
                      ) : (
                        <Badge variant="outline">{r.rosterStatus}</Badge>
                      )}
                      {r.score != null && <span className="tabular-nums">{r.score}</span>}
                      {/* Resume budget = 3 total (mirrors migration 119's cap). */}
                      {r.attemptId && r.attemptStatus === "aborted" && r.resumeCount < 3 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onClick={() => action(`resume-${r.studentId}`, `/api/exam/attempts/${r.attemptId}/resume`)}
                        >
                          Resume
                        </Button>
                      )}
                    </div>
                    {(r.leaveCount > 0 || r.abortCount > 0) && (
                      <span className="text-muted-foreground text-xs">
                        Alt-Tab ×{r.leaveCount} · aborted ×{r.abortCount}
                        {r.resumeCount > 0 && ` · resumed ×${r.resumeCount}`}
                      </span>
                    )}
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
