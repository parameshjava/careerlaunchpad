"use client";

// Course template editor (issue #49). Create or edit a course: its details, the
// competitive exams it prepares for, and a default fee. The course's SYLLABUS is
// not authored here — it is inherited from the competitive exams and shown read-only.
// Talks only to /api/admin/courses*.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/fee-receipt";
import { paiseToRupeeInput, rupeesToPaise, type CourseDetail } from "@/lib/course-query";
import type { CompetitiveExamSyllabus } from "@/lib/competitive-exam-query";

type FeeRow = { label: string; amount: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CourseEditor({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const editing = Boolean(courseId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [examsRef, setExamsRef] = useState<CompetitiveExamSyllabus[]>([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [examIds, setExamIds] = useState<string[]>([]);
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);

  // Inline "add a competitive exam" so the catalog can be extended here too.
  const [newExamCode, setNewExamCode] = useState("");
  const [newExamName, setNewExamName] = useState("");
  const [addingExam, setAddingExam] = useState(false);
  const [examAddError, setExamAddError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refRes = await fetch("/api/admin/courses/reference");
        const ref = await refRes.json();
        if (!refRes.ok) throw new Error(ref.error ?? "Could not load options");
        if (cancelled) return;
        setExamsRef(ref.competitiveExams ?? []);

        if (courseId) {
          const res = await fetch(`/api/admin/courses/${courseId}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Could not load course");
          if (cancelled) return;
          const c = json.course as CourseDetail;
          setName(c.name);
          setSlug(c.slug);
          setSlugEdited(true);
          setCategory(c.category ?? "");
          setDescription(c.description ?? "");
          setStatus(c.status);
          setExamIds(c.competitiveExamIds);
          setFeeRows(
            c.feeLines.length
              ? c.feeLines.map((f) => ({ label: f.label, amount: paiseToRupeeInput(f.amountPaise) }))
              : []
          );
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const onName = (v: string) => {
    setName(v);
    if (!editing && !slugEdited) setSlug(slugify(v));
  };

  const toggleExam = (id: string) =>
    setExamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function addCompetitiveExam() {
    setExamAddError("");
    const code = newExamCode.trim().toUpperCase();
    const name = newExamName.trim();
    if (!code || !name) return setExamAddError("Both a code and a name are required.");
    setAddingExam(true);
    try {
      const res = await fetch("/api/admin/competitive-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add exam");
      const exam = json.competitiveExam as { id: string; code: string; name: string };
      setExamsRef((prev) => [...prev, { ...exam, subjects: [] }]);
      setExamIds((prev) => [...prev, exam.id]);
      setNewExamCode("");
      setNewExamName("");
    } catch (e) {
      setExamAddError((e as Error).message);
    } finally {
      setAddingExam(false);
    }
  }

  const addFee = () => setFeeRows((p) => [...p, { label: "", amount: "" }]);
  const removeFee = (i: number) => setFeeRows((p) => p.filter((_, idx) => idx !== i));
  const setFee = (i: number, patch: Partial<FeeRow>) =>
    setFeeRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const totalPaise = useMemo(
    () => feeRows.reduce((s, r) => s + (Number.isFinite(rupeesToPaise(r.amount)) ? rupeesToPaise(r.amount) : 0), 0),
    [feeRows]
  );

  // Syllabus inherited from the selected exams: union of their subjects/chapters.
  const inheritedSyllabus = useMemo(() => {
    const bySubject = new Map<string, { name: string; chapters: Map<string, string> }>();
    for (const ex of examsRef) {
      if (!examIds.includes(ex.id)) continue;
      for (const s of ex.subjects) {
        const entry = bySubject.get(s.subjectId) ?? { name: s.name, chapters: new Map() };
        for (const ch of s.chapters) entry.chapters.set(ch.id, ch.name);
        bySubject.set(s.subjectId, entry);
      }
    }
    return [...bySubject.values()].map((v) => ({ name: v.name, chapters: [...v.chapters.values()] }));
  }, [examsRef, examIds]);

  async function save() {
    setFormError("");
    if (!name.trim()) return setFormError("Course name is required.");
    if (!slug.trim()) return setFormError("A slug is required.");

    const feeLines: { label: string; amountPaise: number }[] = [];
    for (const r of feeRows) {
      if (!r.label.trim() && !r.amount.trim()) continue;
      if (!r.label.trim()) return setFormError("Every fee line needs a label.");
      const paise = rupeesToPaise(r.amount);
      if (!Number.isFinite(paise)) return setFormError(`Fee amount for "${r.label}" is not a valid number.`);
      feeLines.push({ label: r.label.trim(), amountPaise: paise });
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      status,
      competitiveExamIds: examIds,
      feeLines,
    };

    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/courses/${courseId}` : "/api/admin/courses", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      router.push("/dashboard/courses");
      router.refresh();
    } catch (e) {
      setFormError((e as Error).message);
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  if (loadError)
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/courses">Back to courses</Link>
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {editing ? "Edit course" : "New course"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            A reusable template — competitive exams (which define the syllabus) and a default fee.
            Batches are created from it later.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/courses">
            <ArrowLeft /> Back
          </Link>
        </Button>
      </header>

      <div className="grid gap-6">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">
                Course name <span className="text-primary">*</span>
              </Label>
              <Input id="c-name" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Bank PO Prep" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="c-slug">
                  Slug <span className="text-primary">*</span>
                </Label>
                <Input
                  id="c-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugEdited(true);
                  }}
                  placeholder="bank-po-prep"
                />
                <p className="text-muted-foreground text-xs">Lowercase letters, numbers, hyphens.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-category">Category</Label>
                <Input id="c-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Banking, MBA" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-desc">Description</Label>
              <MarkdownEditor
                id="c-desc"
                value={description}
                onChange={setDescription}
                placeholder="Describe the course. **Markdown** supported — headings, lists, bold…"
              />
            </div>
            {editing && (
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="c-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "active" | "archived")}>
                  <SelectTrigger id="c-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Competitive exams */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitive exams</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {examsRef.length === 0 ? (
              <p className="text-muted-foreground text-sm">No competitive exams yet — add one below.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {examsRef.map((ex) => {
                  const on = examIds.includes(ex.id);
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => toggleExam(ex.id)}
                      className={
                        "rounded-full border px-3 py-1 text-sm transition-colors " +
                        (on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground hover:bg-muted/70")
                      }
                      title={ex.name}
                    >
                      {ex.code}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-2 border-t pt-3">
              <Label className="text-muted-foreground text-xs">Add a competitive exam</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newExamCode}
                  onChange={(e) => setNewExamCode(e.target.value)}
                  placeholder="Code (e.g. NEET)"
                  className="w-36 uppercase"
                />
                <Input
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                  placeholder="Full name"
                  className="min-w-48 flex-1"
                />
                <Button type="button" variant="outline" onClick={addCompetitiveExam} disabled={addingExam}>
                  {addingExam ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                New exams start with no syllabus — add subjects &amp; chapters under Competitive exams.
              </p>
              {examAddError && <p className="text-destructive text-sm">{examAddError}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Inherited syllabus (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Syllabus</CardTitle>
          </CardHeader>
          <CardContent>
            {examIds.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Select competitive exams above — the syllabus is inherited from them.
              </p>
            ) : inheritedSyllabus.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                The selected exam(s) have no syllabus yet. Add subjects &amp; chapters to them under
                Competitive exams.
              </p>
            ) : (
              <ul className="grid gap-3">
                {inheritedSyllabus.map((s) => (
                  <li key={s.name}>
                    <div className="text-sm font-semibold">{s.name}</div>
                    {s.chapters.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {s.chapters.map((ch) => (
                          <span key={ch} className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
                            {ch}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground mt-1 text-xs">No chapters selected on the exam.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Default fee template */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Default fee</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addFee}>
              <Plus /> Add line
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {feeRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No fee lines. A new batch copies these; you can still set the price per batch later.
              </p>
            ) : (
              <>
                {feeRows.map((row, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1.5">
                      {i === 0 && <Label className="text-xs">Item</Label>}
                      <Input
                        value={row.label}
                        onChange={(e) => setFee(i, { label: e.target.value })}
                        placeholder="e.g. Tuition"
                      />
                    </div>
                    <div className="grid w-36 gap-1.5">
                      {i === 0 && <Label className="text-xs">Amount (₹)</Label>}
                      <Input
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => setFee(i, { amount: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFee(i)}
                      aria-label="Remove fee line"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatINR(totalPaise)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/courses">Cancel</Link>
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {editing ? "Save changes" : "Create course"}
          </Button>
        </div>
      </div>
    </div>
  );
}
