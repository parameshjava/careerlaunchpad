"use client";

// Batches list (issue #49, Phase 3). The batch name links to the batch workspace
// (details, subjects, schedule, students — and Close lives there, so it can't be
// hit by accident from the list). Built on the shared DataTable.
import Link from "next/link";
import { Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { SortHeader, StatusBadge } from "@/components/data-table-parts";
import { formatINR } from "@/lib/fee-receipt";
import { formatDate } from "@/lib/format-date";
import { BATCH_STATUS_LABELS, type BatchListRow } from "@/lib/batch-query";

const ACTIVE = new Set(["open", "running"]);

const columns: ColumnDef<BatchListRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "Batch" },
    header: ({ column }) => <SortHeader column={column}>Batch</SortHeader>,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link href={`/dashboard/batches/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
        <span className="text-muted-foreground text-xs">{row.original.code}</span>
      </div>
    ),
  },
  {
    accessorKey: "courseName",
    header: "Course",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.courseName ?? "—"}</span>,
  },
  {
    accessorKey: "academicYear",
    meta: { label: "Year" },
    header: "Year",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.academicYear ?? "—"}</span>,
  },
  {
    accessorKey: "startDate",
    meta: { label: "Start" },
    header: ({ column }) => <SortHeader column={column}>Start</SortHeader>,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.startDate ? formatDate(row.original.startDate) : "—"}</span>
    ),
  },
  {
    accessorKey: "collegeCount",
    meta: { label: "Colleges" },
    header: ({ column }) => <SortHeader column={column}>Colleges</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.collegeCount}</span>,
  },
  {
    accessorKey: "studentCount",
    meta: { label: "Students" },
    header: ({ column }) => <SortHeader column={column}>Students</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{row.original.studentCount}</span>,
  },
  {
    accessorKey: "feeTotalPaise",
    meta: { label: "Fee" },
    header: ({ column }) => <SortHeader column={column}>Fee</SortHeader>,
    cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.feeTotalPaise)}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge tone={ACTIVE.has(row.original.status) ? "emerald" : "slate"}>
        {BATCH_STATUS_LABELS[row.original.status]}
      </StatusBadge>
    ),
  },
];

export function BatchesList({ batches }: { batches: BatchListRow[] }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {batches.length} batch{batches.length === 1 ? "" : "es"}
        </p>
        <Button asChild>
          <Link href="/dashboard/batches/new">
            <Plus /> New batch
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<BatchListRow, unknown>[]}
        data={batches}
        searchKey="name"
        searchPlaceholder="Search batches…"
      />
    </div>
  );
}
