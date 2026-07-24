"use client";

// Assessment questions — browse & author the per-chapter quiz bank. Mirrors the
// exam Questions list but reads /api/assessment/questions; subjects & chapters
// come from the shared taxonomy (/api/exam/{subjects,chapters}). Needs
// exam.question.manage (the page gates access). Built to docs/STYLE_GUIDE.md.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/exam/SearchableSelect";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Chapter, type Difficulty, type Subject } from "@/lib/exam-query";
import { type AssessmentQuestionListItem } from "@/lib/assessment-query";

// Traffic-light difficulty coding (categorical status, not brand color).
const DIFF_STYLES: Record<Difficulty, string> = {
  easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  hard: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  very_hard: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const LETTERS = ["A", "B", "C", "D", "E"];
const PAGE_SIZE = 20;

export function AssessmentQuestionsClient() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<AssessmentQuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filterChapter, setFilterChapter] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const loadSubjects = useCallback(async () => {
    const res = await fetch("/api/exam/subjects");
    const data = await res.json();
    if (res.ok) setSubjects(data.subjects ?? []);
    else setError(data.error ?? "Failed to load subjects");
  }, []);

  const loadChapters = useCallback(async (sid: string) => {
    if (!sid) return setChapters([]);
    const res = await fetch(`/api/exam/chapters?subject_id=${sid}`);
    const data = await res.json();
    if (res.ok) setChapters(data.chapters ?? []);
  }, []);

  const loadQuestions = useCallback(
    async (sid: string, chapter: string, difficulty: string, pageNum: number) => {
      if (!sid) {
        setQuestions([]);
        setTotal(0);
        return;
      }
      const params = new URLSearchParams({
        subject_id: sid,
        page: String(pageNum),
        page_size: String(PAGE_SIZE),
      });
      if (chapter) params.set("chapter_id", chapter);
      if (difficulty) params.set("difficulty", difficulty);
      const res = await fetch(`/api/assessment/questions?${params}`);
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.questions ?? []);
        setTotal(data.total ?? 0);
      }
    },
    [],
  );

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);
  useEffect(() => {
    loadChapters(subjectId);
  }, [subjectId, loadChapters]);
  useEffect(() => {
    loadQuestions(subjectId, filterChapter, filterDifficulty, page);
  }, [subjectId, filterChapter, filterDifficulty, page, loadQuestions]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function archiveQuestion(id: string) {
    const res = await fetch(`/api/assessment/questions/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError((data.error as string) ?? "Could not archive");
    loadQuestions(subjectId, filterChapter, filterDifficulty, page);
  }

  return (
    <div className="grid gap-6">
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subject</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Select subject</Label>
            <Select
              value={subjectId}
              onValueChange={(v) => {
                setSubjectId(v);
                setFilterChapter("");
                setPage(1);
              }}
            >
              <SelectTrigger id="subject" className="w-full">
                <SelectValue placeholder="Select a subject…" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {subjectId && (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="f-chapter" className="text-xs">
                    Filter chapter
                  </Label>
                  <SearchableSelect
                    id="f-chapter"
                    options={chapters.map((c) => ({ value: c.id, label: c.name }))}
                    value={filterChapter}
                    onChange={(v) => {
                      setFilterChapter(v);
                      setPage(1);
                    }}
                    emptyOption="All chapters"
                    searchPlaceholder="Search chapters…"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="f-diff" className="text-xs">
                    Filter difficulty
                  </Label>
                  <Select
                    value={filterDifficulty || "all"}
                    onValueChange={(v) => {
                      setFilterDifficulty(v === "all" ? "" : v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="f-diff" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All difficulties</SelectItem>
                      {DIFFICULTIES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {DIFFICULTY_LABELS[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild disabled={chapters.length === 0}>
                  <Link
                    href={`/dashboard/assessment-questions/new?subject=${encodeURIComponent(subjectId)}`}
                  >
                    New question
                  </Link>
                </Button>
              </div>
            </div>

            {chapters.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                This subject has no chapters yet — add them under <b>Subjects &amp; Chapters</b> first.
              </p>
            ) : questions.length === 0 ? (
              <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
                No questions yet.
              </p>
            ) : (
              <>
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>
                    {total} question{total === 1 ? "" : "s"}
                    {filterChapter || filterDifficulty ? " (filtered)" : ""}
                  </span>
                  {totalPages > 1 && (
                    <span>
                      Page {page} of {totalPages}
                    </span>
                  )}
                </div>
                <ul className="divide-y rounded-md border">
                  {questions.map((q) => (
                    <li key={q.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${DIFF_STYLES[q.difficulty]}`}
                          >
                            {DIFFICULTY_LABELS[q.difficulty]}
                          </span>
                          <span className="min-w-0 break-words text-sm">{q.stem}</span>
                        </div>
                        <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-0.5 text-xs">
                          {q.options.map((o, i) => (
                            <span
                              key={i}
                              className={
                                o.isCorrect
                                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                  : ""
                              }
                            >
                              {LETTERS[i]}. {o.label}
                              {o.isCorrect ? " ✓" : ""}
                            </span>
                          ))}
                          <span className="text-muted-foreground/70">· {q.chapterName ?? "—"}</span>
                          {q.source && (
                            <span className="text-muted-foreground/70">
                              · {q.source}
                              {q.sourceYear ? ` (${q.sourceYear})` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/dashboard/assessment-questions/q/${encodeURIComponent(q.id)}`}
                          >
                            Edit
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => archiveQuestion(q.id)}>
                          Archive
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
