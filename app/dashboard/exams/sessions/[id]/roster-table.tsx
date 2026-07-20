"use client";

// Sortable, filterable roster grid for a sitting — every per-student detail we
// have (identity, roster + attempt status, score, progress, anti-cheat counts,
// timestamps) plus the admin Resume action. Built on the shared DataTable.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef, type Column } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, arrIncludes, type DataTableFilter } from "@/components/data-table";
import type { RosterEntry } from "@/lib/exam-query";

type RosterMeta = { onResume: (attemptId: string) => void; busy: string; questionCount: number };

// Sortable column header (ghost button + arrow) — matches the students grid.
function SortHeader<TData>({ column, label }: { column: Column<TData>; label: string }) {
  return (
    <Button
      variant="ghost"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label} <ArrowUpDown className="size-3.5" />
    </Button>
  );
}

// Local timestamp, formatted only after mount so SSR (UTC) and the client (local
// TZ) can't disagree — avoids a hydration mismatch on dates.
function TimeCell({ iso }: { iso: string | null }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    if (iso != null) {
      setText(new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }));
    }
  }, [iso]);
  if (iso == null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums whitespace-nowrap">{text || "…"}</span>;
}

const rosterStatusStyles: Record<string, string> = {
  submitted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  started: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  invited: "bg-muted text-muted-foreground",
};

export const rosterColumns: ColumnDef<RosterEntry>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column} label="Student" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.original.name ?? row.original.email ?? row.original.studentId}</span>
        <span className="text-muted-foreground truncate text-xs">{row.original.email}</span>
      </div>
    ),
  },
  {
    accessorKey: "rollNumber",
    header: ({ column }) => <SortHeader column={column} label="Roll No." />,
    cell: ({ row }) => <span className="tabular-nums">{row.original.rollNumber ?? "—"}</span>,
    meta: { label: "Roll No." },
  },
  {
    accessorKey: "rosterStatus",
    header: "Roster",
    filterFn: arrIncludes,
    cell: ({ row }) => {
      const s = row.original.rosterStatus;
      return <Badge className={rosterStatusStyles[s] ?? ""} variant="outline">{s}</Badge>;
    },
    meta: { label: "Roster status" },
  },
  {
    id: "attemptStatus",
    accessorFn: (r) => r.attemptStatus ?? "not_started",
    header: "Attempt",
    filterFn: arrIncludes,
    cell: ({ row }) => {
      const s = row.original.attemptStatus;
      if (s === "aborted") return <Badge variant="destructive">Aborted</Badge>;
      if (s == null) return <span className="text-muted-foreground text-xs">not started</span>;
      return <Badge variant="secondary">{s.replace("_", " ")}</Badge>;
    },
    meta: { label: "Attempt status" },
  },
  {
    accessorKey: "score",
    header: ({ column }) => <SortHeader column={column} label="Score" />,
    cell: ({ row }) => <span className="tabular-nums font-medium">{row.original.score ?? "—"}</span>,
    sortUndefined: "last",
  },
  {
    id: "progress",
    accessorFn: (r) => r.lastPosition ?? -1,
    header: ({ column }) => <SortHeader column={column} label="Progress" />,
    cell: ({ row, table }) => {
      const lp = row.original.lastPosition;
      const total = (table.options.meta as RosterMeta).questionCount;
      return <span className="tabular-nums whitespace-nowrap">{lp == null ? "—" : `Q${lp + 1} / ${total}`}</span>;
    },
    meta: { label: "Progress" },
  },
  {
    // Anti-cheat counts folded into one column (sort by aborts, the key signal).
    id: "antiCheat",
    accessorFn: (r) => r.abortCount,
    header: ({ column }) => <SortHeader column={column} label="Anti-cheat" />,
    cell: ({ row }) => {
      const { leaveCount, abortCount, resumeCount } = row.original;
      if (!leaveCount && !abortCount && !resumeCount) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="text-muted-foreground tabular-nums whitespace-nowrap text-xs">
          <span className="text-foreground">⇥{leaveCount}</span> · abort {abortCount}
          {resumeCount > 0 && ` · resume ${resumeCount}`}
        </span>
      );
    },
    meta: { label: "Anti-cheat (Alt-Tab · aborts · resumes)" },
  },
  {
    // Started / submitted stacked into one column.
    id: "timing",
    accessorFn: (r) => r.startedAt ?? "",
    header: ({ column }) => <SortHeader column={column} label="Timing" />,
    cell: ({ row }) => (
      <div className="flex flex-col text-xs leading-tight">
        <span className="whitespace-nowrap"><span className="text-muted-foreground">start </span><TimeCell iso={row.original.startedAt} /></span>
        <span className="whitespace-nowrap"><span className="text-muted-foreground">sub&nbsp;&nbsp;&nbsp;</span><TimeCell iso={row.original.submittedAt} /></span>
      </div>
    ),
    meta: { label: "Timing (started / submitted)" },
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row, table }) => {
      const m = table.options.meta as RosterMeta;
      const r = row.original;
      // Resume budget = 3 (mirrors migration 119). Shown only on aborted attempts.
      if (!r.attemptId || r.attemptStatus !== "aborted" || r.resumeCount >= 3) return null;
      return (
        <Button size="sm" variant="secondary" disabled={!!m.busy} onClick={() => m.onResume(r.attemptId!)}>
          Resume
        </Button>
      );
    },
  },
];

const ROSTER_STATUS_OPTIONS = ["invited", "started", "submitted"].map((v) => ({ label: v, value: v }));
const ATTEMPT_STATUS_OPTIONS = [
  { label: "Not started", value: "not_started" },
  { label: "In progress", value: "in_progress" },
  { label: "Submitted", value: "submitted" },
  { label: "Graded", value: "graded" },
  { label: "Aborted", value: "aborted" },
];
const FILTERS: DataTableFilter[] = [
  { columnId: "rosterStatus", title: "Roster", options: ROSTER_STATUS_OPTIONS },
  { columnId: "attemptStatus", title: "Attempt", options: ATTEMPT_STATUS_OPTIONS },
];

export function RosterTable({
  roster,
  sessionId,
  questionCount,
}: {
  roster: RosterEntry[];
  sessionId: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function onResume(attemptId: string) {
    setBusy(attemptId);
    const res = await fetch(`/api/exam/attempts/${attemptId}/resume`, { method: "POST" });
    setBusy("");
    if (res.ok) router.refresh();
  }

  return (
    <DataTable
      columns={rosterColumns as ColumnDef<RosterEntry, unknown>[]}
      data={roster}
      searchKey="name"
      searchPlaceholder="Search students…"
      filters={FILTERS}
      initialSorting={[{ id: "name", desc: false }]}
      meta={{ onResume, busy, questionCount } satisfies RosterMeta}
    />
  );
}
