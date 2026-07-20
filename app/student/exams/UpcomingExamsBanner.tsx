"use client";

// Global top bar (mounted once in the student shell, above the scrolling
// content) highlighting exams that need attention — so a scheduled/open exam is
// impossible to miss on ANY student page, without each page having to add it.
// Hidden when there's nothing upcoming. Single row, truncates on narrow widths
// so it never overflows.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpcomingExams } from "./use-upcoming-exams";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function UpcomingExamsBanner() {
  const pathname = usePathname();
  const { upcoming } = useUpcomingExams();

  // Hide inside an active attempt (/student/exams/<id>...) — a "go to another
  // exam" bar mid-exam is clutter. The list itself (/student/exams) still shows it.
  const inAttempt = /^\/student\/exams\/[^/]+/.test(pathname);
  if (inAttempt || upcoming.length === 0) return null;

  const nearest = upcoming[0];
  const isOpen = nearest.statusLabel === "Open";
  const count = upcoming.length;

  return (
    <div className="border-primary/20 bg-primary/5 shrink-0 border-b">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <CalendarClock className="text-primary size-5 shrink-0" />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">
            {count === 1 ? "Upcoming exam" : `${count} upcoming exams`}:
          </span>{" "}
          <span className="font-medium">{nearest.exam_title}</span>
          {nearest.opens_at && (
            <span className="text-muted-foreground"> · {fmtWhen(nearest.opens_at)}</span>
          )}
          {isOpen && (
            <span className="font-medium text-emerald-600 dark:text-emerald-400"> · Open now</span>
          )}
        </p>
        <Button size="sm" asChild className="shrink-0">
          <Link href={isOpen ? `/student/exams/${nearest.session_id}` : "/student/exams"}>
            {isOpen ? (nearest.action === "resume" ? "Resume" : "Open") : "View exams"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
