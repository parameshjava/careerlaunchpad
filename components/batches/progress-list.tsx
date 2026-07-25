"use client";

// Shared renderer for batch chapter progress — subjects, each with a status and a
// list of chapters, every one a 3-state control (Not started / In progress /
// Completed). Used by both the staff Progress tab and the mentor "My teaching"
// board; each passes its own onSet* callbacks (different endpoints). Updates
// optimistically and reverts on error. Marking a chapter Completed unlocks its
// quiz for enrolled students (enforced server-side).
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProgressStatus, SubjectProgress } from "@/lib/batch-progress-query";

const STATUS_OPTIONS: { value: ProgressStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const DOT: Record<ProgressStatus, string> = {
  not_started: "bg-muted-foreground/40",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
};

function StatusSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ProgressStatus;
  onChange: (v: ProgressStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProgressStatus)} disabled={disabled}>
      <SelectTrigger className={className ?? "h-8 w-[9.5rem]"}>
        <span className="flex items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${DOT[value]}`} aria-hidden />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProgressList({
  subjects: initial,
  onSetSubject,
  onSetChapter,
  editable = true,
}: {
  subjects: SubjectProgress[];
  onSetSubject: (subjectId: string, status: ProgressStatus) => Promise<void>;
  onSetChapter: (subjectId: string, chapterId: string, status: ProgressStatus) => Promise<void>;
  editable?: boolean;
}) {
  const [subjects, setSubjects] = useState<SubjectProgress[]>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function setSubjectStatus(subjectId: string, status: ProgressStatus) {
    setError("");
    const prev = subjects;
    setSubjects((ss) => ss.map((s) => (s.subjectId === subjectId ? { ...s, progressStatus: status } : s)));
    setBusy(true);
    try {
      await onSetSubject(subjectId, status);
    } catch (e) {
      setSubjects(prev);
      setError((e as Error).message || "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function setChapterStatus(subjectId: string, chapterId: string, status: ProgressStatus) {
    setError("");
    const prev = subjects;
    setSubjects((ss) =>
      ss.map((s) =>
        s.subjectId === subjectId
          ? {
              ...s,
              chapters: s.chapters.map((c) => (c.chapterId === chapterId ? { ...c, status } : c)),
            }
          : s,
      ),
    );
    setBusy(true);
    try {
      await onSetChapter(subjectId, chapterId, status);
    } catch (e) {
      setSubjects(prev);
      setError((e as Error).message || "Could not update");
    } finally {
      setBusy(false);
    }
  }

  if (subjects.length === 0) {
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No subjects to track yet. Add subjects to the batch first.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {subjects.map((s) => {
        const done = s.chapters.filter((c) => c.status === "completed").length;
        return (
          <Card key={s.subjectId}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{s.subjectName ?? "—"}</p>
                <p className="text-muted-foreground text-xs">
                  {done} / {s.chapters.length} chapter{s.chapters.length === 1 ? "" : "s"} completed
                </p>
              </div>
              <StatusSelect
                value={s.progressStatus}
                onChange={(v) => setSubjectStatus(s.subjectId, v)}
                disabled={!editable || busy}
              />
            </CardHeader>
            <CardContent className="grid gap-2">
              {s.chapters.length === 0 ? (
                <p className="text-muted-foreground text-sm">No chapters in the syllabus for this subject.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {s.chapters.map((c) => (
                    <li
                      key={c.chapterId}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="min-w-0 break-words text-sm">{c.chapterName ?? "—"}</span>
                      <StatusSelect
                        value={c.status}
                        onChange={(v) => setChapterStatus(s.subjectId, c.chapterId, v)}
                        disabled={!editable || busy}
                        className="h-8 w-[9.5rem] shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
