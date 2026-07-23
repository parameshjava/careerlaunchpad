"use client";

// Batches list (issue #49, Phase 3). Each row opens the batch workspace on click
// (details, subjects, schedule, students — and Close lives there, so it can't be
// hit by accident from the list).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/lib/fee-receipt";
import { BATCH_STATUS_LABELS, type BatchListRow } from "@/lib/batch-query";

const ACTIVE = new Set(["open", "running"]);

export function BatchesList({ batches }: { batches: BatchListRow[] }) {
  const router = useRouter();

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

      {batches.length === 0 ? (
        <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No batches yet. Create one from a course to start enrolling students.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Start</TableHead>
                <TableHead className="text-center">Colleges</TableHead>
                <TableHead className="text-center">Students</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const open = () => router.push(`/dashboard/batches/${b.id}`);
                return (
                  <TableRow
                    key={b.id}
                    onClick={open}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open();
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${b.name}`}
                    className="hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer outline-none"
                  >
                    <TableCell>
                      <div className="font-medium">{b.name}</div>
                      <div className="text-muted-foreground text-xs">{b.code}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.courseName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.academicYear ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.startDate ?? "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{b.collegeCount}</TableCell>
                    <TableCell className="text-center tabular-nums">{b.studentCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(b.feeTotalPaise)}</TableCell>
                    <TableCell>
                      <Badge variant={ACTIVE.has(b.status) ? "default" : "secondary"}>
                        {BATCH_STATUS_LABELS[b.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
