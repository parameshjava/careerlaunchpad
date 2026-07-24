"use client";

// Progress tab of the batch workspace: staff/admin drive each subject/chapter
// through Not started → In progress → Completed. Completing a chapter unlocks its
// quiz for enrolled students. Reads/writes /api/admin/batches/[id]/progress; the
// shared <ProgressList> does the rendering + optimistic updates.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import { ProgressList } from "@/components/batches/progress-list";
import type { ProgressStatus, SubjectProgress } from "@/lib/batch-progress-query";

export function BatchProgressEditor({ batchId, embedded }: { batchId: string; embedded?: boolean }) {
  const [subjects, setSubjects] = useState<SubjectProgress[] | null>(null);
  const [error, setError] = useState("");

  const url = `/api/admin/batches/${batchId}/progress`;

  useEffect(() => {
    let cancelled = false;
    cachedGet<{ subjects: SubjectProgress[] }>(url)
      .then((d) => {
        if (!cancelled) setSubjects(d.subjects ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Could not update");
    invalidate(url);
  }

  const body = error ? (
    <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
      {error}
    </p>
  ) : subjects === null ? (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </p>
  ) : (
    <ProgressList
      subjects={subjects}
      onSetSubject={(subjectId, status: ProgressStatus) => post({ subject_id: subjectId, status })}
      onSetChapter={(subjectId, chapterId, status: ProgressStatus) =>
        post({ subject_id: subjectId, chapter_id: chapterId, status })
      }
    />
  );

  if (embedded) return body;
  return <div className="mx-auto max-w-3xl">{body}</div>;
}
