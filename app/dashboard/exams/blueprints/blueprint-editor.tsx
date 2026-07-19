"use client";

// Build or edit an exam blueprint as ONE step-by-step wizard (matches the
// student profile edit flow — same Stepper rail + gradient step banner).
//   Create flow: College · Exam details · Sections · Review & publish
//   Edit flow:   Exam details · Sections · Review & publish
// Creating happens when you leave the Sections step; the wizard then continues
// straight into Review & publish (no redirect, no second wizard). Each section
// picks a subject, question count, a difficulty mix (must sum to 100) and an
// optional per-chapter quota (must sum to 100); a subject can't be used twice.
// Saves through /api/exam/blueprints. Built to docs/STYLE_GUIDE.md.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollegePicker, type College } from "@/components/analytics/CollegePicker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Stepper } from "@/components/students/registration-fields";
import { RichContent } from "@/components/exam/RichContent";
import { createClient } from "@/lib/supabase/client";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  fetchPaperForPrint,
  type Blueprint,
  type Chapter,
  type Difficulty,
  type PrintPaper,
  type Subject,
} from "@/lib/exam-query";

// ISO (UTC) → the `YYYY-MM-DDTHH:mm` local string a datetime-local input expects.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type QuotaRow = { chapterId: string; pct: number };
type SectionState = {
  id: string; // stable key + accordion value (not persisted)
  subjectId: string;
  numQuestions: number;
  marksPerQuestion: number;
  easy: number;
  medium: number;
  hard: number;
  veryHard: number;
  useQuota: boolean;
  quota: QuotaRow[];
};

const emptySection = (): Omit<SectionState, "id"> => ({
  subjectId: "",
  numQuestions: 10,
  marksPerQuestion: 1,
  easy: 40,
  medium: 30,
  hard: 20,
  veryHard: 10,
  useQuota: false,
  quota: [],
});

type Shortfall = {
  subject_id: string;
  chapter_id: string;
  difficulty: string;
  required: number;
  available: number;
};

const PRIMARY_BTN =
  "bg-gradient-to-r from-[#2563eb] to-[#7c3aed] font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:brightness-105";

export function BlueprintEditor({
  blueprint,
  initialCollege = null,
  collegeLocked = false,
  initialOpensAt = null,
  paper: initialPaper = null,
}: {
  blueprint?: Blueprint;
  /** Create flow: college prefilled (locked admins) or null (owner/admin picks). */
  initialCollege?: College | null;
  /** Create flow: a College Admin can't change their college. */
  collegeLocked?: boolean;
  /** Edit mode: the sitting's scheduled start (ISO) — prefills the Schedule step. */
  initialOpensAt?: string | null;
  /** The generated paper (edit mode: from the server), shown inline on Review. */
  paper?: PrintPaper | null;
}) {
  const router = useRouter();
  // Seeded from the prop (edit mode); re-fetched client-side right after publish
  // so the generated paper appears inline on Review with no navigation — this
  // also covers the create flow, where router.refresh() can't supply it.
  const [paper, setPaper] = useState<PrintPaper | null>(initialPaper);

  // Same 4 steps whether creating or editing — and no staff step (spec D3).
  const STEP_LABELS = ["College", "Exam details", "Sections", "Review & publish", "Schedule"];
  const lastStep = STEP_LABELS.length;
  const [step, setStep] = useState(1);
  const label = STEP_LABELS[step - 1];

  // Null until the blueprint exists in the DB (edit mode: from the prop; create
  // mode: set once "Create & continue" succeeds). Drives create-vs-update.
  const [savedId, setSavedId] = useState<string | null>(blueprint?.id ?? null);
  const creating = savedId === null;

  const [college, setCollege] = useState<College | null>(initialCollege);
  const collegeId = college?.id;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<string, Chapter[]>>({});

  const [title, setTitle] = useState(blueprint?.title ?? "");
  const [duration, setDuration] = useState(blueprint?.durationMinutes ?? 60);
  const [negative, setNegative] = useState(blueprint?.negativeMarkPerWrong ?? 0);
  const [shuffleQuestions, setShuffleQuestions] = useState(blueprint?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(blueprint?.shuffleOptions ?? true);

  // Schedule step (start time + duration). datetime-local strings.
  const [startAt, setStartAt] = useState(toLocalInput(initialOpensAt));
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  // Once the admin edits duration, stop auto-suggesting it from the question count.
  // In edit mode, respect the saved duration (don't auto-override with the
  // suggestion); in create mode, keep suggesting until the user types a value.
  const durationEdited = useRef(Boolean(blueprint));

  // Monotonic id source for section keys / accordion values (survives removals).
  const seq = useRef(0);
  const [sections, setSections] = useState<SectionState[]>(() =>
    (blueprint
      ? blueprint.sections.map((s) => ({
          subjectId: s.subjectId,
          numQuestions: s.numQuestions,
          marksPerQuestion: s.marksPerQuestion,
          easy: s.pctEasy,
          medium: s.pctMedium,
          hard: s.pctHard,
          veryHard: s.pctVeryHard,
          useQuota: s.chapterQuota.length > 0,
          quota: s.chapterQuota.map((q) => ({ chapterId: q.chapterId, pct: q.pct })),
        }))
      : [emptySection()]
    ).map((s) => ({ ...s, id: `s${seq.current++}` })),
  );
  // Which section panels are expanded. Start with all open.
  const [openSections, setOpenSections] = useState<string[]>(() => sections.map((s) => s.id));

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>(blueprint?.status ?? "draft");
  const [error, setError] = useState("");
  const [feasibility, setFeasibility] = useState<{ ok: boolean; shortfalls: Shortfall[] } | null>(
    null,
  );
  // Snapshot of the last-saved form, to detect unsaved changes (dirty).
  const [savedFp, setSavedFp] = useState<string | null>(null);

  useEffect(() => {
    // Subjects are global (the bank is shared); the blueprint's college is only
    // used when creating the exam itself.
    fetch("/api/exam/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => {});
  }, []);

  const loadChapters = useCallback(
    async (sid: string) => {
      if (!sid || chaptersBySubject[sid]) return;
      const res = await fetch(`/api/exam/chapters?subject_id=${sid}`);
      const data = await res.json();
      if (res.ok) setChaptersBySubject((prev) => ({ ...prev, [sid]: data.chapters ?? [] }));
    },
    [chaptersBySubject],
  );

  // Preload chapters for sections that already use a quota (edit mode).
  useEffect(() => {
    sections.forEach((s) => {
      if (s.useQuota && s.subjectId) loadChapters(s.subjectId);
    });
  }, [sections, loadChapters]);

  // Suggested duration: 1 minute per question. Keep syncing it until the admin
  // edits the duration field, then leave their value alone.
  const totalQuestions = sections.reduce((n, s) => n + (Number(s.numQuestions) || 0), 0);
  useEffect(() => {
    if (!durationEdited.current && totalQuestions > 0) setDuration(totalQuestions);
  }, [totalQuestions]);

  function update(i: number, patch: Partial<SectionState>) {
    setSections((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setFeasibility(null);
  }

  function addSection() {
    const id = `s${seq.current++}`;
    setSections((prev) => [...prev, { ...emptySection(), id }]);
    setOpenSections((prev) => [...prev, id]); // auto-expand the new one
    setFeasibility(null);
  }

  function removeSection(i: number, id: string) {
    setSections((prev) => prev.filter((_, j) => j !== i));
    setOpenSections((prev) => prev.filter((v) => v !== id));
    setFeasibility(null);
  }

  function mixSum(s: SectionState) {
    return s.easy + s.medium + s.hard + s.veryHard;
  }
  function quotaSum(s: SectionState) {
    return s.quota.reduce((a, q) => a + (q.pct || 0), 0);
  }

  function buildBody() {
    return {
      title,
      college_id: collegeId, // used on create; ignored on PATCH
      duration_minutes: duration,
      negative_mark_per_wrong: negative,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      sections: sections.map((s) => ({
        subject_id: s.subjectId,
        num_questions: s.numQuestions,
        marks_per_question: s.marksPerQuestion,
        difficulty_mix: { easy: s.easy, medium: s.medium, hard: s.hard, very_hard: s.veryHard },
        chapter_quota: s.useQuota ? s.quota.filter((q) => q.chapterId) : undefined,
      })),
    };
  }

  // Fingerprint of the meaningful form fields → drives the dirty / can-save state.
  const formFp = () =>
    JSON.stringify({
      title,
      duration,
      negative,
      shuffleQuestions,
      shuffleOptions,
      sections: sections.map(({ id: _id, ...rest }) => rest),
    });
  const currentFp = formFp();
  // Baseline = the form as first loaded (the saved blueprint).
  useEffect(() => {
    setSavedFp(formFp());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dirty = savedFp !== null && currentFp !== savedFp;
  const busy = saving || publishing || checking;
  const canCreate = title.trim().length > 0 && Boolean(collegeId);
  const canSubmit = !busy && (creating ? canCreate : dirty);

  async function schedule() {
    if (!savedId || scheduling) return;
    if (!startAt) return setError("Set a start time.");
    setError("");
    setScheduling(true);
    try {
      const res = await fetch(`/api/exam/blueprints/${savedId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_minutes: duration,
          opens_at: new Date(startAt).toISOString(),
          // End time is derived: start + duration (not separately editable).
          closes_at: new Date(new Date(startAt).getTime() + duration * 60000).toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Could not schedule");
      // Scheduling is the final step — only now is the exam fully published.
      setStatus("published");
      setScheduled(true);
      router.refresh();
    } finally {
      setScheduling(false);
    }
  }

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
  // Resolve a chapter name from whatever's been loaded (null if unknown).
  const chapterName = (id: string) => {
    for (const list of Object.values(chaptersBySubject)) {
      const c = list.find((x) => x.id === id);
      if (c) return c.name;
    }
    return null;
  };
  // Ensure chapter names for the shortfall rows can be shown as words, not ids.
  const loadShortfallChapters = (list: Shortfall[]) =>
    new Set(list.map((s) => s.subject_id)).forEach((sid) => loadChapters(sid));

  // Create (POST) or update (PATCH). On create success, adopt the new id and
  // advance into Review & publish — staying in this same wizard instance.
  async function save() {
    if (!canSubmit) return;
    const fp = currentFp;
    setError("");
    setSaving(true);
    try {
      const url = creating ? "/api/exam/blueprints" : `/api/exam/blueprints/${savedId}`;
      const res = await fetch(url, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors as string[])?.join("; ") || data.error || "Could not save");
        return;
      }
      setSavedFp(fp); // changes now saved → clears dirty
      if (creating && data.id) {
        setSavedId(data.id as string);
        setStep((s) => Math.min(lastStep, s + 1)); // → Review & publish
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function runFeasibility() {
    if (!savedId || busy) return;
    setError("");
    setChecking(true);
    try {
      const res = await fetch(`/api/exam/blueprints/${savedId}/feasibility`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Feasibility check failed");
      const shortfalls: Shortfall[] = data.shortfalls ?? [];
      setFeasibility({ ok: data.ok, shortfalls });
      loadShortfallChapters(shortfalls);
    } finally {
      setChecking(false);
    }
  }

  async function publish() {
    // Allowed when already published too — re-publishing regenerates the paper
    // (the route deletes any existing paper and writes a fresh one). The route
    // rejects it once the exam's window has opened.
    if (!savedId || busy || dirty) return;
    setError("");
    setPublishing(true);
    try {
      const res = await fetch(`/api/exam/blueprints/${savedId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate the paper");
        if (data.shortfalls) {
          setFeasibility({ ok: false, shortfalls: data.shortfalls });
          loadShortfallChapters(data.shortfalls);
        }
        return;
      }
      // Show the generated paper inline (no navigation). The exam stays in Draft
      // until the Schedule step is completed — see schedule().
      if (data.session_id) {
        try {
          setPaper(await fetchPaperForPrint(createClient(), data.session_id as string));
        } catch {
          /* inline preview is best-effort — the paper was generated regardless */
        }
      }
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <Stepper steps={STEP_LABELS} step={step} onJump={setStep} />

      <div className="bg-card overflow-hidden rounded-3xl border p-5 shadow-xl shadow-[#7c3aed]/5 sm:p-8">
        <p className="-mx-5 -mt-5 mb-6 bg-gradient-to-r from-[#2563eb] to-[#7c3aed] px-5 py-3 text-sm font-bold tracking-[0.04em] text-white sm:-mx-8 sm:-mt-8 sm:px-8">
          Step {step} of {lastStep} · {label}
        </p>

        {error && (
          <p className="text-destructive bg-destructive/10 mb-4 rounded-md border border-destructive/20 px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {/* ---- College (create flow only) ---- */}
        {label === "College" && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              {collegeLocked
                ? "This exam will be created for your college."
                : "Choose the college this exam blueprint belongs to."}
            </p>
            <CollegePicker
              selected={college}
              disabled={collegeLocked}
              onSelect={setCollege}
              onClear={() => setCollege(null)}
            />
          </div>
        )}

        {/* ---- Exam details ---- */}
        {label === "Exam details" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ICET Mock — Batch 2026"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="negative">Negative mark per wrong</Label>
              <Input
                id="negative"
                type="number"
                min={0}
                step="0.25"
                value={negative}
                onChange={(e) => setNegative(Number(e.target.value))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={shuffleQuestions}
                onCheckedChange={(v) => setShuffleQuestions(v === true)}
              />
              Shuffle question order
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={shuffleOptions}
                onCheckedChange={(v) => setShuffleOptions(v === true)}
              />
              Shuffle option order
            </label>
          </div>
        )}

        {/* ---- Sections ---- */}
        {label === "Sections" && (
          <div className="grid gap-4">
            <p className="text-muted-foreground text-sm">
              Each section draws questions from one subject. A subject can be used once.
            </p>
            <Accordion
              type="multiple"
              value={openSections}
              onValueChange={setOpenSections}
              className="grid gap-4"
            >
              {sections.map((s, i) => {
                const sum = mixSum(s);
                const chapters = chaptersBySubject[s.subjectId] ?? [];
                const qSum = quotaSum(s);
                // Subjects already chosen by OTHER sections are hidden here, so a
                // subject can't be picked twice. The section's own pick stays.
                const usedElsewhere = new Set(
                  sections.filter((_, j) => j !== i).map((o) => o.subjectId).filter(Boolean),
                );
                const subjectOptions = subjects.filter((sub) => !usedElsewhere.has(sub.id));
                const subjLabel = s.subjectId ? subjectName(s.subjectId) : null;

                return (
                  <AccordionItem
                    key={s.id}
                    value={s.id}
                    className="bg-card rounded-xl border px-4 shadow-sm"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex flex-1 flex-wrap items-baseline gap-x-2 text-left">
                        <span className="font-semibold">Section {i + 1}</span>
                        <span className="text-muted-foreground text-sm font-normal">
                          {subjLabel
                            ? `· ${subjLabel} · ${s.numQuestions} question${s.numQuestions === 1 ? "" : "s"}`
                            : "· not configured"}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="grid gap-4">
                      {sections.length > 1 && (
                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => removeSection(i, s.id)}>
                            Remove section
                          </Button>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label>Subject</Label>
                          <Select
                            value={s.subjectId}
                            onValueChange={(v) => {
                              update(i, { subjectId: v, quota: [] });
                              loadChapters(v);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {subjectOptions.map((sub) => (
                                <SelectItem key={sub.id} value={sub.id}>
                                  {sub.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label>Questions</Label>
                          <Input
                            type="number"
                            min={1}
                            value={s.numQuestions}
                            onChange={(e) => update(i, { numQuestions: Number(e.target.value) })}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label>Marks each</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.25"
                            value={s.marksPerQuestion}
                            onChange={(e) =>
                              update(i, { marksPerQuestion: Number(e.target.value) })
                            }
                          />
                        </div>
                      </div>

                      {/* Difficulty mix */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <Label className="text-xs">Difficulty mix (%)</Label>
                          <span
                            className={`text-xs ${sum === 100 ? "text-muted-foreground" : "text-destructive"}`}
                          >
                            sum {sum}
                            {sum !== 100 ? " — must be 100" : ""}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(["easy", "medium", "hard", "veryHard"] as const).map((key, di) => (
                            <div key={key} className="grid gap-1">
                              <Label className="text-xs">
                                {DIFFICULTY_LABELS[DIFFICULTIES[di]]}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={s[key]}
                                onChange={(e) =>
                                  update(i, {
                                    [key]: Number(e.target.value),
                                  } as Partial<SectionState>)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Optional per-chapter quota */}
                      <div>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={s.useQuota}
                            onCheckedChange={(v) => {
                              update(i, { useQuota: v === true });
                              if (v === true) loadChapters(s.subjectId);
                            }}
                          />
                          Set per-chapter quota (otherwise spread evenly across chapters)
                        </label>
                        {s.useQuota && (
                          <div className="mt-2 grid gap-2">
                            {s.quota.map((q, qi) => (
                              <div key={qi} className="flex items-center gap-2">
                                <Select
                                  value={q.chapterId}
                                  onValueChange={(v) =>
                                    update(i, {
                                      quota: s.quota.map((x, j) =>
                                        j === qi ? { ...x, chapterId: v } : x,
                                      ),
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select chapter…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {chapters.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  className="w-24"
                                  value={q.pct}
                                  onChange={(e) =>
                                    update(i, {
                                      quota: s.quota.map((x, j) =>
                                        j === qi ? { ...x, pct: Number(e.target.value) } : x,
                                      ),
                                    })
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    update(i, { quota: s.quota.filter((_, j) => j !== qi) })
                                  }
                                >
                                  ✕
                                </Button>
                              </div>
                            ))}
                            <div className="flex items-center gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  update(i, { quota: [...s.quota, { chapterId: "", pct: 0 }] })
                                }
                              >
                                Add chapter
                              </Button>
                              <span
                                className={`text-xs ${qSum === 100 ? "text-muted-foreground" : "text-destructive"}`}
                              >
                                sum {qSum}
                                {qSum !== 100 ? " — must be 100" : ""}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            <div>
              <Button
                variant="outline"
                onClick={addSection}
                disabled={subjects.length > 0 && sections.length >= subjects.length}
              >
                Add section
              </Button>
            </div>
          </div>
        )}

        {/* ---- Review & publish ---- */}
        {label === "Review & publish" && savedId && (
          <div className="grid gap-6">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={runFeasibility} disabled={busy}>
                  {checking ? "Checking…" : "Check feasibility"}
                </Button>
                {paper && !dirty && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    Paper generated — shown below
                  </span>
                )}
                {dirty && (
                  <span className="text-muted-foreground text-xs">
                    Save your changes before publishing.
                  </span>
                )}
              </div>
              {feasibility &&
                (feasibility.ok ? (
                  <p className="rounded-md border border-emerald-600/20 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                    ✓ The question bank has enough questions for every section of this blueprint.
                  </p>
                ) : (
                  <div className="grid gap-2 text-sm">
                    <p className="font-medium">
                      The question bank doesn&apos;t have enough questions for this blueprint yet.
                      Add more under <b>Questions</b>, then re-check:
                    </p>
                    <ul className="grid gap-2">
                      {feasibility.shortfalls.map((sf, k) => {
                        // difficulty "all" = a section-level total shortfall.
                        const isSection = sf.difficulty === "all";
                        const chap = chapterName(sf.chapter_id);
                        const diff = DIFFICULTY_LABELS[sf.difficulty as Difficulty] ?? sf.difficulty;
                        const gap = Math.max(0, sf.required - sf.available);
                        return (
                          <li
                            key={k}
                            className="border-destructive/20 bg-destructive/5 rounded-md border px-3 py-2"
                          >
                            <div className="font-medium">
                              {subjectName(sf.subject_id)}
                              {!isSection && chap ? ` → ${chap}` : ""}
                              {!isSection ? ` · ${diff}` : ""}
                            </div>
                            <div className="text-muted-foreground">
                              {isSection ? (
                                <>
                                  This section needs {sf.required} question
                                  {sf.required === 1 ? "" : "s"}, but only {sf.available} can be
                                  built from the bank.{" "}
                                  <span className="text-destructive font-medium">
                                    Add {gap} more question{gap === 1 ? "" : "s"} to this subject.
                                  </span>
                                </>
                              ) : (
                                <>
                                  Needs {sf.required} question{sf.required === 1 ? "" : "s"}, but the
                                  bank only has {sf.available}.{" "}
                                  <span className="text-destructive font-medium">
                                    Add {gap} more {diff.toLowerCase()} question
                                    {gap === 1 ? "" : "s"}
                                    {chap ? ` in ${chap}` : ""}.
                                  </span>
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
            </div>

            {paper && paper.questions.length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">
                  Generated paper — {paper.questions.length} question
                  {paper.questions.length === 1 ? "" : "s"} · {paper.totalMarks} marks
                </p>
                <ol className="grid gap-2">
                  {paper.questions.map((q, i) => (
                    <li key={q.position} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {i + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <RichContent content={q.stem} />
                          <ul className="text-muted-foreground mt-1 grid gap-0.5 pl-1 text-xs">
                            {q.options.map((o, i) => (
                              <li
                                key={i}
                                className={
                                  o.isCorrect
                                    ? "font-medium text-emerald-700 dark:text-emerald-400"
                                    : ""
                                }
                              >
                                {String.fromCharCode(65 + i)}.{" "}
                                <RichContent content={o.label} inline />
                                {o.isCorrect ? " ✓" : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ---- Schedule (start time + duration) ---- */}
        {label === "Schedule" && (
          <div className="grid gap-4">
            {!paper ? (
              <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-6 text-center text-sm">
                Generate the paper on the previous step first — scheduling needs it.
              </p>
            ) : scheduled ? (
              <p className="rounded-md border border-emerald-600/20 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                ✓ Scheduled. The exam opens automatically at the start time and every student of the
                college will then see it.
              </p>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(e) => {
                      durationEdited.current = true;
                      setDuration(Number(e.target.value));
                    }}
                  />
                  <p className="text-muted-foreground text-xs">
                    Suggested {totalQuestions} min ({totalQuestions} question
                    {totalQuestions === 1 ? "" : "s"} × 1 min).
                    {totalQuestions > 0 && duration !== totalQuestions && (
                      <button
                        type="button"
                        className="text-primary ml-1 underline"
                        onClick={() => {
                          durationEdited.current = false;
                          setDuration(totalQuestions);
                        }}
                      >
                        Use suggestion
                      </button>
                    )}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="start-at">Start time</Label>
                    <DateTimePicker id="start-at" value={startAt} onChange={setStartAt} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>End time</Label>
                    <div className="border-input bg-muted/40 text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm">
                      {startAt
                        ? new Date(new Date(startAt).getTime() + duration * 60000).toLocaleString(
                            undefined,
                            { dateStyle: "medium", timeStyle: "short" },
                          )
                        : "— set a start time"}
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  The exam opens automatically at the start time — no need to open it manually.
                </p>
              </>
            )}
          </div>
        )}

        {/* ---- Wizard nav ---- */}
        <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5">
          <Button
            variant="outline"
            disabled={step === 1 || busy}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="border-2 border-[#2563eb] font-semibold text-[#2563eb] hover:bg-[#2563eb]/5"
          >
            ← Back
          </Button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {label === "College" && (
              <Button
                onClick={() => setStep((s) => Math.min(lastStep, s + 1))}
                disabled={!collegeId}
                className={PRIMARY_BTN}
              >
                Next →
              </Button>
            )}

            {label === "Exam details" && (
              <Button onClick={() => setStep((s) => Math.min(lastStep, s + 1))} className={PRIMARY_BTN}>
                Next →
              </Button>
            )}

            {label === "Sections" &&
              (creating ? (
                <Button onClick={save} disabled={!canSubmit} className={PRIMARY_BTN}>
                  {saving ? "Creating…" : "Create & continue →"}
                </Button>
              ) : (
                <Button
                  onClick={() => setStep((s) => Math.min(lastStep, s + 1))}
                  className={PRIMARY_BTN}
                >
                  Next →
                </Button>
              ))}

            {label === "Review & publish" && (
              <>
                <Button onClick={save} disabled={!canSubmit} variant="outline">
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={publish}
                  disabled={busy || dirty}
                >
                  {publishing ? "Working…" : paper ? "Regenerate paper" : "Generate paper"}
                </Button>
                <Button
                  onClick={() => setStep((s) => Math.min(lastStep, s + 1))}
                  disabled={!paper}
                  className={PRIMARY_BTN}
                >
                  Next →
                </Button>
              </>
            )}

            {label === "Schedule" &&
              (scheduled ? (
                <Button asChild className={PRIMARY_BTN}>
                  <Link href="/dashboard/exams/papers">Done → Exam papers</Link>
                </Button>
              ) : (
                <Button
                  onClick={schedule}
                  disabled={scheduling || !paper || !startAt}
                  className={PRIMARY_BTN}
                >
                  {scheduling ? "Scheduling…" : "Schedule exam"}
                </Button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
