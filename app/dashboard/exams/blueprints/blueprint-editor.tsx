"use client";

// Build or edit an exam blueprint. Each section picks a subject, a question
// count, the easy/medium/hard/very-hard percentage mix (must sum to 100), and an
// optional per-chapter quota (must sum to 100). Saves through /api/exam/blueprints.
// In edit mode it also runs the feasibility check and publishes.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Blueprint,
  type Chapter,
  type Subject,
} from "@/lib/exam-query";
import { ExamStaffPicker } from "./exam-staff-picker";

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

type QuotaRow = { chapterId: string; pct: number };
type SectionState = {
  subjectId: string;
  numQuestions: number;
  marksPerQuestion: number;
  easy: number;
  medium: number;
  hard: number;
  veryHard: number;
  useQuota: boolean;
  quota: QuotaRow[];
};

const emptySection = (): SectionState => ({
  subjectId: "",
  numQuestions: 10,
  marksPerQuestion: 1,
  easy: 40,
  medium: 30,
  hard: 20,
  veryHard: 10,
  useQuota: false,
  quota: [],
});

type Shortfall = {
  subject_id: string;
  chapter_id: string;
  difficulty: string;
  required: number;
  available: number;
};

export function BlueprintEditor({
  blueprint,
  collegeId,
}: {
  blueprint?: Blueprint;
  collegeId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(blueprint);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<string, Chapter[]>>({});

  const [title, setTitle] = useState(blueprint?.title ?? "");
  const [duration, setDuration] = useState(blueprint?.durationMinutes ?? 60);
  const [negative, setNegative] = useState(blueprint?.negativeMarkPerWrong ?? 0);
  const [shuffleQuestions, setShuffleQuestions] = useState(blueprint?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(blueprint?.shuffleOptions ?? true);
  const [sections, setSections] = useState<SectionState[]>(
    blueprint
      ? blueprint.sections.map((s) => ({
          subjectId: s.subjectId,
          numQuestions: s.numQuestions,
          marksPerQuestion: s.marksPerQuestion,
          easy: s.pctEasy,
          medium: s.pctMedium,
          hard: s.pctHard,
          veryHard: s.pctVeryHard,
          useQuota: s.chapterQuota.length > 0,
          quota: s.chapterQuota.map((q) => ({ chapterId: q.chapterId, pct: q.pct })),
        }))
      : [emptySection()],
  );

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>(blueprint?.status ?? "draft");
  const [error, setError] = useState("");
  const [feasibility, setFeasibility] = useState<{ ok: boolean; shortfalls: Shortfall[] } | null>(null);
  // Snapshot of the last-saved form, to detect unsaved changes (dirty).
  const [savedFp, setSavedFp] = useState<string | null>(null);

  useEffect(() => {
    // Subjects are global (the bank is shared); the blueprint's college is only
    // used when creating the exam itself.
    fetch("/api/exam/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => {});
  }, []);

  const loadChapters = useCallback(
    async (sid: string) => {
      if (!sid || chaptersBySubject[sid]) return;
      const res = await fetch(`/api/exam/chapters?subject_id=${sid}`);
      const data = await res.json();
      if (res.ok) setChaptersBySubject((prev) => ({ ...prev, [sid]: data.chapters ?? [] }));
    },
    [chaptersBySubject],
  );

  // Preload chapters for sections that already use a quota (edit mode).
  useEffect(() => {
    sections.forEach((s) => {
      if (s.useQuota && s.subjectId) loadChapters(s.subjectId);
    });
  }, [sections, loadChapters]);

  function update(i: number, patch: Partial<SectionState>) {
    setSections((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setFeasibility(null);
  }

  function mixSum(s: SectionState) {
    return s.easy + s.medium + s.hard + s.veryHard;
  }
  function quotaSum(s: SectionState) {
    return s.quota.reduce((a, q) => a + (q.pct || 0), 0);
  }

  function buildBody() {
    return {
      title,
      college_id: collegeId, // used on create; ignored on PATCH
      duration_minutes: duration,
      negative_mark_per_wrong: negative,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      sections: sections.map((s) => ({
        subject_id: s.subjectId,
        num_questions: s.numQuestions,
        marks_per_question: s.marksPerQuestion,
        difficulty_mix: { easy: s.easy, medium: s.medium, hard: s.hard, very_hard: s.veryHard },
        chapter_quota: s.useQuota ? s.quota.filter((q) => q.chapterId) : undefined,
      })),
    };
  }

  // Fingerprint of the meaningful form fields → drives the dirty / can-save state.
  const formFp = () =>
    JSON.stringify({ title, duration, negative, shuffleQuestions, shuffleOptions, sections });
  const currentFp = formFp();
  // Baseline = the form as first loaded (the saved blueprint).
  useEffect(() => {
    setSavedFp(formFp());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dirty = savedFp !== null && currentFp !== savedFp;
  const busy = saving || publishing || checking;
  const canSave = !busy && (editing ? dirty : title.trim().length > 0);

  async function save(): Promise<string | null> {
    if (!canSave) return null;
    const fp = currentFp;
    setError("");
    setSaving(true);
    try {
      const url = editing ? `/api/exam/blueprints/${blueprint!.id}` : "/api/exam/blueprints";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors as string[])?.join("; ") || data.error || "Could not save");
        return null;
      }
      if (!editing && data.id) {
        router.push(`/dashboard/exams/blueprints/${data.id}`);
        router.refresh();
        return data.id as string;
      }
      setSavedFp(fp); // changes now saved → clears dirty
      router.refresh();
      return blueprint!.id;
    } finally {
      setSaving(false);
    }
  }

  async function runFeasibility() {
    if (!editing || busy) return;
    setError("");
    setChecking(true);
    try {
      const res = await fetch(`/api/exam/blueprints/${blueprint!.id}/feasibility`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Feasibility check failed");
      setFeasibility({ ok: data.ok, shortfalls: data.shortfalls ?? [] });
    } finally {
      setChecking(false);
    }
  }

  async function publish() {
    if (!editing || busy || status === "published" || dirty) return;
    setError("");
    setPublishing(true);
    try {
      const res = await fetch(`/api/exam/blueprints/${blueprint!.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not publish");
        if (data.shortfalls) setFeasibility({ ok: false, shortfalls: data.shortfalls });
        return;
      }
      setStatus("published");
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="grid gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Exam-level fields */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ICET Mock — Batch 2026" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input id="duration" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="negative">Negative mark per wrong</Label>
            <Input id="negative" type="number" min={0} step="0.25" value={negative} onChange={(e) => setNegative(Number(e.target.value))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} />
            Shuffle question order
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} />
            Shuffle option order
          </label>
        </CardContent>
      </Card>

      {/* Sections */}
      {sections.map((s, i) => {
        const sum = mixSum(s);
        const chapters = chaptersBySubject[s.subjectId] ?? [];
        const qSum = quotaSum(s);
        return (
          <Card key={i}>
            <CardContent className="grid gap-4 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Section {i + 1}</h2>
                {sections.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => setSections((p) => p.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>Subject</Label>
                  <select
                    className={selectClass}
                    value={s.subjectId}
                    onChange={(e) => {
                      update(i, { subjectId: e.target.value, quota: [] });
                      loadChapters(e.target.value);
                    }}
                  >
                    <option value="">Select…</option>
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Questions</Label>
                  <Input type="number" min={1} value={s.numQuestions} onChange={(e) => update(i, { numQuestions: Number(e.target.value) })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Marks each</Label>
                  <Input type="number" min={0} step="0.25" value={s.marksPerQuestion} onChange={(e) => update(i, { marksPerQuestion: Number(e.target.value) })} />
                </div>
              </div>

              {/* Difficulty mix */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Difficulty mix (%)</Label>
                  <span className={`text-xs ${sum === 100 ? "text-muted-foreground" : "text-destructive"}`}>
                    sum {sum}{sum !== 100 ? " — must be 100" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["easy", "medium", "hard", "veryHard"] as const).map((key, di) => (
                    <div key={key} className="grid gap-1">
                      <Label className="text-xs">{DIFFICULTY_LABELS[DIFFICULTIES[di]]}</Label>
                      <Input type="number" min={0} max={100} value={s[key]} onChange={(e) => update(i, { [key]: Number(e.target.value) } as Partial<SectionState>)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional per-chapter quota */}
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={s.useQuota}
                    onChange={(e) => {
                      update(i, { useQuota: e.target.checked });
                      if (e.target.checked) loadChapters(s.subjectId);
                    }}
                  />
                  Set per-chapter quota (otherwise spread evenly across chapters)
                </label>
                {s.useQuota && (
                  <div className="mt-2 grid gap-2">
                    {s.quota.map((q, qi) => (
                      <div key={qi} className="flex items-center gap-2">
                        <select
                          className={selectClass}
                          value={q.chapterId}
                          onChange={(e) =>
                            update(i, { quota: s.quota.map((x, j) => (j === qi ? { ...x, chapterId: e.target.value } : x)) })
                          }
                        >
                          <option value="">Select chapter…</option>
                          {chapters.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="w-24"
                          value={q.pct}
                          onChange={(e) =>
                            update(i, { quota: s.quota.map((x, j) => (j === qi ? { ...x, pct: Number(e.target.value) } : x)) })
                          }
                        />
                        <Button variant="ghost" size="sm" onClick={() => update(i, { quota: s.quota.filter((_, j) => j !== qi) })}>
                          ✕
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => update(i, { quota: [...s.quota, { chapterId: "", pct: 0 }] })}>
                        Add chapter
                      </Button>
                      <span className={`text-xs ${qSum === 100 ? "text-muted-foreground" : "text-destructive"}`}>
                        sum {qSum}{qSum !== 100 ? " — must be 100" : ""}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div>
        <Button variant="outline" onClick={() => setSections((p) => [...p, emptySection()])}>
          Add section
        </Button>
      </div>

      {/* Feasibility result */}
      {feasibility && (
        <Card>
          <CardContent className="pt-6">
            {feasibility.ok ? (
              <p className="text-sm text-green-600">The question bank can satisfy this blueprint.</p>
            ) : (
              <div className="grid gap-1 text-sm">
                <p className="text-destructive font-medium">Shortfalls — add more questions:</p>
                {feasibility.shortfalls.map((sf, k) => (
                  <p key={k} className="text-muted-foreground">
                    {subjectName(sf.subject_id)} · {sf.difficulty}: need {sf.required}, have {sf.available}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editing && <ExamStaffPicker examId={blueprint!.id} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!canSave}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create blueprint"}
        </Button>
        {editing && (
          <>
            <Button variant="outline" onClick={runFeasibility} disabled={busy}>
              {checking ? "Checking…" : "Check feasibility"}
            </Button>
            <Button
              variant="secondary"
              onClick={publish}
              disabled={busy || status === "published" || dirty}
            >
              {publishing ? "Publishing…" : status === "published" ? "Published" : "Publish"}
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/exams/blueprints/${blueprint!.id}/sessions`}>Sittings</Link>
            </Button>
          </>
        )}
        {editing && dirty && (
          <span className="text-muted-foreground text-xs">Unsaved changes</span>
        )}
        {editing && status === "published" && !dirty && (
          <span className="text-xs text-green-600">Published</span>
        )}
      </div>
    </div>
  );
}
