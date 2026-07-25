"use client";

// The mentor "My teaching" board on /mentor: the batches → subjects → chapters a
// mentor is assigned to, each chapter a 3-state control. Marking a chapter
// Completed unlocks its quiz for the batch's students. Reads/writes
// /api/mentor/progress; the shared <ProgressList> renders + optimistically updates.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressList } from "@/components/batches/progress-list";
import type { MentorBatchProgress, ProgressStatus } from "@/lib/batch-progress-query";

const EDITABLE = new Set(["open", "running"]);

export function MentorTeachingBoard() {
  const [batches, setBatches] = useState<MentorBatchProgress[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mentor/progress")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setBatches(d.batches ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/mentor/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Could not update");
  }

  if (error)
    return (
      <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/20 px-3 py-2 text-sm">
        {error}
      </p>
    );
  if (batches === null)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  if (batches.length === 0)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-8 text-center text-sm">
        You&apos;re not assigned to any batch subjects yet. Once staff assign you, your subjects and
        chapters appear here to track.
      </p>
    );

  return (
    <div className="space-y-6">
      {batches.map((b) => {
        const editable = EDITABLE.has(b.batchStatus);
        return (
          <div key={b.batchId} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{b.batchName}</h3>
              {!editable && (
                <Badge variant="secondary">
                  {b.batchStatus === "closed" || b.batchStatus === "cancelled"
                    ? "read-only"
                    : b.batchStatus}
                </Badge>
              )}
            </div>
            <ProgressList
              subjects={b.subjects}
              editable={editable}
              onSetSubject={(subjectId, status: ProgressStatus) =>
                post({ batch_id: b.batchId, subject_id: subjectId, status })
              }
              onSetChapter={(subjectId, chapterId, status: ProgressStatus) =>
                post({ batch_id: b.batchId, subject_id: subjectId, chapter_id: chapterId, status })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
