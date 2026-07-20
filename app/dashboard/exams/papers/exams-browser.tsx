"use client";

// Client-side browse for the Exam papers list: search + college filter + sort,
// applied in memory over the server-fetched exams (small per-college set, so no
// round-trips). Active/Completed tabs stay. Built to docs/STYLE_GUIDE.md.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChartColumnIncreasing, Eye, FileText, Trash2, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExamCard } from "@/lib/exam-query";

// A paper is Closed only when nothing about it can still run: it's archived, or
// it has sittings and EVERY one of them is finished. Anything else is Open.
const isFinished = (s: string) => s === "closed" || s === "graded";
const isClosed = (e: ExamCard) =>
  e.examStatus === "archived" ||
  (e.sessionCount > 0 && e.sessionStatuses.every(isFinished));

function status(e: ExamCard): { text: string; live: boolean } {
  if (e.examStatus === "draft") return { text: "Draft", live: false };
  // Published but never scheduled — still incomplete, not live.
  if (e.examStatus === "published" && !e.opensAt) return { text: "Not scheduled", live: false };
  if (!e.sessionStatus) return { text: "Published", live: false };
  if (e.sessionStatus === "scheduled") {
    if (e.opensAt && new Date(e.opensAt) > new Date()) return { text: "Scheduled", live: false };
    return { text: "Open now", live: true };
  }
  if (e.sessionStatus === "open") return { text: "Open now", live: true };
  return { text: e.sessionStatus === "graded" ? "Results ready" : "Closed", live: false };
}

type Sort = "newest" | "oldest" | "title" | "questions";

export function ExamsBrowser({
  exams,
  initialTab = "active",
}: {
  exams: ExamCard[];
  initialTab?: "draft" | "active" | "closed";
}) {
  const [query, setQuery] = useState("");
  const [college, setCollege] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");

  const colleges = useMemo(
    () => Array.from(new Set(exams.map((e) => e.collegeName).filter(Boolean))) as string[],
    [exams],
  );

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    const list = exams.filter(
      (e) =>
        (!t ||
          e.title.toLowerCase().includes(t) ||
          (e.collegeName ?? "").toLowerCase().includes(t)) &&
        (college === "all" || e.collegeName === college),
    );
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "questions") sorted.sort((a, b) => b.totalQuestions - a.totalQuestions);
    else if (sort === "oldest") sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }, [exams, query, college, sort]);

  // An exam published but never given a start time is still incomplete — it
  // belongs with drafts, not active, since nothing can run without a schedule.
  const unscheduled = (e: ExamCard) => e.examStatus === "published" && !e.opensAt;
  // Every exam lands in exactly one tab: Draft + Active + Closed = all.
  const drafts = filtered.filter((e) => e.examStatus === "draft" || unscheduled(e));
  const closed = filtered.filter((e) => e.examStatus !== "draft" && !unscheduled(e) && isClosed(e));
  const active = filtered.filter((e) => e.examStatus !== "draft" && !unscheduled(e) && !isClosed(e));

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search by exam or college…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        {colleges.length > 1 && (
          <Select value={college} onValueChange={setCollege}>
            <SelectTrigger className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All colleges</SelectItem>
              {colleges.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="title">Title (A–Z)</SelectItem>
            <SelectItem value="questions">Most questions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue={initialTab}>
        {/* Classic folder tabs: boxed triggers on the list's bottom border; the
            active tab connects to the panel by covering the border with its bg. */}
        <TabsList
          variant="line"
          className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 rounded-none border-b p-0"
        >
          {(
            [
              // Folder-tab colors: amber = in progress, emerald = live, sky = done.
              [
                "draft",
                `Draft (${drafts.length})`,
                "bg-amber-400",
                "text-amber-700 hover:text-amber-800 data-active:border-amber-400 data-active:bg-amber-100 data-active:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 dark:data-active:border-amber-600 dark:data-active:bg-amber-900/60 dark:data-active:text-amber-100",
              ],
              [
                "active",
                `Active (${active.length})`,
                "bg-emerald-500",
                "text-emerald-700 hover:text-emerald-800 data-active:border-emerald-400 data-active:bg-emerald-100 data-active:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 dark:data-active:border-emerald-600 dark:data-active:bg-emerald-900/60 dark:data-active:text-emerald-100",
              ],
              [
                "closed",
                `Closed (${closed.length})`,
                "bg-sky-500",
                "text-sky-700 hover:text-sky-800 data-active:border-sky-400 data-active:bg-sky-100 data-active:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300 dark:data-active:border-sky-600 dark:data-active:bg-sky-900/60 dark:data-active:text-sky-100",
              ],
            ] as const
          ).map(([value, label, dot, colorCls]) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-b-0 border-transparent px-4 py-2 font-medium shadow-none after:hidden data-active:font-semibold data-active:shadow-none",
                colorCls,
              )}
            >
              <span className={cn("size-2 rounded-full", dot)} aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="draft" className="mt-4">
          <ExamList exams={drafts} empty="No draft exams match." />
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <ExamList exams={active} empty="No active exams match. Create one with “+ Exam”." />
        </TabsContent>
        <TabsContent value="closed" className="mt-4">
          <ExamList exams={closed} empty="No closed exams match." />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ExamList({ exams, empty }: { exams: ExamCard[]; empty: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ExamCard | null>(null);
  const [delError, setDelError] = useState("");
  // Type-to-confirm (AWS/GCP style): Delete stays disabled until this exactly
  // matches the exam title.
  const [confirmText, setConfirmText] = useState("");

  // Toggle student-visible results without leaving the list.
  async function togglePublish(e: ExamCard) {
    if (!e.sessionId) return;
    setPublishing(e.sessionId);
    const res = await fetch(`/api/exam/sessions/${e.sessionId}/publish-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !e.resultsPublished }),
    });
    const data = await res.json().catch(() => ({}));
    setPublishing(null);
    if (!res.ok) return alert(data.error ?? "Could not update results visibility.");
    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDelError("");
    setDeleting(toDelete.id);
    const res = await fetch(`/api/exam/blueprints/${toDelete.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(null);
    if (!res.ok) {
      setDelError(data.error ?? "Could not delete the exam.");
      return;
    }
    setToDelete(null);
    router.refresh();
  }

  const matched = confirmText === (toDelete?.title ?? "");

  if (exams.length === 0) {
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        {empty}
      </p>
    );
  }
  return (
    <>
    <ul className="divide-y rounded-md border">
      {exams.map((e) => {
        const st = status(e);
        const isDraft = e.examStatus === "draft";
        const finished = isClosed(e); // closed/graded — results exist, can't be re-run
        // Deletable only while no student has attempted it — draft, scheduled/
        // upcoming, and closed-with-nobody all qualify; anything with submissions
        // is protected.
        const canDelete = e.attemptCount === 0;
        return (
          <li
            key={e.id}
            className="hover:bg-muted/50 flex items-center justify-between gap-3 px-3 py-2.5 transition"
          >
            {/* Title/meta → open the wizard (edit/resume). */}
            <Link href={`/dashboard/exams/blueprints/${e.id}`} className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.title}</div>
              <div className="text-muted-foreground truncate text-xs">
                {e.collegeName ? `${e.collegeName} · ` : ""}
                {e.sectionCount} section{e.sectionCount === 1 ? "" : "s"} · {e.totalQuestions} Q ·{" "}
                {e.durationMinutes} min
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {/* Status badge only while not finished — on the Closed tab it's redundant. */}
              {!finished && <Badge variant={st.live ? "default" : "secondary"}>{st.text}</Badge>}

              {/* Finished exam: publish results to students + view them. */}
              {finished && e.sessionId && (
                <>
                  <Button
                    size="sm"
                    variant={e.resultsPublished ? "default" : "outline"}
                    disabled={publishing === e.sessionId}
                    onClick={() => togglePublish(e)}
                    title={
                      e.resultsPublished
                        ? "Results are visible to students — click to hide"
                        : "Make results visible to students"
                    }
                  >
                    {publishing === e.sessionId ? (
                      "…"
                    ) : e.resultsPublished ? (
                      <>
                        <ChartColumnIncreasing className="size-4" /> published ✓
                      </>
                    ) : (
                      <>
                        Publish <ChartColumnIncreasing className="size-4" />
                      </>
                    )}
                  </Button>
                  <Link
                    href={
                      e.sessionCount > 1
                        ? `/dashboard/exams/blueprints/${e.id}/consolidated`
                        : `/dashboard/exams/sessions/${e.sessionId}/results`
                    }
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Results
                  </Link>
                </>
              )}

              {e.examStatus === "published" && e.sessionId && (
                <Link
                  href={`/dashboard/exams/sessions/${e.sessionId}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Session
                </Link>
              )}
              {e.examStatus === "published" && (
                <Link
                  href={`/dashboard/exams/blueprints/${e.id}/paper`}
                  title="View paper"
                  aria-label="View paper"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Eye className="size-4" />
                  <FileText className="size-4" />
                </Link>
              )}

              {/* Edit/Resume only while not finished — a closed exam can't be re-run. */}
              {!finished && (
                <Link
                  href={`/dashboard/exams/blueprints/${e.id}`}
                  className={cn(buttonVariants({ variant: isDraft ? "default" : "outline", size: "sm" }))}
                >
                  {isDraft ? "Resume" : "Edit"}
                </Link>
              )}

              {/* Always render the slot so every row's buttons line up; hide it
                  (keeping its width) when the exam can't be deleted. */}
              <Button
                variant="ghost"
                size="sm"
                className={cn("text-destructive", !canDelete && "invisible")}
                disabled={!canDelete || deleting === e.id}
                aria-hidden={!canDelete}
                tabIndex={canDelete ? undefined : -1}
                onClick={() => {
                  if (!canDelete) return;
                  setDelError("");
                  setConfirmText("");
                  setToDelete(e);
                }}
                title="Delete exam"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>

    <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this exam?</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-3">
          <span className="bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full">
            <TriangleAlert className="size-5" />
          </span>
          <DialogDescription>
            This permanently removes{" "}
            <span className="text-foreground font-medium">{toDelete?.title}</span> and its
            generated paper. This action can’t be undone.
          </DialogDescription>
        </div>

        <div className="grid gap-2">
          <label htmlFor="confirm-delete" className="text-muted-foreground text-sm">
            To confirm, type{" "}
            <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[0.85em] font-semibold break-all">
              {toDelete?.title}
            </code>
          </label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(ev) => setConfirmText(ev.target.value)}
            placeholder="Type the exam name"
            autoComplete="off"
            autoFocus
            className={cn(matched && "border-destructive focus-visible:ring-destructive/30")}
          />
        </div>

        {delError && (
          <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
            {delError}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting !== null}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirmDelete}
            disabled={deleting !== null || !matched}
          >
            {deleting !== null ? "Deleting…" : "Delete exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
