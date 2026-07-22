"use client";

// Competitive-exams list (issue #49). Rows link to the editor; the row action
// activates/deactivates an exam via PATCH { isActive }.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Power, PowerOff } from "lucide-react";

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
import type { CompetitiveExamListRow } from "@/lib/competitive-exam-query";

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

      {exams.length === 0 ? (
        <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No competitive exams yet. Add ICET, MAT, Bank PO… and author their syllabus.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exam</TableHead>
                <TableHead className="text-center">Subjects</TableHead>
                <TableHead className="text-center">Chapters</TableHead>
                <TableHead className="text-center">Courses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/dashboard/competitive-exams/${e.id}`} className="font-medium hover:underline">
                      {e.code}
                    </Link>
                    <div className="text-muted-foreground text-xs">{e.name}</div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{e.subjectCount}</TableCell>
                  <TableCell className="text-center tabular-nums">{e.chapterCount}</TableCell>
                  <TableCell className="text-center tabular-nums">{e.courseCount}</TableCell>
                  <TableCell>
                    <Badge variant={e.isActive ? "default" : "secondary"}>
                      {e.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/competitive-exams/${e.id}`}>Edit</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === e.id}
                        onClick={() => toggleActive(e)}
                      >
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
