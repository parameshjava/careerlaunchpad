"use client";

// Home banner (student insights) highlighting exams that need attention, so a
// scheduled/open exam is impossible to miss even if the student never opens the
// My Exams page. Hidden when there's nothing upcoming.
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpcomingExams } from "./use-upcoming-exams";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function UpcomingExamsBanner() {
  const { upcoming } = useUpcomingExams();
  if (upcoming.length === 0) return null;

  const nearest = upcoming[0];
  const isOpen = nearest.statusLabel === "Open";

  return (
    <div className="border-primary/20 bg-primary/5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {upcoming.length === 1
              ? "You have an upcoming exam"
              : `You have ${upcoming.length} upcoming exams`}
          </p>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">{nearest.exam_title}</span>
            {nearest.opens_at && <> · {fmtWhen(nearest.opens_at)}</>}
            {isOpen && (
              <> · <span className="font-medium text-emerald-600 dark:text-emerald-400">Open now</span></>
            )}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0">
        <Link href={isOpen ? `/student/exams/${nearest.session_id}` : "/student/exams"}>
          {isOpen ? (nearest.action === "resume" ? "Resume exam" : "Open exam") : "View exams"}
        </Link>
      </Button>
    </div>
  );
}
