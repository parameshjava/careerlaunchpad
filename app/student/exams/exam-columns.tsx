"use client";

// Column model for the student "My exams" grids (rendered via the shared
// DataTable). The list is split into Upcoming and Past tabs, each with its own
// column set (Past adds a Score column). Status + action are precomputed per row
// in exams-list.tsx (they depend on the current time / poll), so these columns
// stay pure presentation.
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { arrIncludes } from "@/components/data-table";

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
};

export type ExamStatus = "Open" | "Scheduled" | "Submitted" | "Result ready" | "Closed";
export type ExamAction = "open" | "resume" | "result" | null;

export type ExamRow = Session & { statusLabel: ExamStatus; action: ExamAction };

// Status sets per tab (also the facet-filter options).
export const UPCOMING_STATUSES: ExamStatus[] = ["Open", "Scheduled"];
export const PAST_STATUSES: ExamStatus[] = ["Result ready", "Submitted", "Closed"];

const STATUS_STYLES: Record<ExamStatus, string> = {
  Open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "Result ready": "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  Closed: "bg-muted text-muted-foreground",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
// Trim trailing zeros: 8.00 -> "8", 7.50 -> "7.5".
function fmtScore(n: number) {
  return Number(n.toFixed(2)).toString();
}

function SortHeader({ column, label }: { column: { toggleSorting: (d?: boolean) => void; getIsSorted: () => false | "asc" | "desc" }; label: string }) {
  return (
    <Button variant="ghost" className="-ml-3 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
      {label} <ArrowUpDown className="size-3.5" />
    </Button>
  );
}

const colExam: ColumnDef<ExamRow> = {
  accessorKey: "exam_title",
  header: ({ column }) => <SortHeader column={column} label="Exam" />,
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
  accessorFn: (r) => (r.opens_at ? new Date(r.opens_at).getTime() : undefined),
  header: ({ column }) => <SortHeader column={column} label="Scheduled" />,
  sortUndefined: "last",
  cell: ({ row }) => {
    const { opens_at, closes_at } = row.original;
    if (!opens_at) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-col whitespace-nowrap">
        <span>{fmtDate(opens_at)}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {fmtTime(opens_at)}
          {closes_at ? `–${fmtTime(closes_at)}` : ""}
        </span>
      </div>
    );
  },
};

const colDuration: ColumnDef<ExamRow> = {
  accessorKey: "duration_minutes",
  header: ({ column }) => <SortHeader column={column} label="Duration" />,
  cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{row.original.duration_minutes} min</span>,
};

const colQuestions: ColumnDef<ExamRow> = {
  accessorKey: "total_questions",
  header: ({ column }) => <SortHeader column={column} label="Questions" />,
  cell: ({ row }) => <span className="tabular-nums">{row.original.total_questions}</span>,
};

const colMarks: ColumnDef<ExamRow> = {
  accessorKey: "total_marks",
  header: ({ column }) => <SortHeader column={column} label="Marks" />,
  cell: ({ row }) => <span className="tabular-nums">{row.original.total_marks}</span>,
};

const colScore: ColumnDef<ExamRow> = {
  accessorKey: "score",
  header: ({ column }) => <SortHeader column={column} label="Score" />,
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
    const s = row.original.statusLabel;
    return <Badge variant="secondary" className={STATUS_STYLES[s]}>{s}</Badge>;
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
