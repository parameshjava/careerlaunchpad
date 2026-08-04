"use client";

// Unified batch workspace (issue #64 follow-up): one compact screen for
// everything about a batch. A slim summary header (course, year, colleges,
// students, fee, status) stays visible; the working areas — Details, Subjects &
// mentors, Schedule, Students — are tabs, so only one panel occupies space at a
// time. Each panel reuses its existing component in `embedded` mode; Radix only
// mounts the active tab, and the section GETs are cached (lib/fetch-cache), so
// switching tabs is lazy on first open and instant thereafter.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  GraduationCap,
  ListChecks,
  ListTodo,
  MessageSquareQuote,
  Settings2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BATCH_STATUS_LABELS, type BatchStatus } from "@/lib/batch-query";
import { formatINR } from "@/lib/fee-receipt";
import { BatchEditor } from "@/components/batches/batch-editor";
import { BatchSubjectsEditor } from "@/components/batches/batch-subjects-editor";
import { BatchSchedule } from "@/components/batches/batch-schedule";
import { BatchRosterLazy } from "@/components/batches/batch-roster-lazy";
import { BatchProgressEditor } from "@/components/batches/batch-progress-editor";
import { BatchFeedback } from "@/components/batches/batch-feedback";
import { BatchActions, type ActionSeed } from "@/components/batches/batch-actions";

const TABS = [
  "details",
  "subjects",
  "schedule",
  "students",
  "progress",
  "feedback",
  "actions",
] as const;
type TabKey = (typeof TABS)[number];
const ACTIVE = new Set<BatchStatus>(["open", "running"]);

// Style-guide "connected folder tabs" (docs/STYLE_GUIDE.md → Tabs): bordered,
// muted inactive with the underline, solid brand fill when active.
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function BatchWorkspace({
  batchId,
  name,
  status,
  facts,
  showProgress = false,
  showFeedback = false,
  showActions = false,
}: {
  batchId: string;
  name: string;
  status: BatchStatus;
  facts: {
    courseName: string | null;
    academicYear: string | null;
    code: string;
    collegeCount: number;
    studentCount: number;
    grossPaise: number;
  };
  /** Whether the caller can manage chapter progress (batch.progress.manage). */
  showProgress?: boolean;
  /** feedback.view.identified — the tab that shows who said what (#84). */
  showFeedback?: boolean;
  /** feedback.action.manage — the todo list built from that feedback (#84). */
  showActions?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("details");
  // "Create action" on the Feedback tab hands the chapter's source to the Actions
  // tab and switches to it, so an item can never be filed without provenance.
  const [actionSeed, setActionSeed] = useState<ActionSeed | null>(null);
  const seedAction = useCallback((seed: ActionSeed) => {
    setActionSeed(seed);
    setTab("actions");
    history.replaceState(null, "", "#actions");
  }, []);

  // Deep-link: /dashboard/batches/[id]#schedule opens that tab; keep the hash in
  // sync so a refresh stays on the same tab.
  useEffect(() => {
    const h = window.location.hash.replace("#", "") as TabKey;
    if (TABS.includes(h)) setTab(h);
  }, []);
  const onTab = (v: string) => {
    setTab(v as TabKey);
    history.replaceState(null, "", `#${v}`);
  };

  const summary = [
    facts.courseName,
    facts.academicYear,
    facts.code,
    plural(facts.collegeCount, "college"),
    plural(facts.studentCount, "student"),
    formatINR(facts.grossPaise),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant={ACTIVE.has(status) ? "default" : "secondary"}>{BATCH_STATUS_LABELS[status]}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{summary}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/batches">
            <ArrowLeft /> Batches
          </Link>
        </Button>
      </header>

      <Tabs value={tab} onValueChange={onTab}>
        <TabsList
          variant="line"
          className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
        >
          <TabsTrigger value="details" className={TAB_CLS}>
            <Settings2 className="size-4" /> Details
          </TabsTrigger>
          <TabsTrigger value="subjects" className={TAB_CLS}>
            <BookOpen className="size-4" /> Subjects &amp; mentors
          </TabsTrigger>
          <TabsTrigger value="schedule" className={TAB_CLS}>
            <CalendarDays className="size-4" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="students" className={TAB_CLS}>
            <GraduationCap className="size-4" /> Students
          </TabsTrigger>
          {showProgress && (
            <TabsTrigger value="progress" className={TAB_CLS}>
              <ListChecks className="size-4" /> Progress
            </TabsTrigger>
          )}
          {showFeedback && (
            <TabsTrigger value="feedback" className={TAB_CLS}>
              <MessageSquareQuote className="size-4" /> Feedback
            </TabsTrigger>
          )}
          {showActions && (
            <TabsTrigger value="actions" className={TAB_CLS}>
              <ListTodo className="size-4" /> Actions
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details" className="mt-4 min-w-0">
          <BatchEditor batchId={batchId} embedded />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4 min-w-0">
          <BatchSubjectsEditor batchId={batchId} embedded />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4 min-w-0">
          <BatchSchedule batchId={batchId} embedded />
        </TabsContent>
        <TabsContent value="students" className="mt-4 min-w-0">
          <BatchRosterLazy batchId={batchId} />
        </TabsContent>
        {showProgress && (
          <TabsContent value="progress" className="mt-4 min-w-0">
            <BatchProgressEditor batchId={batchId} embedded />
          </TabsContent>
        )}
        {showFeedback && (
          <TabsContent value="feedback" className="mt-4 min-w-0">
            <BatchFeedback batchId={batchId} onCreateAction={showActions ? seedAction : undefined} />
          </TabsContent>
        )}
        {showActions && (
          <TabsContent value="actions" className="mt-4 min-w-0">
            <BatchActions
              batchId={batchId}
              seed={actionSeed}
              onSeedConsumed={() => setActionSeed(null)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
