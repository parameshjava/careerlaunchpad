"use client";

// Browse & manage the GLOBAL question bank (a CareerLaunchPad asset). Subjects,
// chapters, passages and questions are shared across all colleges. Subject/chapter/
// passage "add" controls show only with exam.subject.manage; question authoring
// shows only with exam.question.manage. The heavy question form is its own route.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/exam/SearchableSelect";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Chapter,
  type Difficulty,
  type Passage,
  type QuestionListItem,
  type Subject,
} from "@/lib/exam-query";

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";
const areaClass =
  "border-input bg-background min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

const DIFF_STYLES: Record<Difficulty, string> = {
  easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  hard: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  very_hard: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const LETTERS = ["A", "B", "C", "D", "E"];

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: Record<string, unknown> };
}

export function BankClient({
  canManageSubjects,
  canManageQuestions,
}: {
  canManageSubjects: boolean;
  canManageQuestions: boolean;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [filterChapter, setFilterChapter] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [error, setError] = useState("");

  const [newSubject, setNewSubject] = useState("");
  const [newChapter, setNewChapter] = useState("");
  const [newPassageTitle, setNewPassageTitle] = useState("");
  const [newPassageBody, setNewPassageBody] = useState("");

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

  const loadPassages = useCallback(async (sid: string) => {
    if (!sid) return setPassages([]);
    const res = await fetch(`/api/exam/passages?subject_id=${sid}`);
    const data = await res.json();
    if (res.ok) setPassages(data.passages ?? []);
  }, []);

  const loadQuestions = useCallback(
    async (sid: string, chapter: string, difficulty: string) => {
      if (!sid) return setQuestions([]);
      const params = new URLSearchParams({ subject_id: sid });
      if (chapter) params.set("chapter_id", chapter);
      if (difficulty) params.set("difficulty", difficulty);
      const res = await fetch(`/api/exam/questions?${params}`);
      const data = await res.json();
      if (res.ok) setQuestions(data.questions ?? []);
    },
    [],
  );

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    setFilterChapter("");
    loadChapters(subjectId);
    loadPassages(subjectId);
  }, [subjectId, loadChapters, loadPassages]);

  useEffect(() => {
    loadQuestions(subjectId, filterChapter, filterDifficulty);
  }, [subjectId, filterChapter, filterDifficulty, loadQuestions]);

  async function createSubject() {
    setError("");
    const name = newSubject.trim();
    if (!name) return;
    const { ok, data } = await postJSON("/api/exam/subjects", { name });
    if (!ok) return setError((data.error as string) ?? "Could not create subject");
    setNewSubject("");
    await loadSubjects();
    if (data.id) setSubjectId(data.id as string);
  }

  async function createChapter() {
    setError("");
    const name = newChapter.trim();
    if (!name || !subjectId) return;
    const { ok, data } = await postJSON("/api/exam/chapters", { subject_id: subjectId, name });
    if (!ok) return setError((data.error as string) ?? "Could not create chapter");
    setNewChapter("");
    await loadChapters(subjectId);
  }

  async function createPassage() {
    setError("");
    const body = newPassageBody.trim();
    if (!body || !subjectId) return;
    const { ok, data } = await postJSON("/api/exam/passages", {
      subject_id: subjectId,
      title: newPassageTitle.trim() || null,
      body,
    });
    if (!ok) return setError((data.error as string) ?? "Could not create passage");
    setNewPassageTitle("");
    setNewPassageBody("");
    await loadPassages(subjectId);
  }

  async function archiveQuestion(id: string) {
    const { ok, data } = await postJSON(`/api/exam/questions/${id}/archive`, {});
    if (!ok) return setError((data.error as string) ?? "Could not archive");
    loadQuestions(subjectId, filterChapter, filterDifficulty);
  }

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Subject selection (global) + creation (central team only) */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <select
              id="subject"
              className={selectClass}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Select a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {canManageSubjects && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-subject">New subject</Label>
              <div className="flex gap-2">
                <Input
                  id="new-subject"
                  placeholder="e.g. Reasoning"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createSubject()}
                />
                <Button type="button" onClick={createSubject} disabled={!newSubject.trim()}>
                  Add
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {subjectId && (
        <>
          {/* Chapters (global) */}
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div>
                <h2 className="text-sm font-semibold">Chapters ({chapters.length})</h2>
                <p className="text-muted-foreground text-xs">
                  Shared syllabus. The generator spreads questions across chapters.
                </p>
              </div>
              {chapters.length === 0 ? (
                <span className="text-muted-foreground text-sm">No chapters yet.</span>
              ) : (
                <ol className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
                  {chapters.map((c, i) => (
                    <li key={c.id} className="flex items-baseline gap-2 break-inside-avoid pb-1.5 text-sm">
                      <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 break-words">{c.name}</span>
                    </li>
                  ))}
                </ol>
              )}
              {canManageSubjects && (
                <div className="flex max-w-md gap-2">
                  <Input
                    placeholder="New chapter name"
                    value={newChapter}
                    onChange={(e) => setNewChapter(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createChapter()}
                  />
                  <Button type="button" onClick={createChapter} disabled={!newChapter.trim()}>
                    Add chapter
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Passages (global) */}
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div>
                <h2 className="text-sm font-semibold">Passages ({passages.length})</h2>
                <p className="text-muted-foreground text-xs">
                  Shared reading-comprehension texts. Attach one when authoring a passage question.
                </p>
              </div>
              {passages.length === 0 ? (
                <span className="text-muted-foreground text-sm">No passages yet.</span>
              ) : (
                <ol className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
                  {passages.map((p, i) => (
                    <li key={p.id} className="flex items-baseline gap-2 break-inside-avoid pb-1.5 text-sm">
                      <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 break-words">{p.title ?? p.body.slice(0, 40)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {canManageSubjects && (
                <div className="grid max-w-2xl gap-2">
                  <Input
                    placeholder="Passage title (optional)"
                    value={newPassageTitle}
                    onChange={(e) => setNewPassageTitle(e.target.value)}
                  />
                  <textarea
                    className={areaClass}
                    placeholder="Passage text (Markdown supported)"
                    value={newPassageBody}
                    onChange={(e) => setNewPassageBody(e.target.value)}
                  />
                  <div>
                    <Button type="button" onClick={createPassage} disabled={!newPassageBody.trim()}>
                      Add passage
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Questions (global bank) */}
          {canManageQuestions && (
            <Card>
              <CardContent className="grid gap-4 pt-6">
                <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
                        <div className="grid gap-1.5">
                          <Label htmlFor="f-chapter" className="text-xs">Filter chapter</Label>
                          <SearchableSelect
                            id="f-chapter"
                            options={chapters.map((c) => ({ value: c.id, label: c.name }))}
                            value={filterChapter}
                            onChange={setFilterChapter}
                            emptyOption="All chapters"
                            searchPlaceholder="Search chapters…"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="f-diff" className="text-xs">Filter difficulty</Label>
                          <select
                            id="f-diff"
                            className={selectClass}
                            value={filterDifficulty}
                            onChange={(e) => setFilterDifficulty(e.target.value)}
                          >
                            <option value="">All difficulties</option>
                            {DIFFICULTIES.map((d) => (
                              <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button asChild disabled={chapters.length === 0}>
                        <Link href={`/dashboard/questions/new?subject=${encodeURIComponent(subjectId)}`}>
                          New question
                        </Link>
                      </Button>
                    </div>

                    {chapters.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        This subject has no chapters yet.
                      </p>
                    ) : questions.length === 0 ? (
                      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
                        No questions yet.
                      </p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {questions.map((q) => (
                          <li key={q.id} className="flex items-start justify-between gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${DIFF_STYLES[q.difficulty]}`}
                                >
                                  {DIFFICULTY_LABELS[q.difficulty]}
                                </span>
                                <span className="truncate text-sm">{q.stem}</span>
                              </div>
                              {/* Options inline; the correct one is highlighted (the answer). */}
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
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/dashboard/questions/q/${encodeURIComponent(q.id)}`}>Edit</Link>
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => archiveQuestion(q.id)}>
                                Archive
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
