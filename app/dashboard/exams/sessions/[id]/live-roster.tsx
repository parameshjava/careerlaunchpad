"use client";

// Live monitoring board for a sitting (issue #78). A per-student × per-subject
// matrix: each cell shows attempted / marked-for-review / correct, and the Total
// column the student's correct-answer total. The parent (SessionConsole) owns
// the 60-second polling + manual Refresh; this component only renders the matrix
// and offers the admin Resume action for aborted attempts. The table scrolls
// horizontally inside its own container so the page never scrolls sideways on
// phones.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { cn } from "@/lib/utils";
import type { SessionLiveProgress, LiveStudentRow } from "@/lib/exam-query";

const attemptTone: Record<string, StatusTone> = {
  submitted: "emerald",
  graded: "emerald",
  in_progress: "blue",
  aborted: "rose",
};

function AttemptBadge({ row }: { row: LiveStudentRow }) {
  const s = row.attemptStatus;
  if (s == null)
    return <span className="text-muted-foreground text-xs">not started</span>;
  return <StatusBadge tone={attemptTone[s] ?? "slate"}>{s.replace("_", " ")}</StatusBadge>;
}

// The three live counts for one subject: attempted (ink) / marked (amber) / correct (emerald).
function Cell({ cell }: { cell: { total: number; attempted: number; marked: number; correct: number } }) {
  return (
    <span className="tabular-nums whitespace-nowrap text-sm">
      <span className="text-foreground font-medium" title="Attempted">
        {cell.attempted}
      </span>
      <span className="text-muted-foreground"> / </span>
      <span className="text-amber-600 dark:text-amber-500" title="Marked for review">
        {cell.marked}
      </span>
      <span className="text-muted-foreground"> / </span>
      <span className="font-semibold text-emerald-600 dark:text-emerald-500" title="Correct">
        {cell.correct}
      </span>
    </span>
  );
}

export function LiveRoster({
  progress,
  onRefreshed,
}: {
  progress: SessionLiveProgress;
  onRefreshed: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const { sections, students } = progress;

  async function onResume(attemptId: string) {
    setBusy(attemptId);
    const res = await fetch(`/api/exam/attempts/${attemptId}/resume`, { method: "POST" });
    setBusy("");
    if (res.ok) {
      router.refresh();
      onRefreshed();
    }
  }

  if (students.length === 0) {
    return <p className="text-muted-foreground text-sm">No students assigned yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40 border-b text-left">
            <th className="text-muted-foreground w-8 px-2 py-1.5 text-xs font-medium">#</th>
            <th className="text-muted-foreground px-2 py-1.5 text-xs font-medium">Student</th>
            {sections.map((s) => (
              <th key={s.sectionId} className="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium">
                <div className="whitespace-nowrap">{s.subject}</div>
                <div className="text-muted-foreground/70 font-normal">/ {s.total} Q</div>
              </th>
            ))}
            <th className="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium">Total</th>
            <th className="w-0 px-1 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {students.map((st, i) => {
            const canResume = st.attemptId && st.attemptStatus === "aborted" && st.resumeCount < 3;
            return (
              <tr key={st.studentId} className="hover:bg-muted/30 border-b last:border-0">
                <td className="text-muted-foreground px-2 py-1.5 tabular-nums align-middle">{i + 1}</td>
                <td className="px-2 py-1.5 align-middle">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium">
                      {st.name ?? st.email ?? st.studentId}
                    </span>
                    {st.rollNumber && (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{st.rollNumber}</span>
                    )}
                    <span className="shrink-0">
                      <AttemptBadge row={st} />
                    </span>
                  </div>
                </td>
                {sections.map((s) => (
                  <td key={s.sectionId} className="px-2 py-1.5 text-center align-middle">
                    <Cell cell={st.perSection[s.sectionId] ?? { total: s.total, attempted: 0, marked: 0, correct: 0 }} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center align-middle">
                  <span className="tabular-nums whitespace-nowrap">
                    <span className="font-bold text-emerald-600 dark:text-emerald-500">{st.totalCorrect}</span>
                    <span className="text-muted-foreground text-xs"> / {st.totalQuestions}</span>
                  </span>
                </td>
                <td className="px-1 py-1.5 align-middle">
                  {canResume && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      disabled={!!busy}
                      onClick={() => onResume(st.attemptId!)}
                    >
                      Resume
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// A small colour legend for the three-number cells, shown in the roster header.
export function CellLegend({ className }: { className?: string }) {
  return (
    <div className={cn("text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      <span className="text-foreground font-medium">Attempted</span>
      <span aria-hidden>/</span>
      <span className="text-amber-600 dark:text-amber-500 font-medium">Marked for review</span>
      <span aria-hidden>/</span>
      <span className="text-emerald-600 dark:text-emerald-500 font-semibold">Correct</span>
    </div>
  );
}
