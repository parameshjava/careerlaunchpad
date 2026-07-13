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

const isCompleted = (e: ExamCard) => e.sessionStatus === "closed" || e.sessionStatus === "graded";

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

  const active = filtered.filter((e) => !isCompleted(e));
  const completed = filtered.filter(isCompleted);

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
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <ExamList exams={active} empty="No exams match. Create one with “+ Exam”." />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <ExamList exams={completed} empty="No completed exams match." />
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
          <li className="hover:bg-muted/50 flex items-center justify-between gap-3 px-3 py-2.5 transition">
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
