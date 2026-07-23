"use client";

// Unified batch workspace (issue #64 follow-up): one compact screen for
// everything about a batch. A slim summary header (course, year, colleges,
// students, fee, status) stays visible; the working areas — Details, Subjects &
// mentors, Schedule, Students — are tabs, so only one panel occupies space at a
// time. Each panel reuses its existing component in `embedded` mode; Radix only
// mounts the active tab, and the section GETs are cached (lib/fetch-cache), so
// switching tabs is lazy on first open and instant thereafter.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarDays, GraduationCap, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BATCH_STATUS_LABELS, type BatchStatus } from "@/lib/batch-query";
import { formatINR } from "@/lib/fee-receipt";
import { BatchEditor } from "@/components/batches/batch-editor";
import { BatchSubjectsEditor } from "@/components/batches/batch-subjects-editor";
import { BatchSchedule } from "@/components/batches/batch-schedule";
import { BatchRosterLazy } from "@/components/batches/batch-roster-lazy";

const TABS = ["details", "subjects", "schedule", "students"] as const;
type TabKey = (typeof TABS)[number];
const ACTIVE = new Set<BatchStatus>(["open", "running"]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function BatchWorkspace({
  batchId,
  name,
  status,
  facts,
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
}) {
  const [tab, setTab] = useState<TabKey>("details");

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
        <TabsList className="mb-4 flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="details">
            <Settings2 className="size-4" /> Details
          </TabsTrigger>
          <TabsTrigger value="subjects">
            <BookOpen className="size-4" /> Subjects &amp; mentors
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarDays className="size-4" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="students">
            <GraduationCap className="size-4" /> Students
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <BatchEditor batchId={batchId} embedded />
        </TabsContent>
        <TabsContent value="subjects">
          <BatchSubjectsEditor batchId={batchId} embedded />
        </TabsContent>
        <TabsContent value="schedule">
          <BatchSchedule batchId={batchId} embedded />
        </TabsContent>
        <TabsContent value="students">
          <BatchRosterLazy batchId={batchId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
