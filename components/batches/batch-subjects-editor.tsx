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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        const [subRes, batchRes] = await Promise.all([
          fetch(`/api/admin/batches/${batchId}/subjects`),
          fetch(`/api/admin/batches/${batchId}`),
        ]);
        const data = await subRes.json();
        if (!subRes.ok) throw new Error(data.error ?? "Could not load subjects");
        const batchJson = await batchRes.json().catch(() => ({}));
        if (cancelled) return;

        setSubjects(
          (data.subjects as BatchSubjectRow[]).map((s) => ({
            subjectId: s.subjectId,
            name: s.name,
            mentors: s.mentors,
          }))
        );
        setSyllabus(data.syllabusSubjects ?? []);
        setMentors(data.eligibleMentors ?? []);
        if (batchRes.ok) setBatchName(batchJson.batch?.name ?? "");
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
    return (
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

      {/* Add subject */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Add a subject</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {syllabus.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This batch&apos;s course has no competitive-exam subjects yet. Add exams to the course
              under Courses first.
            </p>
          ) : availableSubjects.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              All syllabus subjects have been added.
            </p>
          ) : (
            <div className="max-w-sm">
              <Select key={`add-${pickerNonce}`} value="" onValueChange={addSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a subject to add…" />
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned subjects */}
      {subjects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <BookOpen className="size-6 opacity-60" />
            No subjects yet. Add one above to start assigning mentors.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {subjects.map((s) => {
            const availableMentors = mentors.filter(
              (m) => !s.mentors.some((x) => x.mentorId === m.mentorId)
            );
            return (
              <Card key={s.subjectId}>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSubject(s.subjectId)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" /> Remove
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Label className="text-muted-foreground text-xs">Mentors</Label>
                  {s.mentors.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No mentors assigned yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {s.mentors.map((m) => (
                        <span
                          key={m.mentorId}
                          className="bg-muted inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-sm"
                        >
                          {m.fullName ?? "Mentor"}
                          <button
                            type="button"
                            onClick={() => removeMentor(s.subjectId, m.mentorId)}
                            aria-label={`Remove ${m.fullName ?? "mentor"}`}
                            className="text-muted-foreground hover:text-destructive rounded-full"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {mentors.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No approved mentors available. Approve mentors under Users → Mentors first.
                    </p>
                  ) : availableMentors.length > 0 ? (
                    <div className="max-w-sm">
                      <Select
                        key={`m-${s.subjectId}-${pickerNonce}`}
                        value=""
                        onValueChange={(v) => addMentor(s.subjectId, v)}
                      >
                        <SelectTrigger>
                          <span className="text-muted-foreground inline-flex items-center gap-1.5">
                            <UserPlus className="size-3.5" />
                            <SelectValue placeholder="Assign a mentor…" />
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
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
