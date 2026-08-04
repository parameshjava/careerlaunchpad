// "My batches" — a focus card plus a compact list. A server component; nothing here
// is interactive beyond links.
//
// WHY THIS SHAPE
//   The first cut gave every enrolment an identical tall card, so an active batch and
//   a cancelled one from last year read at the same weight, "SUBJECTS & WHO TEACHES
//   THEM" repeated on all of them, and on a desktop it was one narrow column inside a
//   full-width container.
//
//   Now the page answers one question first — what am I studying right now — with a
//   single focus card carrying the only things a student checks repeatedly: how far
//   the syllabus has come, and when the next class is. Everything else is one row
//   each. Subjects and mentors moved to the batch detail page, which is where a
//   student goes when they want that level of detail.
import Link from "next/link";
import { CalendarClock, ChevronRight, ClipboardList, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { formatDate, formatDateTime } from "@/lib/format-date";
import type { MyBatch } from "@/lib/student-batches-query";

const ENROLLMENT_LABEL: Record<MyBatch["enrollmentStatus"], string> = {
  pending: "Awaiting approval",
  active: "Enrolled",
  completed: "Completed",
  cancelled: "Not enrolled",
};

const STATUS_TONE: Record<MyBatch["enrollmentStatus"], StatusTone> = {
  active: "emerald",
  pending: "amber",
  completed: "blue",
  cancelled: "rose",
};

const MODE_LABEL: Record<string, string> = {
  online: "Online",
  offline: "In person",
  hybrid: "Hybrid",
};

export function MyBatches({ batches }: { batches: MyBatch[] }) {
  if (batches.length === 0)
    return (
      <div className="text-muted-foreground bg-muted/40 grid gap-3 rounded-lg border px-4 py-10 text-center text-sm">
        <p>You&apos;re not in any batch yet.</p>
        <Button asChild size="sm" className="justify-self-center">
          <Link href="/student/courses">Browse courses</Link>
        </Button>
      </div>
    );

  // The focus batch is the one being taught: active first, then a pending enrolment
  // (still the batch they're waiting on), preferring the one furthest along.
  const live = batches.filter((b) => b.enrollmentStatus === "active");
  const pending = batches.filter((b) => b.enrollmentStatus === "pending");
  const pool = live.length > 0 ? live : pending;
  const focus =
    pool.length > 0
      ? [...pool].sort((a, b) => b.chaptersCompleted - a.chaptersCompleted)[0]
      : null;

  const alsoEnrolled = batches.filter(
    (b) => b !== focus && (b.enrollmentStatus === "active" || b.enrollmentStatus === "pending"),
  );
  const earlier = batches.filter(
    (b) => b !== focus && (b.enrollmentStatus === "completed" || b.enrollmentStatus === "cancelled"),
  );

  return (
    <div className="grid gap-8">
      {focus && <FocusCard batch={focus} />}

      {alsoEnrolled.length > 0 && (
        <Section title="Also enrolled" batches={alsoEnrolled} />
      )}
      {earlier.length > 0 && <Section title="Earlier" batches={earlier} />}
    </div>
  );
}

function FocusCard({ batch: b }: { batch: MyBatch }) {
  const pct = b.chaptersTotal > 0 ? Math.round((100 * b.chaptersCompleted) / b.chaptersTotal) : null;
  const facts = [b.courseName, b.academicYear, b.deliveryMode ? MODE_LABEL[b.deliveryMode] ?? b.deliveryMode : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="border-primary/40">
      <CardContent className="grid gap-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-primary text-xs font-bold tracking-wider uppercase">
              {b.enrollmentStatus === "active" ? "Studying now" : "Waiting to start"}
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight break-words">{b.batchName}</h2>
            {facts && <p className="text-muted-foreground mt-0.5 text-sm break-words">{facts}</p>}
          </div>
          <StatusBadge tone={STATUS_TONE[b.enrollmentStatus]}>
            {ENROLLMENT_LABEL[b.enrollmentStatus]}
          </StatusBadge>
        </div>

        {b.enrollmentStatus === "pending" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Your enrolment is with the academic team. Classes and assessments open up once
            it&apos;s approved.
          </p>
        ) : (
          pct != null && (
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Syllabus covered</span>
                <span className="font-semibold tabular-nums">
                  {b.chaptersCompleted} of {b.chaptersTotal} chapters
                  <span className="text-muted-foreground font-normal"> · {pct}%</span>
                </span>
              </div>
              <span className="bg-muted h-2.5 overflow-hidden rounded-full">
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
          )
        )}

        {b.nextSession && (
          <div className="bg-muted/50 grid gap-0.5 rounded-lg border p-3">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase">
              <CalendarClock className="size-3.5" /> Next class
            </span>
            <span className="text-sm font-medium break-words">{b.nextSession.title}</span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
              {formatDateTime(b.nextSession.startsAt)}
              {b.nextSession.deliveryMode && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {MODE_LABEL[b.nextSession.deliveryMode] ?? b.nextSession.deliveryMode}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild className="flex-1 sm:flex-none">
            <Link href={`/student/batches/${b.batchId}`}>Open batch</Link>
          </Button>
          <Button variant="outline" asChild className="flex-1 sm:flex-none">
            <Link href="/student/quizzes">
              <ClipboardList className="size-4" /> Assessments
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, batches }: { title: string; batches: MyBatch[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-muted-foreground text-xs font-bold tracking-wider uppercase">{title}</h2>
      <ul className="divide-y rounded-lg border">
        {batches.map((b) => (
          <li key={b.enrollmentId}>
            <BatchRow batch={b} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// One row, whole-row target. A student scanning this list wants name, state and how
// far it got — anything more belongs on the batch page they're one tap from.
function BatchRow({ batch: b }: { batch: MyBatch }) {
  const pct = b.chaptersTotal > 0 ? Math.round((100 * b.chaptersCompleted) / b.chaptersTotal) : null;
  // "ended" only if it actually has; a future end date on a batch waiting to start
  // otherwise renders as "ended 30 Nov 2026".
  const ended = b.endDate && new Date(b.endDate) < new Date();
  // Coverage is meaningless for an enrolment that was cancelled — the student never
  // sat through those chapters, so quoting a percentage implies progress they made.
  const showPct = pct != null && (b.enrollmentStatus === "active" || b.enrollmentStatus === "completed");
  const meta = [
    b.courseName,
    ended ? `ended ${formatDate(b.endDate!)}` : b.academicYear,
    showPct ? `${pct}% covered` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/student/batches/${b.batchId}`}
      className="hover:bg-muted/50 flex items-center gap-3 px-3 py-3 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-words">{b.batchName}</span>
        {meta.length > 0 && (
          <span className="text-muted-foreground block text-xs break-words">
            {meta.join(" · ")}
          </span>
        )}
        {b.enrollmentStatus === "cancelled" && b.rejectionReason && (
          <span className="text-muted-foreground mt-0.5 block text-xs break-words">
            Reason: {b.rejectionReason}
          </span>
        )}
      </span>
      <StatusBadge tone={STATUS_TONE[b.enrollmentStatus]} className="shrink-0">
        {ENROLLMENT_LABEL[b.enrollmentStatus]}
      </StatusBadge>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}
