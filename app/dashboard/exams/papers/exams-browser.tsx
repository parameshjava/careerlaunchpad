"use client";

// Client-side browse for the Exam papers list: search + college filter + sort,
// applied in memory over the server-fetched exams (small per-college set, so no
// round-trips). Active/Completed tabs stay. Built to docs/STYLE_GUIDE.md.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChartColumnIncreasing, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

// Connected folder tabs (STYLE_GUIDE): bordered; inactive = muted with a bottom
// border; active = solid brand fill with NO bottom border (connects to the page).
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

/**
 * What the signed-in user may DO here, resolved server-side and passed down.
 * College roles reach this page through exam.results.view_all — they are meant to
 * SEE their college's papers and results — but publishing results and deleting a
 * paper are platform acts (migration 178). Both were rendered unconditionally, so
 * a college admin or staff member saw buttons that 403'd on click.
 */
export type ExamCaps = { canPublishResults: boolean; canDeletePapers: boolean };

export function ExamsBrowser({
  exams,
  caps,
  initialTab = "active",
}: {
  exams: ExamCard[];
  caps: ExamCaps;
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
              ["draft", `Draft (${drafts.length})`],
              ["active", `Active (${active.length})`],
              ["closed", `Closed (${closed.length})`],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className={TAB_CLS}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="draft" className="mt-4">
          <ExamList exams={drafts} caps={caps} empty="No draft exams match." />
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <ExamList exams={active} caps={caps} empty="No active exams match. Create one with “+ Exam”." />
        </TabsContent>
        <TabsContent value="closed" className="mt-4">
          <ExamList exams={closed} caps={caps} empty="No closed exams match." />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ExamList({ exams, caps, empty }: { exams: ExamCard[]; caps: ExamCaps; empty: string }) {
  const router = useRouter();
  const [publishing, setPublishing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ExamCard | null>(null);
  const [publishError, setPublishError] = useState("");
  // Toggle student-visible results without leaving the list.
  async function togglePublish(e: ExamCard) {
    if (!e.sessionId) return;
    setPublishError("");
    setPublishing(e.sessionId);
    const res = await fetch(`/api/exam/sessions/${e.sessionId}/publish-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !e.resultsPublished }),
    });
    const data = await res.json().catch(() => ({}));
    setPublishing(null);
    if (!res.ok) {
      setPublishError(data.error ?? "Could not update results visibility.");
      return;
    }
    router.refresh();
  }

  // Throw on failure so the ConfirmDialog surfaces the error inline and keeps
  // the dialog open; success auto-closes it.
  async function confirmDelete() {
    if (!toDelete) return;
    const res = await fetch(`/api/exam/blueprints/${toDelete.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not delete the exam.");
    router.refresh();
  }

  if (exams.length === 0) {
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        {empty}
      </p>
    );
  }
  return (
    <>
    {publishError && (
      <p className="text-destructive mb-3 text-sm" role="alert">
        {publishError}
      </p>
    )}
    <ul className="divide-y rounded-md border">
      {exams.map((e) => {
        const st = status(e);
        const isDraft = e.examStatus === "draft";
        const finished = isClosed(e); // closed/graded — results exist, can't be re-run
        // Deletable only while no student has attempted it — draft, scheduled/
        // upcoming, and closed-with-nobody all qualify; anything with submissions
        // is protected.
        // Permission first, then the domain rule: a paper with attempts is
        // undeletable for everyone.
        const canDelete = caps.canDeletePapers && e.attemptCount === 0;
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
              {e.opensAt && (
                <div className="text-muted-foreground truncate text-xs">
                  {new Date(e.opensAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              )}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {/* Status badge only while not finished — on the Closed tab it's redundant. */}
              {!finished && <Badge variant={st.live ? "default" : "secondary"}>{st.text}</Badge>}

              {/* Finished exam: toggle whether students can see results. The
                  results / paper themselves live on the Session page now, so no
                  separate Results or View-paper buttons here (they resolved to
                  the same place). */}
              {finished && e.sessionId && caps.canPublishResults && (
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
              )}

              {/* Read-only viewer: the FACT still matters to them ("can my
                  students see this yet?"), only the action does not. */}
              {finished && e.sessionId && !caps.canPublishResults && e.resultsPublished && (
                <Badge variant="secondary" title="Results are visible to students">
                  <ChartColumnIncreasing className="size-4" /> published
                </Badge>
              )}

              {e.examStatus === "published" && e.sessionId && (
                <Link
                  href={`/dashboard/exams/sessions/${e.sessionId}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Session
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
                disabled={!canDelete}
                aria-hidden={!canDelete}
                tabIndex={canDelete ? undefined : -1}
                onClick={() => {
                  if (!canDelete) return;
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

    <ConfirmDialog
      open={toDelete !== null}
      onOpenChange={(o) => !o && setToDelete(null)}
      destructive
      title="Delete this exam?"
      description={
        <>
          This permanently removes{" "}
          <span className="text-foreground font-medium">{toDelete?.title}</span> and its generated
          paper. This action can&rsquo;t be undone.
        </>
      }
      confirmPhrase={toDelete?.title}
      confirmLabel="Delete exam"
      onConfirm={confirmDelete}
    />
    </>
  );
}
