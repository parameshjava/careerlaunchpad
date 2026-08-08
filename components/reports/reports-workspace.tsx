"use client";

/**
 * The reports page frame: one sticky bar that says WHAT you are looking at, and
 * a jump nav that says WHERE in it you are.
 *
 * Why a bar rather than a heading:
 *   • the report is four sections tall, so a period control at the top scrolls
 *     away — you end up reading numbers with no idea which window they cover,
 *     and changing it means scrolling back up;
 *   • college, period and instrument are one question ("what am I looking at"),
 *     so they belong together rather than in three places;
 *   • the period is owned HERE, so switching between exams and assessments keeps
 *     it. It used to live inside each report, which meant a switch silently
 *     reset the window to 12 months.
 *
 * The instrument is a segmented control, not tabs, because the sections below it
 * are already the page's tab-like structure — a second row of tabs would make
 * the reader guess which level a click changes. It is mirrored into ?view= so a
 * link to the assessments report actually opens the assessments report.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { savedAgo } from "@/lib/report-cache";

import { cn } from "@/lib/utils";
import { ExamReport, EXAM_SECTIONS } from "./exam-report";
import { AssessmentReport, ASSESSMENT_SECTIONS } from "./assessment-report";
import { ReportRangeFields, useReportRange } from "./report-range";

type Instrument = "exams" | "assessments";

const INSTRUMENTS: { value: Instrument; label: string }[] = [
  { value: "exams", label: "Exams" },
  { value: "assessments", label: "Assessments" },
];

export function ReportsWorkspace({
  college,
  showCollege,
  collegePicker,
  initialView,
  userId,
}: {
  college: string | null;
  showCollege: boolean;
  /** Namespaces the report cache — see lib/report-cache.ts. */
  userId: string;
  /** The college picker, rendered by the server page for global admins only. */
  collegePicker?: React.ReactNode;
  initialView?: string;
}) {
  const [instrument, setInstrument] = useState<Instrument>(
    initialView === "assessments" ? "assessments" : "exams",
  );
  // The active report reports its fetch state up, because the bar is the part
  // that is always on screen — a spinner inside the sections would scroll away.
  const [status, setStatus] = useState<{ loading: boolean; savedAt: number | null }>({
    loading: true,
    savedAt: null,
  });
  // Stable, or the report's effect would fire on every parent render.
  const onStatus = useCallback((s: { loading: boolean; savedAt: number | null }) => setStatus(s), []);
  const range = useReportRange(college);
  const sections = instrument === "exams" ? EXAM_SECTIONS : ASSESSMENT_SECTIONS;

  // replaceState rather than router.replace: this only needs the URL to describe
  // the view for sharing and reload, and a server round-trip would refetch the
  // whole page to change one word.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("view") === instrument) return;
    if (instrument === "exams") u.searchParams.delete("view");
    else u.searchParams.set("view", instrument);
    window.history.replaceState(null, "", u);
  }, [instrument]);

  return (
    <>
      {/* Sticky inside <main>'s scroll area, and OPAQUE: a translucent bar over a
          data table is unreadable — the rows show through the numbers.

          The negative margins cover the horizontal gutter, and the ::before strip
          covers the band above the bar. That band is <main>'s own top padding:
          sticky pins to the scrollport's padding edge, so rows scroll up through
          the padding and would appear ABOVE the bar without it. The strip is
          deliberately taller than that padding — <main> clips its own overflow, so
          an over-tall strip is trimmed at the top rather than painting over the
          app header, which keeps this from depending on the shell's exact
          padding. */}
      <div className="bg-background sticky top-0 z-20 -mx-4 space-y-3 border-b px-4 py-3 shadow-sm sm:-mx-6 sm:px-6 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-12 before:bg-background before:content-['']">
        <div className="flex flex-wrap items-end gap-3">
          <div
            role="tablist"
            aria-label="Report"
            className="bg-muted inline-flex shrink-0 rounded-lg p-[3px]"
          >
            {INSTRUMENTS.map((i) => (
              <button
                key={i.value}
                type="button"
                role="tab"
                aria-selected={instrument === i.value}
                onClick={() => setInstrument(i.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  instrument === i.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {i.label}
              </button>
            ))}
          </div>

          <ReportRangeFields id="report" state={range} />
          {collegePicker}
          {/* Two different states, said differently: a first load is a spinner,
              a saved copy on screen is a labelled fact with its age. Showing
              stale numbers unlabelled would be the one unacceptable option. */}
          {status.loading && (
            <span className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
              <Loader2 className="size-4 animate-spin" aria-label="Loading" />
              {status.savedAt != null && (
                <span>saved copy from {savedAgo(status.savedAt)} · refreshing</span>
              )}
            </span>
          )}
        </div>

        {/* Jump nav — scrolls horizontally on a phone rather than wrapping into
            a two-line bar that eats the viewport. */}
        <nav aria-label="Jump to section" className="-mb-1 flex gap-2 overflow-x-auto pb-1">
          {sections.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap"
            >
              <span className="tabular-nums">{i + 1}</span> {s.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="pt-6">
        {instrument === "exams" ? (
          <ExamReport range={range} showCollege={showCollege} userId={userId} onStatus={onStatus} />
        ) : (
          <AssessmentReport range={range} showCollege={showCollege} userId={userId} onStatus={onStatus} />
        )}
      </div>
    </>
  );
}
