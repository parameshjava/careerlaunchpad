"use client";

// Column model for the student "My exams" grids (rendered via the shared
// DataTable). The list is split into Upcoming and Past tabs, each with its own
// column set (Past adds a Score column). Status + action are precomputed per row
// in exams-list.tsx (they depend on the current time / poll), so these columns
// stay pure presentation.
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { arrIncludes } from "@/components/data-table";
import { SortHeader, StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { formatDate, formatTime } from "@/lib/format-date";

export type Section = { subject: string; num_questions: number; marks_per_question: number };

export type Session = {
  session_id: string;
  label: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  results_published: boolean;
  roster_status: "invited" | "started" | "submitted";
  exam_title: string;
  duration_minutes: number;
  negative_mark_per_wrong: number;
  total_questions: number;
  total_marks: number;
  sections: Section[];
  // Student's obtained score — only present once results are published (RPC 114).
  score: number | null;
  // Anti-cheat close state (RPC 115). `aborted` + resume_count 0 = self-resumable.
  attempt_status?: string | null;
  resume_count?: number;
};

export type ExamStatus = "Open" | "Scheduled" | "Submitted" | "Result ready" | "Closed";
export type ExamAction = "open" | "resume" | "result" | null;

export type ExamRow = Session & { statusLabel: ExamStatus; action: ExamAction };

// Status sets per tab (also the facet-filter options).
export const UPCOMING_STATUSES: ExamStatus[] = ["Open", "Scheduled"];
export const PAST_STATUSES: ExamStatus[] = ["Result ready", "Submitted", "Closed"];

const STATUS_TONES: Record<ExamStatus, StatusTone> = {
  Open: "emerald",
  Scheduled: "blue",
  Submitted: "amber",
  "Result ready": "violet",
  Closed: "slate",
};

// Trim trailing zeros: 8.00 -> "8", 7.50 -> "7.5".
function fmtScore(n: number) {
  return Number(n.toFixed(2)).toString();
}

const colExam: ColumnDef<ExamRow> = {
  accessorKey: "exam_title",
  meta: { label: "Exam" },
  header: ({ column }) => <SortHeader column={column}>Exam</SortHeader>,
  cell: ({ row }) => {
    const { exam_title, label } = row.original;
    return (
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{exam_title}</span>
        {label && label !== exam_title && (
          <span className="text-muted-foreground truncate text-xs">{label}</span>
        )}
      </div>
    );
  },
};

const colScheduled: ColumnDef<ExamRow> = {
  // Numeric timestamp so date sorting is correct; undated rows sort last.
  id: "opens_at",
  meta: { label: "Scheduled" },
  accessorFn: (r) => (r.opens_at ? new Date(r.opens_at).getTime() : undefined),
  header: ({ column }) => <SortHeader column={column}>Scheduled</SortHeader>,
  sortUndefined: "last",
  cell: ({ row }) => {
    const { opens_at, closes_at } = row.original;
    if (!opens_at) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-col whitespace-nowrap">
        <span>{formatDate(opens_at)}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatTime(opens_at)}
          {closes_at ? `–${formatTime(closes_at)}` : ""}
        </span>
      </div>
    );
  },
};

const colDuration: ColumnDef<ExamRow> = {
  accessorKey: "duration_minutes",
  meta: { label: "Duration" },
  header: ({ column }) => <SortHeader column={column}>Duration</SortHeader>,
  cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{row.original.duration_minutes} min</span>,
};

const colQuestions: ColumnDef<ExamRow> = {
  accessorKey: "total_questions",
  meta: { label: "Questions" },
  header: ({ column }) => <SortHeader column={column}>Questions</SortHeader>,
  cell: ({ row }) => <span className="tabular-nums">{row.original.total_questions}</span>,
};

const colMarks: ColumnDef<ExamRow> = {
  accessorKey: "total_marks",
  meta: { label: "Marks" },
  header: ({ column }) => <SortHeader column={column}>Marks</SortHeader>,
  cell: ({ row }) => <span className="tabular-nums">{row.original.total_marks}</span>,
};

const colScore: ColumnDef<ExamRow> = {
  accessorKey: "score",
  meta: { label: "Score" },
  header: ({ column }) => <SortHeader column={column}>Score</SortHeader>,
  sortUndefined: "last",
  cell: ({ row }) => {
    const { score, total_marks, statusLabel } = row.original;
    if (score == null)
      return (
        <span className="text-muted-foreground">
          {statusLabel === "Submitted" ? "Awaiting" : "—"}
        </span>
      );
    return (
      <span className="font-semibold tabular-nums">
        {fmtScore(score)} <span className="text-muted-foreground font-normal">/ {total_marks}</span>
      </span>
    );
  },
};

const colStatus: ColumnDef<ExamRow> = {
  accessorKey: "statusLabel",
  header: "Status",
  filterFn: arrIncludes,
  cell: ({ row }) => {
    const { statusLabel: s, attempt_status, resume_count } = row.original;
    return (
      <div>
        <StatusBadge tone={STATUS_TONES[s]}>{s}</StatusBadge>
        {attempt_status === "aborted" && (resume_count ?? 0) > 0 && (
          <span className="text-muted-foreground mt-0.5 block text-xs">Ask your administrator to resume</span>
        )}
      </div>
    );
  },
};

const colAction: ColumnDef<ExamRow> = {
  id: "action",
  header: () => <span className="sr-only">Action</span>,
  enableHiding: false,
  cell: ({ row }) => {
    const { action, session_id, roster_status } = row.original;
    if (action === "result")
      return (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/student/exams/${session_id}/result`}>View result</Link>
        </Button>
      );
    if (action === "open" || action === "resume")
      return (
        <Button size="sm" asChild>
          <Link href={`/student/exams/${session_id}`}>
            {roster_status === "started" ? "Resume" : "Open exam"}
          </Link>
        </Button>
      );
    return null;
  },
};

export const upcomingColumns: ColumnDef<ExamRow>[] = [
  colExam,
  colScheduled,
  colDuration,
  colQuestions,
  colMarks,
  colStatus,
  colAction,
];

export const pastColumns: ColumnDef<ExamRow>[] = [
  colExam,
  colScheduled,
  colDuration,
  colQuestions,
  colMarks,
  colScore,
  colStatus,
  colAction,
];
