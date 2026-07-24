"use client";

// Courses catalog list (issue #49, Phase 2). Rows link to the editor; the row
// action archives/restores a course via PATCH { status }. Talks only to
// /api/admin/courses*. Built on the shared DataTable.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { SortHeader, StatusBadge } from "@/components/data-table-parts";
import type { CourseListRow } from "@/lib/course-query";

type CoursesMeta = { onToggle: (c: CourseListRow) => void; busyId: string | null };

const columns: ColumnDef<CourseListRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "Course" },
    header: ({ column }) => <SortHeader column={column}>Course</SortHeader>,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link href={`/dashboard/courses/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
        <span className="text-muted-foreground text-xs">{row.original.slug}</span>
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.category ?? "—"}</span>,
  },
  {
    accessorKey: "competitiveExamCount",
    meta: { label: "Exams" },
    header: ({ column }) => <SortHeader column={column}>Exams</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.competitiveExamCount}</span>,
  },
  {
    accessorKey: "batchCount",
    meta: { label: "Batches" },
    header: ({ column }) => <SortHeader column={column}>Batches</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.batchCount}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status === "active" ? (
        <StatusBadge tone="emerald">Active</StatusBadge>
      ) : (
        <StatusBadge tone="slate">Archived</StatusBadge>
      ),
  },
  {
    id: "actions",
    enableHiding: false,
    enableSorting: false,
    cell: ({ row, table }) => {
      const c = row.original;
      const { onToggle, busyId } = table.options.meta as CoursesMeta;
      return (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/courses/${c.id}`}>Edit</Link>
          </Button>
          <Button variant="ghost" size="sm" disabled={busyId === c.id} onClick={() => onToggle(c)}>
            {c.status === "active" ? (
              <>
                <Archive /> Archive
              </>
            ) : (
              <>
                <ArchiveRestore /> Restore
              </>
            )}
          </Button>
        </div>
      );
    },
  },
];

export function CoursesList({ courses }: { courses: CourseListRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggleStatus(c: CourseListRow) {
    const next = c.status === "active" ? "archived" : "active";
    setBusyId(c.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/courses/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {courses.length} course{courses.length === 1 ? "" : "s"}
        </p>
        <Button asChild>
          <Link href="/dashboard/courses/new">
            <Plus /> New course
          </Link>
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataTable
        columns={columns as ColumnDef<CourseListRow, unknown>[]}
        data={courses}
        searchKey="name"
        searchPlaceholder="Search courses…"
        meta={{ onToggle: toggleStatus, busyId } satisfies CoursesMeta}
      />
    </div>
  );
}
