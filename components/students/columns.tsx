"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Student, StudentStage } from "@/lib/students-query";

const stageStyles: Record<StudentStage, string> = {
  Registered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Invited: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Imported: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
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
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name <ArrowUpDown className="size-3.5" />
      </Button>
    ),
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
    accessorKey: "stage",
    header: "Status",
    cell: ({ row }) => {
      const stage = row.getValue("stage") as StudentStage;
      return (
        <Badge variant="secondary" className={stageStyles[stage]}>
          {stage}
        </Badge>
      );
    },
  },
  {
    accessorKey: "joinedAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Joined <ArrowUpDown className="size-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("joinedAt")}</span>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => navigator.clipboard.writeText(row.original.email)}
          >
            Copy email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>View profile</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
