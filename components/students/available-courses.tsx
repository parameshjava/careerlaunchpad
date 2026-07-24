// Student course catalogue (issue #49): one card per COURSE open for enrolment
// at the student's college — NOT per batch. The card links to the course details
// page, where the individual batches (dated runs) are listed and enrolled into.
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/fee-receipt";
import type { StudentCourseCard } from "@/lib/course-query";

function feeLabel(c: StudentCourseCard): string {
  if (c.feeToPaise <= 0) return "Fee on request";
  return c.feeFromPaise === c.feeToPaise ? formatINR(c.feeFromPaise) : `From ${formatINR(c.feeFromPaise)}`;
}

export function AvailableCourses({ courses }: { courses: StudentCourseCard[] }) {
  if (courses.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No courses are open for enrolment at your college right now. Check back later.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <Card key={c.courseId} className="hover:border-primary/40 flex flex-col transition-colors">
          <Link href={`/student/courses/${c.courseId}`} className="group flex flex-1 flex-col">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {c.category && <Badge variant="secondary">{c.category}</Badge>}
                {c.enrolled && (
                  <Badge variant="outline" className="text-primary border-primary/30 gap-1">
                    <Check className="size-3" /> Enrolled
                  </Badge>
                )}
              </div>
              <CardTitle className="group-hover:text-primary text-lg">{c.name}</CardTitle>
              {c.description && (
                <p className="text-muted-foreground line-clamp-2 text-sm">{c.description}</p>
              )}
            </CardHeader>
            <CardContent className="mt-auto grid gap-3">
              {c.examCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.examCodes.map((code) => (
                    <span key={code} className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
                      {code}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <Layers className="size-3.5" /> {c.subjectCount} subjects
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5" /> {c.chapterCount} chapters
                </span>
              </div>
              <div className="flex items-end justify-between gap-2 border-t pt-3">
                <div>
                  <div className="text-muted-foreground text-xs">Course fee</div>
                  <div className="text-base font-semibold tabular-nums">{feeLabel(c)}</div>
                </div>
                <div className="text-primary flex items-center gap-1 text-sm font-medium group-hover:underline">
                  {c.batchCount} {c.batchCount === 1 ? "batch" : "batches"} <ArrowRight className="size-4" />
                </div>
              </div>
            </CardContent>
          </Link>
        </Card>
      ))}
    </div>
  );
}
