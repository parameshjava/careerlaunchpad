"use client";

// Student academic-performance view (story #73). This file is the shell: filters,
// fetching, and the reading order the story specifies — snapshot → study plan →
// trend → subject bars → chapter drill-down → mastery grid. The plan sits high
// because it is the action the charts justify; the charts below are the evidence.
//
// The charts themselves live in ./performance/*, one per FR, so this stays a
// composition and the 660-line original stops being the place every change lands.
// Colour comes from lib/chart-palette.ts — never hardcoded here.
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ChapterScore,
  LadderStep,
  MasteryCell,
  PerfSummary,
  PlanItem,
  PlanProjection,
  SubjectScore,
  TrendPoint,
} from "@/lib/student-performance-query";
import { EmptyState, TableToggle } from "./performance/shared";
import { SnapshotTiles } from "./performance/snapshot-tiles";
import { StudyPlan } from "./performance/study-plan";
import { PerformanceTrend } from "./performance/performance-trend";
import { SubjectMasteryBars, type SubjectSort, typicalPassMark } from "./performance/subject-mastery-bars";
import { ChapterDrilldown, type ChapterView } from "./performance/chapter-drilldown";
import { MasteryGrid } from "./performance/mastery-grid";

type BatchOption = { batch_id: string; batch_name: string };

// O-4: we keep a trailing window rather than an "academic year", because no batch
// field records academic-year boundaries — inferring them would be a guess. The
// custom range covers the case where a student wants exactly one term.
const RANGES: { value: string; label: string; months: number | null }[] = [
  { value: "12m", label: "Last 12 months", months: 12 },
  { value: "6m", label: "Last 6 months", months: 6 },
  { value: "all", label: "All time", months: null },
  { value: "custom", label: "Custom range…", months: null },
];

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function StudentPerformance() {
  const [range, setRange] = useState("12m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [batch, setBatch] = useState("all");
  const [batches, setBatches] = useState<BatchOption[]>([]);

  const [summary, setSummary] = useState<PerfSummary | null>(null);
  const [subjects, setSubjects] = useState<SubjectScore[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [mastery, setMastery] = useState<MasteryCell[]>([]);

  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [projection, setProjection] = useState<PlanProjection | null>(null);
  const [ladder, setLadder] = useState<LadderStep[]>([]);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [target, setTarget] = useState("");
  const [appliedTarget, setAppliedTarget] = useState<number | null>(null);

  const [selected, setSelected] = useState<SubjectScore | null>(null);
  const [chapters, setChapters] = useState<ChapterScore[]>([]);

  // view toggles
  const [trendBySubject, setTrendBySubject] = useState(false);
  const [trendTable, setTrendTable] = useState(false);
  const [subjectSort, setSubjectSort] = useState<SubjectSort>("weakest");
  const [subjectTable, setSubjectTable] = useState(false);
  const [chapterView, setChapterView] = useState<ChapterView>("best");
  const [chapterTable, setChapterTable] = useState(false);
  const [masteryTable, setMasteryTable] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The from/to/batch scope every range-filtered endpoint shares.
  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (range === "custom") {
      if (customFrom) p.set("from", customFrom);
      if (customTo) p.set("to", customTo);
    } else {
      const months = RANGES.find((r) => r.value === range)?.months ?? null;
      if (months != null) p.set("from", monthsAgo(months));
    }
    if (batch !== "all") p.set("batch", batch);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [range, customFrom, customTo, batch]);

  // The student's batches back the FR-7 filter (rendered only when >1 batch).
  useEffect(() => {
    fetch("/api/student/performance/batches")
      .then((r) => r.json())
      .then((d) => setBatches(d.batches ?? []))
      .catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    const q = qs();
    const sep = q ? "&" : "?";
    Promise.all([
      fetch(`/api/student/performance/summary${q}`).then((r) => r.json()),
      fetch(`/api/student/performance/subjects${q}`).then((r) => r.json()),
      fetch(`/api/student/performance/trend${q}${sep}group=subject`).then((r) => r.json()),
      fetch(`/api/student/performance/mastery${q}`).then((r) => r.json()),
    ])
      .then(([s, sub, tr, ms]) => {
        if (cancelled) return;
        if (s.error) setError(s.error);
        setSummary(s.summary ?? null);
        setSubjects(sub.subjects ?? []);
        setTrend(tr.points ?? []);
        setMastery(ms.cells ?? []);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [qs]);

  // The plan refetches on batch or target change only — the plan RPC is not
  // date-filtered, because "what should I do next" isn't a question about a window.
  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams();
    if (batch !== "all") p.set("batch", batch);
    if (appliedTarget != null) p.set("target", String(appliedTarget));
    const s = p.toString();
    fetch(`/api/student/performance/study-plan${s ? `?${s}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPlan(d.plan ?? []);
        setProjection(d.projection ?? null);
        setLadder(d.ladder ?? []);
        setPlanLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPlan([]);
        setProjection(null);
        setLadder([]);
        setPlanLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [batch, appliedTarget]);

  function applyTarget() {
    const t = target.trim();
    if (t === "") {
      setAppliedTarget(null);
      return;
    }
    const n = Number(t);
    if (Number.isInteger(n) && n >= 0 && n <= 100) setAppliedTarget(n);
  }

  function clearTarget() {
    setTarget("");
    setAppliedTarget(null);
  }

  const loadChapters = useCallback(
    (subjectId: string) => {
      setChapters([]);
      fetch(`/api/student/performance/subjects/${subjectId}/chapters${qs()}`)
        .then((r) => r.json())
        .then((d) => setChapters(d.chapters ?? []))
        .catch(() => setChapters([]));
    },
    [qs],
  );

  function pickSubject(s: SubjectScore) {
    if (selected?.subject_id === s.subject_id) {
      setSelected(null);
      return;
    }
    setSelected(s);
    loadChapters(s.subject_id);
  }

  function pickSubjectById(subjectId: string) {
    const s = subjects.find((x) => x.subject_id === subjectId);
    if (s) pickSubject(s);
  }

  if (loading)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading your performance…
      </p>
    );
  if (error && !summary)
    return (
      <p className="text-destructive border-destructive/20 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
        {error}
      </p>
    );

  const assessed = summary?.chapters_assessed ?? 0;
  if (assessed === 0)
    return (
      <EmptyState message="No assessment scores yet. Once you take a chapter assessment, your performance shows up here." />
    );

  const { mark: passMark } = typicalPassMark(subjects);

  return (
    <div className="space-y-6">
      {/* filters — one row above the charts */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {batches.length > 1 && (
          <Select value={batch} onValueChange={setBatch}>
            <SelectTrigger className="h-8 w-[12rem]" aria-label="Batch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.batch_id} value={b.batch_id}>
                  {b.batch_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-8 w-[11rem]" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-[9.5rem]"
              aria-label="From date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-[9.5rem]"
              aria-label="To date"
            />
          </div>
        )}
      </div>

      <SnapshotTiles summary={summary} trend={trend} />

      {/* the study plan — the action the charts justify */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your study plan</CardTitle>
          <p className="text-muted-foreground text-xs">
            Where the next attempt pays off most. Set a target to see the route to it.
          </p>
        </CardHeader>
        <CardContent>
          {planLoaded ? (
            <StudyPlan
              items={plan}
              projection={projection}
              ladder={ladder}
              target={target}
              appliedTarget={appliedTarget}
              onTargetChange={setTarget}
              onApply={applyTarget}
              onClear={clearTarget}
              batch={batch}
            />
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Building your plan…
            </p>
          )}
        </CardContent>
      </Card>

      {/* trend */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Score over time</CardTitle>
            <p className="text-muted-foreground text-xs">
              Monthly average of the attempts you submitted that month.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setTrendBySubject((v) => !v)}>
              {trendBySubject ? "Overall" : "By subject"}
            </Button>
            <TableToggle table={trendTable} onToggle={() => setTrendTable((v) => !v)} />
          </div>
        </CardHeader>
        <CardContent>
          <PerformanceTrend
            points={trend}
            bySubject={trendBySubject}
            table={trendTable}
            passLine={passMark}
          />
        </CardContent>
      </Card>

      {/* subjects + drill-down */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Subjects — strengths &amp; gaps</CardTitle>
            <p className="text-muted-foreground text-xs">
              {subjectSort === "weakest" ? "Weakest first" : "Strongest first"}. Tap a subject for its
              chapters.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSubjectSort((s) => (s === "weakest" ? "strongest" : "weakest"))}
            >
              {subjectSort === "weakest" ? "Strongest first" : "Weakest first"}
            </Button>
            <TableToggle table={subjectTable} onToggle={() => setSubjectTable((v) => !v)} />
          </div>
        </CardHeader>
        <CardContent>
          <SubjectMasteryBars
            subjects={subjects}
            sort={subjectSort}
            table={subjectTable}
            onPick={pickSubject}
            selected={selected?.subject_id ?? null}
          />
          {selected && (
            <div className="mt-5 border-t pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{selected.subject_name} — chapters</p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChapterView((v) => (v === "best" ? "improvement" : "best"))}
                  >
                    {chapterView === "best" ? "Improvement" : "Best score"}
                  </Button>
                  <TableToggle table={chapterTable} onToggle={() => setChapterTable((v) => !v)} />
                </div>
              </div>
              <ChapterDrilldown chapters={chapters} view={chapterView} table={chapterTable} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* mastery grid */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Mastery grid</CardTitle>
            <p className="text-muted-foreground text-xs">
              Every completed chapter, by subject. Tap a subject name to open its chapters.
            </p>
          </div>
          <TableToggle table={masteryTable} onToggle={() => setMasteryTable((v) => !v)} />
        </CardHeader>
        <CardContent>
          <MasteryGrid cells={mastery} table={masteryTable} onPickSubject={pickSubjectById} />
        </CardContent>
      </Card>
    </div>
  );
}
