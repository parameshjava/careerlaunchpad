import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarDays, GraduationCap, Layers, LibraryBig, MonitorSmartphone } from "lucide-react";

import type { StudentCourseWithBatches, StudentCourseBatch } from "@/lib/course-query";
import { formatINR } from "@/lib/fee-receipt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichContent } from "@/components/exam/RichContent";
import { EnrolButton } from "@/components/students/enrol-button";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : null);
const titleCase = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);

// Presentational course-details view (issue #49). Full-width horizontal tiles:
// a designed hero, an at-a-glance stat strip, then About, the competitive exams
// it prepares for, the syllabus, and finally the batches (dated runs) open for
// enrolment — each with its own fee and Enrol action. A COURSE is shown once;
// its batches are listed, never conflated with the course itself.
export function CourseDetailView({ course }: { course: StudentCourseWithBatches }) {
  const chapterTotal = course.syllabus.reduce((n, s) => n + s.chapters.length, 0);
  const examLine = course.exams.map((e) => e.name).join(" · ");

  const stats: { icon: typeof CalendarDays; label: string; value: string }[] = [
    { icon: Layers, label: "Subjects", value: String(course.syllabus.length) },
    { icon: BookOpen, label: "Chapters", value: String(chapterTotal) },
    { icon: GraduationCap, label: course.exams.length === 1 ? "Exam" : "Exams", value: String(course.exams.length) },
    { icon: LibraryBig, label: "Batches", value: String(course.batches.length) },
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground -mb-2 -ml-2 w-fit">
        <Link href="/student/courses">
          <ArrowLeft /> All courses
        </Link>
      </Button>

      {/* Hero tile */}
      <header className="from-primary/8 to-accent/8 via-card relative overflow-hidden rounded-xl border bg-gradient-to-br p-6 sm:p-8">
        <GraduationCap
          className="text-primary/10 pointer-events-none absolute -top-6 -right-6 hidden size-44 lg:block"
          aria-hidden
        />
        <div className="relative">
          {course.category && <Badge variant="secondary">{course.category}</Badge>}
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{course.name}</h1>
          {examLine && <p className="text-muted-foreground mt-1 text-sm">{examLine}</p>}
        </div>
      </header>

      {/* At-a-glance stat strip */}
      <Card>
        <CardContent className="grid grid-cols-2 divide-y p-0 sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 p-4">
              <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                <s.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-muted-foreground text-xs">{s.label}</div>
                <div className="truncate text-sm font-semibold">{s.value}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* About */}
      {course.description?.trim() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About this course</CardTitle>
          </CardHeader>
          <CardContent>
            <RichContent content={course.description} math={false} className="text-sm leading-relaxed" />
          </CardContent>
        </Card>
      )}

      {/* Prepares you for */}
      {course.exams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4" /> Prepares you for
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y py-0">
            {course.exams.map((ex) => (
              <div key={ex.id} className="py-4 first:pt-0 last:pb-0">
                <div className="text-sm font-semibold">
                  <span className="text-primary">{ex.code}</span>
                  <span className="text-muted-foreground font-normal"> · {ex.name}</span>
                </div>
                {ex.description?.trim() && (
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{ex.description}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Syllabus — subjects as horizontal tiles across the full width. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Syllabus</CardTitle>
          {course.syllabus.length > 0 && (
            <span className="text-muted-foreground text-xs">
              {course.syllabus.length} subjects · {chapterTotal} chapters
            </span>
          )}
        </CardHeader>
        <CardContent>
          {course.syllabus.length === 0 ? (
            <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
              The syllabus for this course hasn&apos;t been published yet. Check back soon.
            </p>
          ) : (
            // Masonry columns so a 26-chapter subject and a 4-chapter one tile
            // tightly instead of leaving a tall gap in a fixed grid.
            <div className="gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
              {course.syllabus.map((s) => (
                <div key={s.subjectId} className="bg-muted/30 rounded-lg border">
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="text-sm font-semibold">{s.name}</div>
                    {s.chapters.length > 0 && (
                      <Badge variant="secondary" className="tabular-nums">{s.chapters.length}</Badge>
                    )}
                  </div>
                  {s.chapters.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 p-3">
                      {s.chapters.map((ch) => (
                        <span
                          key={ch}
                          className="bg-background text-foreground/80 rounded-md border px-2 py-0.5 text-xs"
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground p-3 text-xs">Chapters to be announced.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batches — dated runs of this course, each enrolled into individually. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LibraryBig className="size-4" /> Available batches
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Pick a batch to enrol. Your request is sent for approval; once approved, the fee is
            payable under <Link href="/student/fees" className="text-primary hover:underline">My fees</Link>.
          </p>
        </CardHeader>
        <CardContent>
          {course.batches.length === 0 ? (
            <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
              No batches are open for enrolment right now. Check back later.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {course.batches.map((b) => (
                <BatchRow key={b.batchId} courseName={course.name} batch={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BatchRow({ courseName, batch }: { courseName: string; batch: StudentCourseBatch }) {
  const start = fmtDate(batch.startDate);
  const end = fmtDate(batch.endDate);
  const meta = [batch.academicYear, titleCase(batch.deliveryMode)].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{batch.name}</div>
          {meta && <div className="text-muted-foreground text-xs">{meta}</div>}
        </div>
        {/* The badge always reflects the BATCH's enrolment gate (open / opening
            soon / closed) — independent of whether this student is enrolled, so
            an enrolled student can still see a batch's enrolment has closed. The
            student's own state is carried by the action below. */}
        {batch.enrollmentStatus === "open" ? (
          <Badge variant="default">Enrolment open</Badge>
        ) : batch.enrollmentStatus === "not_open" ? (
          <Badge variant="secondary">Opening soon</Badge>
        ) : (
          <Badge variant="secondary">Enrolment closed</Badge>
        )}
      </div>

      {start && (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <CalendarDays className="size-3.5" /> {end ? `${start} – ${end}` : `Starts ${start}`}
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
        <div>
          <div className="text-muted-foreground text-xs">Course fee</div>
          <div className="text-lg font-semibold tabular-nums">{formatINR(batch.feePaise)}</div>
        </div>
        <EnrolButton
          batchId={batch.batchId}
          courseName={courseName}
          batchName={batch.name}
          feePaise={batch.feePaise}
          enrolled={batch.enrolled}
          enrollmentStatus={batch.enrollmentStatus}
        />
      </div>
    </div>
  );
}
