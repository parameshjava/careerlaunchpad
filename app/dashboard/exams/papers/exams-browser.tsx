"use client";

// Client-side browse for the Exam papers list: search + college filter + sort,
// applied in memory over the server-fetched exams (small per-college set, so no
// round-trips). Active/Completed tabs stay. Built to docs/STYLE_GUIDE.md.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
const hasResults = (e: ExamCard) => e.sessionStatuses.includes("graded");

function status(e: ExamCard): { text: string; live: boolean } {
  if (e.examStatus === "draft") return { text: "Draft", live: false };
  if (!e.sessionStatus) return { text: "Published", live: false };
  if (e.sessionStatus === "scheduled") {
    if (e.opensAt && new Date(e.opensAt) > new Date()) return { text: "Scheduled", live: false };
    return { text: "Open now", live: true };
  }
  if (e.sessionStatus === "open") return { text: "Open now", live: true };
  return { text: e.sessionStatus === "graded" ? "Results ready" : "Closed", live: false };
}

type Sort = "newest" | "oldest" | "title" | "questions";

export function ExamsBrowser({ exams }: { exams: ExamCard[] }) {
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

  // Every exam lands in exactly one tab: Draft + Active + Closed = all.
  const drafts = filtered.filter((e) => e.examStatus === "draft");
  const closed = filtered.filter((e) => e.examStatus !== "draft" && isClosed(e));
  const active = filtered.filter((e) => e.examStatus !== "draft" && !isClosed(e));

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

      <Tabs defaultValue="active">
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
                "data-active:border-amber-300 data-active:bg-amber-50 data-active:text-amber-900 dark:data-active:border-amber-800 dark:data-active:bg-amber-950/50 dark:data-active:text-amber-200",
              ],
              [
                "active",
                `Active (${active.length})`,
                "bg-emerald-500",
                "data-active:border-emerald-300 data-active:bg-emerald-50 data-active:text-emerald-900 dark:data-active:border-emerald-800 dark:data-active:bg-emerald-950/50 dark:data-active:text-emerald-200",
              ],
              [
                "closed",
                `Closed (${closed.length})`,
                "bg-sky-500",
                "data-active:border-sky-300 data-active:bg-sky-50 data-active:text-sky-900 dark:data-active:border-sky-800 dark:data-active:bg-sky-950/50 dark:data-active:text-sky-200",
              ],
            ] as const
          ).map(([value, label, dot, activeCls]) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-b-0 border-transparent px-4 py-2 text-muted-foreground shadow-none after:hidden data-active:shadow-none",
                activeCls,
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

  async function del(e: ExamCard) {
    if (!confirm(`Delete “${e.title}”? This removes the exam and its paper — this can't be undone.`))
      return;
    setDeleting(e.id);
    const res = await fetch(`/api/exam/blueprints/${e.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(null);
    if (!res.ok) return alert(data.error ?? "Could not delete the exam.");
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
    <ul className="divide-y rounded-md border">
      {exams.map((e) => {
        const st = status(e);
        const isDraft = e.examStatus === "draft";
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
              <Badge variant={st.live ? "default" : "secondary"}>{st.text}</Badge>
              {hasResults(e) && (
                <Link
                  href={
                    e.sessionCount > 1
                      ? `/dashboard/exams/blueprints/${e.id}/consolidated`
                      : `/dashboard/exams/sessions/${e.sessionId}/results`
                  }
                  className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                >
                  Results
                </Link>
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
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  View paper
                </Link>
              )}
              <Link
                href={`/dashboard/exams/blueprints/${e.id}`}
                className={cn(buttonVariants({ variant: isDraft ? "default" : "outline", size: "sm" }))}
              >
                {isDraft ? "Resume" : "Edit"}
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={deleting === e.id}
                onClick={() => del(e)}
                title="Delete exam"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
