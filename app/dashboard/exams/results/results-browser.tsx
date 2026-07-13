"use client";

// Client-side browse for the Exam results list: search + college filter applied
// in memory over the server-fetched finished sittings (small per-college set,
// same pattern as the Exam papers browser). Built to docs/STYLE_GUIDE.md.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SessionSummary } from "@/lib/exam-query";

export function ResultsBrowser({ sessions }: { sessions: SessionSummary[] }) {
  const [query, setQuery] = useState("");
  const [college, setCollege] = useState("all");

  const colleges = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.collegeName).filter(Boolean))) as string[],
    [sessions],
  );

  // Exams with several finished sittings get a "Consolidated" link per row.
  const sittingsPerExam = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) counts.set(s.examId, (counts.get(s.examId) ?? 0) + 1);
    return counts;
  }, [sessions]);

  const filtered = sessions.filter((s) => {
    const t = query.trim().toLowerCase();
    return (
      (!t ||
        (s.examTitle ?? "").toLowerCase().includes(t) ||
        s.label.toLowerCase().includes(t) ||
        (s.collegeName ?? "").toLowerCase().includes(t)) &&
      (college === "all" || s.collegeName === college)
    );
  });

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search by exam, sitting or college…"
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
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No results yet. A sitting appears here once it is closed or graded.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {filtered.map((s) => (
            <li
              key={s.id}
              className="hover:bg-muted/50 flex flex-col gap-2 px-3 py-2.5 transition sm:flex-row sm:items-center sm:justify-between"
            >
              <Link href={`/dashboard/exams/sessions/${s.id}/results`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {s.examTitle ?? "Exam"} — {s.label}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {s.collegeName ? `${s.collegeName} · ` : ""}
                  {s.mode} · {s.rosterCount} student{s.rosterCount === 1 ? "" : "s"}
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={s.status === "graded" ? "default" : "secondary"}>
                  {s.status === "graded" ? "Results ready" : "Closed"}
                </Badge>
                {s.resultsPublished && <Badge variant="outline">Published to students</Badge>}
                <Link
                  href={`/dashboard/exams/sessions/${s.id}/results`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Results
                </Link>
                {(sittingsPerExam.get(s.examId) ?? 0) > 1 && (
                  <Link
                    href={`/dashboard/exams/blueprints/${s.examId}/consolidated`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Consolidated
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
