"use client";

// Live count of exams that still need attention (Open / Scheduled), shown on the
// "My exams" sidebar item so a newly-scheduled exam is visible from any student
// page. Full sidebar → a number pill; collapsed rail → a dot on the icon.
import { useUpcomingExams } from "./use-upcoming-exams";

export function ExamCountBadge({ collapsed = false }: { collapsed?: boolean }) {
  const { upcoming } = useUpcomingExams();
  const n = upcoming.length;
  if (n === 0) return null;

  if (collapsed)
    return (
      <span
        className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"
        aria-label={`${n} exam${n === 1 ? "" : "s"} needing attention`}
      />
    );

  return (
    <span
      className="bg-primary text-primary-foreground ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
      aria-label={`${n} exam${n === 1 ? "" : "s"} needing attention`}
    >
      {n}
    </span>
  );
}
