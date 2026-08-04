"use client";

import { ColumnDef, type Table } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortHeader, StatusBadge, type StatusTone } from "@/components/data-table-parts";
import type { RegistrationSource } from "@/components/students/registration-audit";
import type { Student, StudentStage } from "@/lib/students-query";
import { deleteStudent } from "@/app/dashboard/students/actions";
import { enterImpersonation } from "@/app/impersonation/actions";

const stageTones: Record<StudentStage, StatusTone> = {
  Registered: "emerald",
  Invited: "blue",
  Imported: "violet",
};

// Origin of the record (issue #83). Short labels — this is a grid cell, so the
// full wording lives in the audit panel on the profile page.
const sourceLabels: Record<RegistrationSource, string> = {
  self: "Self",
  admin: "Staff",
  import: "Import",
  invite: "Invite",
  unknown: "—",
};

const sourceTones: Record<RegistrationSource, StatusTone> = {
  self: "emerald",
  admin: "blue",
  import: "violet",
  invite: "blue",
  unknown: "slate",
};

export const columns: ColumnDef<Student>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
    cell: ({ row }) => {
      const course = row.original.course;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{row.getValue("name") || "—"}</span>
          {course && (
            <span className="text-muted-foreground text-xs">{course}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.getValue("email")}</span>
    ),
  },
  {
    accessorKey: "college",
    header: "College",
    cell: ({ row }) => (
      <span>{row.getValue("college") || "—"}</span>
    ),
  },
  {
    accessorKey: "completeness",
    meta: { label: "Profile" },
    header: ({ column }) => <SortHeader column={column}>Profile</SortHeader>,
    // Imported/invited rows have no profile yet → sort them last, show "—".
    sortUndefined: "last",
    cell: ({ row }) => {
      const pct = row.getValue("completeness") as number | null;
      if (pct == null) return <span className="text-muted-foreground">—</span>;
      const done = pct === 100;
      return (
        <div className="flex items-center gap-2">
          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
            <div
              className={done ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-primary"}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{pct}%</span>
        </div>
      );
    },
  },
  {
    accessorKey: "stage",
    header: "Status",
    cell: ({ row }) => {
      const { stage, registrationStatus, reviewStatus } = row.original;
      // A registered student who hasn't finished the wizard is a draft, not a
      // completed registration. Show it distinctly so an empty College column on
      // an unfinished profile isn't misread as "registered without a college"
      // (the college is captured in Step 2, which drafts often haven't reached).
      if (stage === "Registered" && registrationStatus === "in_progress") {
        return <StatusBadge tone="slate">Draft</StatusBadge>;
      }
      // Sent back to the student for corrections (issue #82) — awaiting their fix,
      // distinct from a fresh submission awaiting the reviewer.
      if (stage === "Registered" && reviewStatus === "changes_requested") {
        return <StatusBadge tone="amber">Changes requested</StatusBadge>;
      }
      return <StatusBadge tone={stageTones[stage]}>{stage}</StatusBadge>;
    },
  },
  {
    // Where the record came from (issue #83) — the "self vs admin registered"
    // question, at list level. Orthogonal to Status, which is lifecycle: an
    // imported student who finishes the wizard is Registered / Imported.
    accessorKey: "source",
    meta: { label: "Source" },
    header: ({ column }) => <SortHeader column={column}>Source</SortHeader>,
    cell: ({ row }) => {
      const source = row.original.source;
      return <StatusBadge tone={sourceTones[source]}>{sourceLabels[source]}</StatusBadge>;
    },
  },
  {
    accessorKey: "joinedAt",
    meta: { label: "Joined" },
    header: ({ column }) => <SortHeader column={column}>Joined</SortHeader>,
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("joinedAt")}</span>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row, table }) => <StudentActions student={row.original} table={table} />,
  },
];

// Row action menu. Reads `canDelete` from the table meta (set server-side from
// the student.delete permission) to decide whether to offer soft-delete.
function StudentActions({ student, table }: { student: Student; table: Table<Student> }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const meta = table.options.meta as { canDelete?: boolean; canImpersonate?: boolean } | undefined;
  const canDelete = meta?.canDelete ?? false;
  // Only Registered students have an auth account (student.id is their user id).
  const canImpersonate = (meta?.canImpersonate ?? false) && student.stage === "Registered";

  async function onDelete() {
    const kind = student.stage === "Registered" ? "registered" : "intake";
    const res = await deleteStudent(student.id, kind);
    if (res.error) throw new Error(res.error);
    router.refresh();
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="size-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(student.email)}>
          Copy email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/dashboard/students/${student.id}`)}>
          View profile
        </DropdownMenuItem>
        {canImpersonate && (
          <DropdownMenuItem onClick={() => enterImpersonation(student.id)}>
            View as student
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setConfirmOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      destructive
      title="Delete student"
      description={<>Delete <span className="text-foreground font-semibold">{student.name || student.email}</span>? They&apos;ll be removed from the list.</>}
      confirmLabel="Delete"
      onConfirm={onDelete}
    />
    </>
  );
}
