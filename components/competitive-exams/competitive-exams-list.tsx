"use client";

// Competitive-exams list (issue #49). Rows link to the editor; the row action
// activates/deactivates an exam via PATCH { isActive }. Built on the shared
// DataTable.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Power, PowerOff } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { SortHeader, StatusBadge } from "@/components/data-table-parts";
import type { CompetitiveExamListRow } from "@/lib/competitive-exam-query";

type ExamsMeta = { onToggle: (e: CompetitiveExamListRow) => void; busyId: string | null };

const columns: ColumnDef<CompetitiveExamListRow>[] = [
  {
    accessorKey: "code",
    meta: { label: "Exam" },
    header: ({ column }) => <SortHeader column={column}>Exam</SortHeader>,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link href={`/dashboard/competitive-exams/${row.original.id}`} className="font-medium hover:underline">
          {row.original.code}
        </Link>
        <span className="text-muted-foreground text-xs">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "subjectCount",
    meta: { label: "Subjects" },
    header: ({ column }) => <SortHeader column={column}>Subjects</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.subjectCount}</span>,
  },
  {
    accessorKey: "chapterCount",
    meta: { label: "Chapters" },
    header: ({ column }) => <SortHeader column={column}>Chapters</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.chapterCount}</span>,
  },
  {
    accessorKey: "courseCount",
    meta: { label: "Courses" },
    header: ({ column }) => <SortHeader column={column}>Courses</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.courseCount}</span>,
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) =>
      row.original.isActive ? (
        <StatusBadge tone="emerald">Active</StatusBadge>
      ) : (
        <StatusBadge tone="slate">Inactive</StatusBadge>
      ),
  },
  {
    id: "actions",
    enableHiding: false,
    enableSorting: false,
    cell: ({ row, table }) => {
      const e = row.original;
      const { onToggle, busyId } = table.options.meta as ExamsMeta;
      return (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/competitive-exams/${e.id}`}>Edit</Link>
          </Button>
          <Button variant="ghost" size="sm" disabled={busyId === e.id} onClick={() => onToggle(e)}>
            {e.isActive ? (
              <>
                <PowerOff /> Deactivate
              </>
            ) : (
              <>
                <Power /> Activate
              </>
            )}
          </Button>
        </div>
      );
    },
  },
];

export function CompetitiveExamsList({ exams }: { exams: CompetitiveExamListRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggleActive(e: CompetitiveExamListRow) {
    setBusyId(e.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/competitive-exams/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !e.isActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {exams.length} exam{exams.length === 1 ? "" : "s"}
        </p>
        <Button asChild>
          <Link href="/dashboard/competitive-exams/new">
            <Plus /> New exam
          </Link>
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataTable
        columns={columns as ColumnDef<CompetitiveExamListRow, unknown>[]}
        data={exams}
        searchKey="code"
        searchPlaceholder="Search exams…"
        meta={{ onToggle: toggleActive, busyId } satisfies ExamsMeta}
      />
    </div>
  );
}
