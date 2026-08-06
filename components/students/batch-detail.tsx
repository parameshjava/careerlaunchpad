"use client";

// A student's read-only view of one batch, in the same folder-tab shell staff use
// (docs/STYLE_GUIDE.md → Tabs) — but with its own panels, not the staff ones.
//
// WHY NOT REUSE BatchWorkspace'S PANELS
//   Details is an edit form bound to `finance.manage` and carries the batch fee
//   config; Students is the full roster with emails and balances; Feedback carries
//   respondent identity; Schedule's data path selects `start_url`, the Zoom HOST
//   link that migration 134 says students must never receive. Threading a `readOnly`
//   flag through those would put four leak paths one boolean away from a student.
//   So the shell and the vocabulary are shared; the data is not.
//
// The Syllabus tab is where feedback lives: a chapter its mentor has marked
// completed shows "Give feedback", opening the SAME form as the assessments hub.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { formatDate, formatDateTime } from "@/lib/format-date";
import type { SubjectProgress, ProgressStatus } from "@/lib/batch-progress-query";
import type { MyBatch, MyBatchSession } from "@/lib/student-batches-query";
import type { PendingFeedback } from "@/lib/feedback-query";
import { DobRequiredCard, WhatChanged, type PublishedAction } from "@/components/student/feedback-prompt";

// Style-guide folder tabs: bordered, muted inactive with the underline, solid brand
// fill when active. Same string the staff workspace uses.
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

const CHAPTER_TONE: Record<ProgressStatus, StatusTone> = {
  completed: "emerald",
  in_progress: "blue",
  not_started: "slate",
};
const CHAPTER_LABEL: Record<ProgressStatus, string> = {
  completed: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
};
const MODE_LABEL: Record<string, string> = {
  online: "Online",
  offline: "In person",
  hybrid: "Hybrid",
};

export function BatchDetail({
  batch,
  subjects,
  sessions,
}: {
  batch: MyBatch;
  subjects: SubjectProgress[];
  sessions: MyBatchSession[];
}) {
  const [tab, setTab] = useState("syllabus");
  // Open feedback windows, keyed by chapter — drives the per-chapter action.
  const [requests, setRequests] = useState<PendingFeedback[]>([]);
  const [published, setPublished] = useState<PublishedAction[]>([]);
  // The age gate is skipping this student for want of a date of birth (#84 O-11).
  const [needsDob, setNeedsDob] = useState(false);
  const [loadingFb, setLoadingFb] = useState(true);

  const loadFeedback = useCallback(() => {
    // ?batch scopes BOTH lists server-side. Filtering the unscoped answer here would
    // still be wrong for `published`: its limit is applied before any filter, so a
    // student with a full page of actions in another batch would see none here.
    fetch(`/api/student/feedback?batch=${encodeURIComponent(batch.batchId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setRequests(d.requests ?? []);
          setPublished(d.published ?? []);
          setNeedsDob(d.needsDob === true);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFb(false));
  }, [batch.batchId]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  // Belt and braces: the ?batch above already scopes this server-side, but the Feedback
  // tab showing another batch's chapters is invisible when it happens — chapter names
  // repeat across batches of the same course — so it is not left to one guard.
  const batchRequests = requests.filter((r) => r.batchId === batch.batchId);
  const batchActions = published.filter((a) => a.batchId === batch.batchId);
  const requestForChapter = (chapterId: string) =>
    batchRequests.find((r) => r.chapterId === chapterId) ?? null;

  const upcoming = sessions.filter((s) => new Date(s.startsAt) >= new Date());
  const past = sessions.filter((s) => new Date(s.startsAt) < new Date()).reverse();
  // Both halves of the tab count come from `subjects`, never one from here and one
  // from the batch aggregate — two sources for the same number is how a tab ends up
  // reading "2/40" beside a card that says "2 of 4".
  const allChapters = subjects.flatMap((s) => s.chapters);
  const doneChapters = allChapters.filter((c) => c.status === "completed").length;

  return (
    <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          variant="line"
          className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
        >
          <TabsTrigger value="syllabus" className={TAB_CLS}>
            <BookOpen className="size-4" /> Syllabus ({doneChapters}/{allChapters.length})
          </TabsTrigger>
          <TabsTrigger value="classes" className={TAB_CLS}>
            <CalendarDays className="size-4" /> Classes ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="feedback" className={TAB_CLS}>
            <MessageSquarePlus className="size-4" /> Feedback ({batchRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="syllabus" className="mt-4 min-w-0">
          <div className="grid gap-3">
            {subjects.length === 0 ? (
              <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
                The syllabus for this batch hasn&apos;t been set up yet.
              </p>
            ) : (
              subjects.map((s) => {
                const done = s.chapters.filter((c) => c.status === "completed").length;
                return (
                  <Card key={s.subjectId}>
                    <CardContent className="grid gap-3 pt-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h3 className="font-semibold break-words">{s.subjectName ?? "—"}</h3>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {done} of {s.chapters.length} chapters completed
                        </span>
                      </div>
                      {s.chapters.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No chapters listed yet.</p>
                      ) : (
                        <ul className="divide-y rounded-md border">
                          {s.chapters.map((c) => {
                            const req = requestForChapter(c.chapterId);
                            return (
                              <li
                                key={c.chapterId}
                                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <span className="flex min-w-0 items-start gap-2">
                                  {c.status === "completed" ? (
                                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                  ) : c.status === "in_progress" ? (
                                    <PlayCircle className="text-primary mt-0.5 size-4 shrink-0" />
                                  ) : (
                                    <CircleDashed className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                  )}
                                  <span className="min-w-0 text-sm break-words">
                                    {c.chapterName ?? "—"}
                                  </span>
                                </span>
                                <span className="flex shrink-0 flex-wrap items-center gap-2">
                                  <StatusBadge tone={CHAPTER_TONE[c.status]}>
                                    {CHAPTER_LABEL[c.status]}
                                  </StatusBadge>
                                  {req && (
                                    <Button size="sm" variant="outline" asChild>
                                      <Link href={`/student/feedback/${req.requestId}`}>
                                        <MessageSquarePlus className="size-3.5" />
                                        {req.submittedAt ? "Edit feedback" : "Give feedback"}
                                      </Link>
                                    </Button>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="classes" className="mt-4 min-w-0">
          {/* One empty state when there is no timetable at all. Splitting into
              "Upcoming" and "Past" first showed two stacked empty boxes for a batch
              whose schedule simply hasn't been published — a screen of nothing that
              reads like a fault. */}
          {sessions.length === 0 ? (
            <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
              No classes scheduled for this batch yet. They appear here — with the join link —
              once the academic team publishes the timetable.
            </p>
          ) : (
            <div className="grid gap-4">
              {upcoming.length > 0 && <SessionList title="Upcoming" sessions={upcoming} showJoin />}
              {past.length > 0 && <SessionList title="Past" sessions={past.slice(0, 20)} />}
            </div>
          )}
        </TabsContent>

        <TabsContent value="feedback" className="mt-4 min-w-0">
          <div className="grid gap-4">
            {loadingFb ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : needsDob ? (
              // Before the empty state: "nothing to rate" would be a lie here — there
              // IS something, and one missing field is why they can't see it.
              <DobRequiredCard />
            ) : batchRequests.length === 0 ? (
              <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
                Nothing to rate right now. A short form appears here whenever your trainer completes
                a chapter.
              </p>
            ) : (
              <div className="grid gap-2">
                {batchRequests.map((r) => (
                  <Card key={r.requestId}>
                    <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{r.chapterName ?? "—"}</p>
                        <p className="text-muted-foreground text-xs">
                          {r.subjectName} · closes {formatDate(r.closesAt)}
                          {r.submittedAt ? " · you answered this" : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" asChild className="shrink-0">
                        <Link href={`/student/feedback/${r.requestId}`}>
                          {r.submittedAt ? "Edit feedback" : "Give feedback"}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {batchActions.length > 0 && <WhatChanged actions={batchActions} showBatch={false} />}
          </div>
      </TabsContent>
    </Tabs>
  );
}

function SessionList({
  title,
  sessions,
  showJoin = false,
}: {
  title: string;
  sessions: MyBatchSession[];
  showJoin?: boolean;
}) {
  if (sessions.length === 0)
    return (
      <div className="grid gap-2">
        <h3 className="text-muted-foreground text-xs font-bold tracking-wider uppercase">{title}</h3>
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-8 text-center text-sm">
          No {title.toLowerCase()} classes.
        </p>
      </div>
    );

  return (
    <div className="grid gap-2">
      <h3 className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {title} ({sessions.length})
      </h3>
      <ul className="divide-y rounded-md border">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium break-words">{s.title}</span>
              <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                {formatDateTime(s.startsAt)}
                {s.deliveryMode && <span>· {MODE_LABEL[s.deliveryMode] ?? s.deliveryMode}</span>}
              </span>
            </span>
            {showJoin && s.joinUrl && (
              <Button size="sm" variant="outline" asChild className="shrink-0">
                <a href={s.joinUrl} target="_blank" rel="noopener noreferrer">
                  <Video className="size-3.5" /> Join
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The header strip above the tabs — facts, progress, and where to go next. */
export function BatchDetailHeader({ batch }: { batch: MyBatch }) {
  const pct =
    batch.chaptersTotal > 0
      ? Math.round((100 * batch.chaptersCompleted) / batch.chaptersTotal)
      : null;
  const facts = [
    batch.courseName,
    batch.academicYear,
    batch.batchCode,
    batch.deliveryMode ? (MODE_LABEL[batch.deliveryMode] ?? batch.deliveryMode) : null,
    [batch.startDate, batch.endDate].filter(Boolean).map((d) => formatDate(d!)).join(" – ") || null,
  ].filter(Boolean);

  return (
    <div className="mb-4 grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight break-words">{batch.batchName}</h1>
            <Badge variant={batch.enrollmentStatus === "active" ? "default" : "secondary"}>
              {batch.enrollmentStatus === "active"
                ? "Enrolled"
                : batch.enrollmentStatus === "pending"
                  ? "Awaiting approval"
                  : batch.enrollmentStatus === "completed"
                    ? "Completed"
                    : "Not enrolled"}
            </Badge>
          </div>
          {facts.length > 0 && (
            <p className="text-muted-foreground mt-1 text-sm break-words">{facts.join(" · ")}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/student/quizzes">
              <ClipboardList className="size-3.5" /> Assessments
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/student/batches">All batches</Link>
          </Button>
        </div>
      </div>

      {pct != null && (
        <Card>
          <CardContent className="grid gap-1.5 pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Syllabus covered</span>
              <span className="font-semibold tabular-nums">
                {batch.chaptersCompleted} of {batch.chaptersTotal} chapters
                <span className="text-muted-foreground font-normal"> · {pct}%</span>
              </span>
            </div>
            <span className="bg-muted h-2 overflow-hidden rounded-full">
              <span className="bg-primary block h-full rounded-full" style={{ width: `${pct}%` }} />
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
