"use client";

// Courses catalog list (issue #49, Phase 2). Rows link to the editor; the row
// action archives/restores a course via PATCH { status }. Talks only to
// /api/admin/courses*.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Plus } from "lucide-react";

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
import type { CourseListRow } from "@/lib/course-query";

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

      {courses.length === 0 ? (
        <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          No courses yet. Create your first course template to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Exams</TableHead>
                <TableHead className="text-center">Batches</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/dashboard/courses/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{c.slug}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.category ?? "—"}</TableCell>
                  <TableCell className="text-center tabular-nums">{c.competitiveExamCount}</TableCell>
                  <TableCell className="text-center tabular-nums">{c.batchCount}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status === "active" ? "Active" : "Archived"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/courses/${c.id}`}>Edit</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => toggleStatus(c)}
                      >
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
