"use client";

// Subjects & Chapters — the GLOBAL question-bank taxonomy (subjects, chapters,
// passages), shared across all colleges. Curating it needs exam.subject.manage
// (the page gates access). Question authoring lives on /dashboard/questions.
// Built to docs/STYLE_GUIDE.md: shadcn primitives + brand tokens, mobile-first.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Chapter, ChapterCounts, Passage, Subject } from "@/lib/exam-query";

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: Record<string, unknown> };
}

export function TaxonomyClient() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [counts, setCounts] = useState<ChapterCounts>({});
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

  const loadCounts = useCallback(async (sid: string) => {
    if (!sid) return setCounts({});
    const res = await fetch(`/api/exam/chapters/counts?subject_id=${sid}`);
    const data = await res.json();
    if (res.ok) setCounts(data.counts ?? {});
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);
  useEffect(() => {
    loadChapters(subjectId);
    loadPassages(subjectId);
    loadCounts(subjectId);
  }, [subjectId, loadChapters, loadPassages, loadCounts]);

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

  const selectedSubject = subjects.find((s) => s.id === subjectId);

  return (
    <div className="grid gap-6">
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* Subject: pick an existing one or add a new one */}
      <Card>
        <CardHeader>
          <CardTitle>Subject</CardTitle>
          <CardDescription>
            Pick a subject to manage its chapters and passages, or create a new one.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Select subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
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
        </CardContent>
      </Card>

      {subjectId ? (
        <>
          {/* Chapters */}
          <Card>
            <CardHeader>
              <CardTitle>
                Chapters <span className="text-muted-foreground font-normal">({chapters.length})</span>
              </CardTitle>
              <CardDescription>
                Shared syllabus for {selectedSubject?.name ?? "this subject"}. The generator spreads
                questions across chapters.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {chapters.length === 0 ? (
                <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-6 text-center text-sm">
                  No chapters yet.
                </p>
              ) : (
                <ol className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
                  {chapters.map((c, i) => {
                    const cc = counts[c.id];
                    const total = cc ? cc.very_hard + cc.hard + cc.medium + cc.easy : 0;
                    return (
                      <li
                        key={c.id}
                        className="flex items-baseline gap-2 break-inside-avoid pb-1.5 text-sm"
                      >
                        <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                          {i + 1}.
                        </span>
                        <span className="min-w-0 break-words">
                          {c.name}
                          <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
                            {total === 0
                              ? "· 0 Qs"
                              : `· VH ${cc!.very_hard} H ${cc!.hard} M ${cc!.medium} E ${cc!.easy}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
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
            </CardContent>
          </Card>

          {/* Passages */}
          <Card>
            <CardHeader>
              <CardTitle>
                Passages <span className="text-muted-foreground font-normal">({passages.length})</span>
              </CardTitle>
              <CardDescription>
                Shared reading-comprehension texts. Attach one when authoring a passage question.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {passages.length === 0 ? (
                <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-6 text-center text-sm">
                  No passages yet.
                </p>
              ) : (
                <ol className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
                  {passages.map((p, i) => (
                    <li
                      key={p.id}
                      className="flex items-baseline gap-2 break-inside-avoid pb-1.5 text-sm"
                    >
                      <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 break-words">{p.title ?? p.body.slice(0, 40)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="grid max-w-2xl gap-2">
                <Input
                  placeholder="Passage title (optional)"
                  value={newPassageTitle}
                  onChange={(e) => setNewPassageTitle(e.target.value)}
                />
                <Textarea
                  className="min-h-20"
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
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          Select or create a subject to manage its chapters and passages.
        </p>
      )}
    </div>
  );
}
