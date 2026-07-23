"use client";

// Batch "Subjects & mentors" (issue #64). Staff pick which subjects a batch
// teaches (from the course's exam syllabus) and assign one or more mentors to
// each. A class schedule is later created per (batch, subject); the subject's
// mentors get the Zoom alt-host + calendar invite. Talks only to
// /api/admin/batches/[id]/subjects.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2, Plus, Save, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import type {
  BatchSubjectRow,
  EligibleMentor,
  SyllabusSubject,
} from "@/lib/batch-subject-query";

type SubjectState = {
  subjectId: string;
  name: string;
  mentors: { mentorId: string; fullName: string | null }[];
};

export function BatchSubjectsEditor({ batchId, embedded = false }: { batchId: string; embedded?: boolean }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);

  const [batchName, setBatchName] = useState("");
  const [subjects, setSubjects] = useState<SubjectState[]>([]);
  const [syllabus, setSyllabus] = useState<SyllabusSubject[]>([]);
  const [mentors, setMentors] = useState<EligibleMentor[]>([]);
  // bumped after each Select pick so the trigger resets to its placeholder
  const [pickerNonce, setPickerNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, batchJson] = await Promise.all([
          cachedGet<{ subjects: BatchSubjectRow[]; syllabusSubjects: unknown[]; eligibleMentors: unknown[] }>(
            `/api/admin/batches/${batchId}/subjects`
          ),
          cachedGet<{ batch?: { name?: string } }>(`/api/admin/batches/${batchId}`).catch(() => ({})),
        ]);
        if (cancelled) return;

        setSubjects(
          (data.subjects as BatchSubjectRow[]).map((s) => ({
            subjectId: s.subjectId,
            name: s.name,
            mentors: s.mentors,
          }))
        );
        setSyllabus((data.syllabusSubjects ?? []) as typeof syllabus);
        setMentors((data.eligibleMentors ?? []) as typeof mentors);
        setBatchName((batchJson as { batch?: { name?: string } }).batch?.name ?? "");
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const dirtyReset = () => {
    setSaved(false);
    setFormError("");
  };

  const availableSubjects = useMemo(
    () => syllabus.filter((s) => !subjects.some((x) => x.subjectId === s.subjectId)),
    [syllabus, subjects]
  );

  const addSubject = (subjectId: string) => {
    const s = syllabus.find((x) => x.subjectId === subjectId);
    if (!s) return;
    setSubjects((prev) => [...prev, { subjectId: s.subjectId, name: s.name, mentors: [] }]);
    setPickerNonce((n) => n + 1);
    dirtyReset();
  };
  const removeSubject = (subjectId: string) => {
    setSubjects((prev) => prev.filter((s) => s.subjectId !== subjectId));
    dirtyReset();
  };

  const addMentor = useCallback(
    (subjectId: string, mentorId: string) => {
      const m = mentors.find((x) => x.mentorId === mentorId);
      if (!m) return;
      setSubjects((prev) =>
        prev.map((s) =>
          s.subjectId === subjectId && !s.mentors.some((x) => x.mentorId === mentorId)
            ? { ...s, mentors: [...s.mentors, { mentorId: m.mentorId, fullName: m.fullName }] }
            : s
        )
      );
      setPickerNonce((n) => n + 1);
      dirtyReset();
    },
    [mentors]
  );
  const removeMentor = (subjectId: string, mentorId: string) => {
    setSubjects((prev) =>
      prev.map((s) =>
        s.subjectId === subjectId
          ? { ...s, mentors: s.mentors.filter((m) => m.mentorId !== mentorId) }
          : s
      )
    );
    dirtyReset();
  };

  async function save() {
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/batches/${batchId}/subjects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjects: subjects.map((s) => ({
            subjectId: s.subjectId,
            mentorIds: s.mentors.map((m) => m.mentorId),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      // Subjects changed → drop the cached subjects (this section + the
      // schedule's subject picker read the same endpoint).
      invalidate(`/api/admin/batches/${batchId}/subjects`);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  if (loadError)
    return embedded ? (
      <p className="text-destructive py-6 text-sm">{loadError}</p>
    ) : (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/batches">Back to batches</Link>
        </Button>
      </div>
    );

  return (
    <div className={embedded ? undefined : "mx-auto max-w-3xl"}>
      {!embedded && (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Subjects &amp; mentors</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {batchName ? <span className="font-medium">{batchName}</span> : "This batch"} — choose the
              subjects taught and assign a mentor to each. Classes are then scheduled per subject.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/dashboard/batches/${batchId}`}>
              <ArrowLeft /> Back to batch
            </Link>
          </Button>
        </header>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Subjects &amp; mentors</CardTitle>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {subjects.length} subject{subjects.length === 1 ? "" : "s"} · assign a mentor to each
            </p>
          </div>
          {syllabus.length > 0 && availableSubjects.length > 0 && (
            <Select key={`add-${pickerNonce}`} value="" onValueChange={addSubject}>
              <SelectTrigger className="h-9 w-[220px]">
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="size-3.5" />
                  <SelectValue placeholder="Add a subject" />
                </span>
              </SelectTrigger>
              <SelectContent>
                {availableSubjects.map((s) => (
                  <SelectItem key={s.subjectId} value={s.subjectId}>
                    {s.name}
                    {s.examCode ? ` · ${s.examCode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {syllabus.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              This batch&apos;s course has no competitive-exam subjects yet. Add exams to the course
              under Courses first.
            </p>
          ) : subjects.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
              <BookOpen className="size-6 opacity-60" />
              No subjects yet. Add one from the picker above.
            </div>
          ) : (
            <ul className="divide-y">
              {subjects.map((s) => {
                const availableMentors = mentors.filter(
                  (m) => !s.mentors.some((x) => x.mentorId === m.mentorId)
                );
                return (
                  <li
                    key={s.subjectId}
                    className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.name}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {s.mentors.map((m) => (
                          <span
                            key={m.mentorId}
                            className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
                          >
                            {m.fullName ?? "Mentor"}
                            <button
                              type="button"
                              onClick={() => removeMentor(s.subjectId, m.mentorId)}
                              aria-label={`Remove ${m.fullName ?? "mentor"}`}
                              className="text-muted-foreground hover:text-destructive rounded-full"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}

                        {mentors.length === 0 ? (
                          <span className="text-muted-foreground text-xs">
                            No approved mentors — add under Users → Mentors.
                          </span>
                        ) : availableMentors.length > 0 ? (
                          <Select
                            key={`m-${s.subjectId}-${pickerNonce}`}
                            value=""
                            onValueChange={(v) => addMentor(s.subjectId, v)}
                          >
                            <SelectTrigger className="text-muted-foreground h-7 w-auto gap-1 rounded-full border-dashed px-2.5 text-xs">
                              <span className="inline-flex items-center gap-1">
                                <UserPlus className="size-3" />
                                <SelectValue placeholder="Assign mentor" />
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {availableMentors.map((m) => (
                                <SelectItem key={m.mentorId} value={m.mentorId}>
                                  {m.fullName ?? "Mentor"}
                                  <span className="text-muted-foreground"> · {m.email}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-xs">All mentors assigned</span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSubject(s.subjectId)}
                      aria-label={`Remove ${s.name}`}
                      className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {formError && <p className="text-destructive mt-4 text-sm">{formError}</p>}
      {saved && !formError && <p className="mt-4 text-sm text-emerald-600">Saved.</p>}

      <div className="mt-6 flex items-center justify-end gap-2">
        {!embedded && (
          <Button variant="outline" asChild>
            <Link href={`/dashboard/batches/${batchId}`}>Cancel</Link>
          </Button>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
      </div>
    </div>
  );
}
