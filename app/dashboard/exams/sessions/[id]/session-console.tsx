"use client";

// Session monitoring console (issue #78). One client component owns the sitting's
// live view: status + actions, the Print paper / Print key buttons at the TOP,
// and the live Roster board that auto-refreshes every minute (plus a manual
// Refresh). The A4 paper/key preview is NOT shown on screen by default — it stays
// mounted in a hidden wrapper so usePrint can still clone it into the print
// iframe; a "Preview paper" toggle reveals it on demand.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Printer, RefreshCw } from "lucide-react";
import { LiveRoster, CellLegend } from "./live-roster";
import { ResultsCharts } from "./results-charts";
import { PaperDocument, type PaperDocumentProps } from "./paper-print";
import { ResultsDocument, type ResultsDocumentProps } from "./results-document";
import { usePrint } from "@/lib/use-print";
import type { SessionSummary, SessionLiveProgress } from "@/lib/exam-query";

// Folder-tab styling shared with the dashboard / Team hub (docs/STYLE_GUIDE.md).
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

const POLL_MS = 60_000;

export function SessionConsole({
  session,
  initialProgress,
  initialGeneratedAt,
  paper,
  results,
  resultsPublished,
  canPublish,
}: {
  session: SessionSummary;
  initialProgress: SessionLiveProgress;
  initialGeneratedAt: string;
  paper: PaperDocumentProps | null;
  results: ResultsDocumentProps | null;
  resultsPublished: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  // Two independent print documents: the question paper/key and the results sheet.
  const { printRef: paperRef, print: printPaper } = usePrint();
  const { printRef: resultsRef, print: printResults } = usePrint();

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(initialProgress);
  const [updatedAt, setUpdatedAt] = useState<number>(() => new Date(initialGeneratedAt).getTime());
  const [refreshing, setRefreshing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Auto-refresh is on by default while the sitting runs; the admin can pause it
  // (e.g. to read a row without the board reflowing under them).
  const [autoRefresh, setAutoRefresh] = useState(true);

  const ended = session.status === "closed" || session.status === "graded";

  // Pull the latest live board. Quiet on failure — the last snapshot stays.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/exam/sessions/${session.id}/live`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as SessionLiveProgress & { generatedAt: string };
        setProgress({ sections: data.sections, students: data.students });
        setUpdatedAt(new Date(data.generatedAt).getTime());
      }
    } catch {
      /* keep the previous snapshot */
    } finally {
      setRefreshing(false);
    }
  }, [session.id]);

  // Auto-refresh every minute while the sitting is live AND auto-refresh is on.
  // Once closed/graded the board is final, so there's no polling (and no Refresh
  // control at all — see the header below).
  useEffect(() => {
    if (ended || !autoRefresh) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [ended, autoRefresh, refresh]);

  // "Updated Ns ago" — a 1s tick, mounted-only so SSR and the client agree.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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
    refresh();
  }

  const togglePublish = () =>
    action("publish", `/api/exam/sessions/${session.id}/publish-results`, {
      published: !resultsPublished,
    });

  // Live countdown to close, for staff monitoring an ongoing exam.
  const opensMs = session.opensAt ? new Date(session.opensAt).getTime() : null;
  const closesMs = session.closesAt ? new Date(session.closesAt).getTime() : null;
  const fmtDur = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  let timeLabel: string | null = null;
  if (nowMs != null && !ended && closesMs != null && nowMs < closesMs) {
    timeLabel =
      opensMs != null && nowMs < opensMs
        ? `Starts in ${fmtDur(opensMs - nowMs)}`
        : `${fmtDur(closesMs - nowMs)} left`;
  }

  const updatedLabel =
    nowMs == null ? "" : (() => {
      const sec = Math.max(0, Math.round((nowMs - updatedAt) / 1000));
      if (sec < 5) return "Updated just now";
      if (sec < 60) return `Updated ${sec}s ago`;
      const min = Math.floor(sec / 60);
      return `Updated ${min}m ago`;
    })();

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Status + actions + Print paper / Print key (top) */}
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Status</span>
            <div className="flex items-center gap-3">
              {timeLabel && (
                <span className="text-muted-foreground tabular-nums text-sm font-medium">⏱ {timeLabel}</span>
              )}
              <Badge variant={session.status === "open" ? "default" : "secondary"}>{session.status}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {paper && (
              <>
                <Button size="sm" onClick={() => printPaper("paper")}>
                  <Printer /> Print paper
                </Button>
                <Button size="sm" variant="outline" onClick={() => printPaper("key")}>
                  <Printer /> Print key
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowPreview((v) => !v)}>
                  {showPreview ? "Hide preview" : "Preview paper"}
                </Button>
              </>
            )}
            {/* Results live on THIS page now — print the statement instead of
                redirecting to a separate results page (issue #78). Results actions
                appear only once the sitting is finished (closed/graded). */}
            {results && ended && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => printResults()}
                title="Print / download the Statement of Results"
              >
                <FileText /> Print Result
              </Button>
            )}
            {canPublish && ended && (
              <Button
                size="sm"
                variant={resultsPublished ? "outline" : "default"}
                disabled={busy === "publish"}
                onClick={togglePublish}
                title={
                  resultsPublished
                    ? "Results are visible to students — click to hide"
                    : "Make results visible to students"
                }
              >
                {resultsPublished ? "Unpublish results" : "Publish results"}
              </Button>
            )}
            {/* Opening is automatic; a closed sitting is final — Close is an early-stop. */}
            {!ended && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!!busy}
                onClick={() => action("close", `/api/exam/sessions/${session.id}/close`, { status: "closed" })}
              >
                Close now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Roster (live board) + Results (charts) as two tabs on this one page. */}
      <Tabs defaultValue="roster">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="roster" className={TAB_CLS}>
            Roster
          </TabsTrigger>
          <TabsTrigger value="results" className={TAB_CLS}>
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          <Card>
            <CardContent className="grid gap-3 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="text-sm font-semibold">Roster ({progress.students.length})</h2>
                  <CellLegend />
                </div>
                {/* Refresh controls only while the sitting is live — once closed
                    the board is final, so no Refresh/auto-refresh is surfaced. */}
                {!ended && (
                  <div className="flex items-center gap-3">
                    {updatedLabel && <span className="text-muted-foreground text-xs">{updatedLabel}</span>}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAutoRefresh((v) => !v)}
                      title={autoRefresh ? "Auto-refresh is on — click to pause" : "Auto-refresh is off — click to resume"}
                    >
                      {autoRefresh ? "Auto-refresh: On" : "Auto-refresh: Off"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={refreshing} onClick={refresh}>
                      <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
                    </Button>
                  </div>
                )}
              </div>
              <LiveRoster progress={progress} onRefreshed={refresh} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          {results ? (
            <ResultsCharts roster={results.roster} subjectAvgs={results.subjectAvgs} />
          ) : (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                No results yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Printable paper/key — hidden on screen by default; stays mounted so
          usePrint can clone it. The "Preview paper" toggle reveals it. */}
      {paper && (
        <div className={showPreview ? "" : "hidden"}>
          <PaperDocument ref={paperRef} {...paper} />
        </div>
      )}

      {/* Statement of Results — never shown on screen; the "Print Result" button
          clones this hidden document into the print iframe. */}
      {results && (
        <div className="hidden">
          <ResultsDocument ref={resultsRef} {...results} />
        </div>
      )}
    </div>
  );
}
