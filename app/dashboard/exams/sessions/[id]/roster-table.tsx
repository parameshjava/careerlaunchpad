"use client";

// Sortable, filterable roster grid for a sitting — every per-student detail we
// have (identity, roster + attempt status, score, progress, anti-cheat counts,
// timestamps) plus the admin Resume action. Built on the shared DataTable.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, arrIncludes, type DataTableFilter } from "@/components/data-table";
import { SortHeader, StatusBadge, type StatusTone } from "@/components/data-table-parts";
import type { RosterEntry } from "@/lib/exam-query";

type RosterMeta = { onResume: (attemptId: string) => void; busy: string; questionCount: number };

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

const rosterStatusTones: Record<string, StatusTone> = {
  submitted: "emerald",
  started: "blue",
  invited: "slate",
};

export const rosterColumns: ColumnDef<RosterEntry>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column}>Student</SortHeader>,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.original.name ?? row.original.email ?? row.original.studentId}</span>
        <span className="text-muted-foreground truncate text-xs">{row.original.email}</span>
      </div>
    ),
  },
  {
    accessorKey: "rollNumber",
    header: ({ column }) => <SortHeader column={column}>Roll No.</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.rollNumber ?? "—"}</span>,
    meta: { label: "Roll No." },
  },
  {
    accessorKey: "rosterStatus",
    header: "Roster",
    filterFn: arrIncludes,
    cell: ({ row }) => {
      const s = row.original.rosterStatus;
      return <StatusBadge tone={rosterStatusTones[s] ?? "slate"}>{s}</StatusBadge>;
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
    header: ({ column }) => <SortHeader column={column}>Score</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums font-medium">{row.original.score ?? "—"}</span>,
    sortUndefined: "last",
  },
  {
    id: "progress",
    accessorFn: (r) => r.lastPosition ?? -1,
    header: ({ column }) => <SortHeader column={column}>Progress</SortHeader>,
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
    header: ({ column }) => <SortHeader column={column}>Anti-cheat</SortHeader>,
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
    header: ({ column }) => <SortHeader column={column}>Timing</SortHeader>,
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

  // Hide the dense Anti-cheat + Timing columns by default on phones (users can
  // re-show them from the Columns menu). Starts false so SSR and the first client
  // render agree (all columns visible → no hydration mismatch); a mount effect
  // then flips it, and the changed `key` remounts DataTable with the seeded
  // visibility applied.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  async function onResume(attemptId: string) {
    setBusy(attemptId);
    const res = await fetch(`/api/exam/attempts/${attemptId}/resume`, { method: "POST" });
    setBusy("");
    if (res.ok) router.refresh();
  }

  return (
    <DataTable
      key={isMobile ? "m" : "d"}
      columns={rosterColumns as ColumnDef<RosterEntry, unknown>[]}
      data={roster}
      searchKey="name"
      searchPlaceholder="Search students…"
      filters={FILTERS}
      initialSorting={[{ id: "name", desc: false }]}
      initialColumnVisibility={isMobile ? { antiCheat: false, timing: false } : {}}
      meta={{ onResume, busy, questionCount } satisfies RosterMeta}
    />
  );
}
