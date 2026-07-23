"use client";

// Batches list (issue #49, Phase 3). Rows link to the editor; quick actions
// Close a running batch or reopen a closed one via PATCH { status }. Talks only
// to /api/admin/batches*.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Plus, RotateCcw } from "lucide-react";

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setStatus(b: BatchListRow, status: "closed" | "open") {
    setBusyId(b.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/batches/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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
          {batches.length} batch{batches.length === 1 ? "" : "es"}
        </p>
        <Button asChild>
          <Link href="/dashboard/batches/new">
            <Plus /> New batch
          </Link>
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const closable = ACTIVE.has(b.status) || b.status === "draft";
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/dashboard/batches/${b.id}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/batches/${b.id}/enrollments`}>Students</Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/batches/${b.id}/subjects`}>Subjects</Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/batches/${b.id}/schedule`}>Schedule</Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/batches/${b.id}`}>Edit</Link>
                        </Button>
                        {b.status === "closed" ? (
                          <Button variant="ghost" size="sm" disabled={busyId === b.id} onClick={() => setStatus(b, "open")}>
                            <RotateCcw /> Reopen
                          </Button>
                        ) : (
                          closable && (
                            <Button variant="ghost" size="sm" disabled={busyId === b.id} onClick={() => setStatus(b, "closed")}>
                              <Lock /> Close
                            </Button>
                          )
                        )}
                      </div>
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
