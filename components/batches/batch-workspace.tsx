"use client";

// Unified batch workspace (issue #64 follow-up): one screen for everything about
// a batch — details, subjects & mentors, class schedule, and the student roster —
// each in an independently collapsible accordion section. Staff expand only what
// they're working on, or open everything to oversee the whole batch. Each section
// reuses its existing component in `embedded` mode (no per-page header/nav), and
// Radix only mounts a section's content when it's open, so data loads lazily.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarDays, GraduationCap, Settings2 } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BATCH_STATUS_LABELS, type BatchStatus } from "@/lib/batch-query";
import { BatchEditor } from "@/components/batches/batch-editor";
import { BatchSubjectsEditor } from "@/components/batches/batch-subjects-editor";
import { BatchSchedule } from "@/components/batches/batch-schedule";
import { BatchRosterLazy } from "@/components/batches/batch-roster-lazy";

const SECTIONS = ["details", "subjects", "schedule", "students"] as const;
type Section = (typeof SECTIONS)[number];

const ACTIVE = new Set<BatchStatus>(["open", "running"]);

export function BatchWorkspace({
  batchId,
  name,
  subtitle,
  status,
}: {
  batchId: string;
  name: string;
  subtitle: string;
  status: BatchStatus;
}) {
  const [open, setOpen] = useState<Section[]>(["details"]);

  // Deep-link: /dashboard/batches/[id]#schedule opens that section.
  useEffect(() => {
    const h = window.location.hash.replace("#", "") as Section;
    if (SECTIONS.includes(h)) setOpen((prev) => (prev.includes(h) ? prev : [...prev, h]));
  }, []);

  const meta = (
    <div className="text-muted-foreground text-sm">{subtitle}</div>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant={ACTIVE.has(status) ? "default" : "secondary"}>{BATCH_STATUS_LABELS[status]}</Badge>
          </div>
          <div className="mt-1">{meta}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(open.length === SECTIONS.length ? [] : [...SECTIONS])}>
            {open.length === SECTIONS.length ? "Collapse all" : "Expand all"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/batches">
              <ArrowLeft /> Batches
            </Link>
          </Button>
        </div>
      </header>

      <Accordion
        type="multiple"
        value={open}
        onValueChange={(v) => setOpen(v as Section[])}
        className="bg-card overflow-hidden rounded-xl border"
      >
        <Section id="details" icon={<Settings2 className="size-4" />} title="Details" hint="Course, colleges, dates & fee">
          <BatchEditor batchId={batchId} embedded />
        </Section>

        <Section id="subjects" icon={<BookOpen className="size-4" />} title="Subjects & mentors" hint="Subjects taught and their mentors">
          <BatchSubjectsEditor batchId={batchId} embedded />
        </Section>

        <Section id="schedule" icon={<CalendarDays className="size-4" />} title="Class schedule" hint="Timetable & Zoom classes">
          <BatchSchedule batchId={batchId} embedded />
        </Section>

        <Section
          id="students"
          icon={<GraduationCap className="size-4" />}
          title="Students"
          hint="Enrolments & payments"
        >
          <BatchRosterLazy batchId={batchId} />
        </Section>
      </Accordion>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  hint,
  children,
}: {
  id: Section;
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={id} className="not-last:border-b">
      <AccordionTrigger className="items-center px-4 hover:no-underline data-open:border-b data-open:border-border">
        <span className="flex items-center gap-2.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-semibold">{title}</span>
          <span className="text-muted-foreground hidden text-xs font-normal sm:inline">— {hint}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pt-4">{children}</AccordionContent>
    </AccordionItem>
  );
}
