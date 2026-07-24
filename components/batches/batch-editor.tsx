"use client";

// Batch editor (issue #49, Phase 3). Create or edit a batch — a dated run of a
// course: pick the course (its default fee lines copy in), associate colleges,
// set optional dates, tweak the batch's own fee, and move it through its status
// lifecycle. Talks only to /api/admin/batches*.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Loader2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollegePicker, type College } from "@/components/colleges/college-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/fee-receipt";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/course-query";
import {
  BATCH_STATUSES,
  BATCH_STATUS_LABELS,
  BATCH_ENROLLMENT_STATUSES,
  BATCH_ENROLLMENT_STATUS_LABELS,
  type BatchDetail,
  type BatchStatus,
  type BatchEnrollmentStatus,
  type CourseOption,
} from "@/lib/batch-query";
import { cachedGet, invalidate } from "@/lib/fetch-cache";

type FeeRow = { label: string; amount: string };

export function BatchEditor({ batchId, embedded = false }: { batchId?: string; embedded?: boolean }) {
  const router = useRouter();
  const editing = Boolean(batchId);
  const [saved, setSaved] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [coursesRef, setCoursesRef] = useState<CourseOption[]>([]);

  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [status, setStatus] = useState<BatchStatus>("draft");
  const [enrollmentStatus, setEnrollmentStatus] = useState<BatchEnrollmentStatus>("not_open");
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);

  // Colleges: shared multi-select picker (searches the ~10k-row college table).
  const [colleges, setColleges] = useState<College[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ref = await cachedGet<{ courses?: CourseOption[] }>("/api/admin/batches/reference");
        if (cancelled) return;
        setCoursesRef(ref.courses ?? []);

        if (batchId) {
          const json = await cachedGet<{ batch: BatchDetail }>(`/api/admin/batches/${batchId}`);
          if (cancelled) return;
          const bt = json.batch as BatchDetail;
          setCourseId(bt.courseId);
          setName(bt.name);
          setCode(bt.code);
          setAcademicYear(bt.academicYear ?? "");
          setDeliveryMode(bt.deliveryMode ?? "");
          setStartDate(bt.startDate ?? "");
          setEndDate(bt.endDate ?? "");
          setCurrency(bt.currency);
          setStatus(bt.status);
          setEnrollmentStatus(bt.enrollmentStatus);
          setColleges(bt.colleges);
          setFeeRows(bt.feeLines.map((f) => ({ label: f.label, amount: paiseToRupeeInput(f.amountPaise) })));
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
  }, [batchId]);

  const selectedCourse = useMemo(
    () => coursesRef.find((c) => c.id === courseId),
    [coursesRef, courseId]
  );

  const copyFeeFromCourse = useCallback(
    (course?: CourseOption) => {
      const src = course ?? selectedCourse;
      if (!src) return;
      setFeeRows(src.feeLines.map((f) => ({ label: f.label, amount: paiseToRupeeInput(f.amountPaise) })));
    },
    [selectedCourse]
  );

  const onCourseChange = (id: string) => {
    setCourseId(id);
    // On first pick (new batch, no fee lines yet) copy the course's defaults.
    if (!editing && feeRows.length === 0) copyFeeFromCourse(coursesRef.find((c) => c.id === id));
  };

  const addFee = () => setFeeRows((p) => [...p, { label: "", amount: "" }]);
  const removeFee = (i: number) => setFeeRows((p) => p.filter((_, idx) => idx !== i));
  const setFee = (i: number, patch: Partial<FeeRow>) =>
    setFeeRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const totalPaise = useMemo(
    () => feeRows.reduce((s, r) => s + (Number.isFinite(rupeesToPaise(r.amount)) ? rupeesToPaise(r.amount) : 0), 0),
    [feeRows]
  );

  async function save() {
    setFormError("");
    if (!courseId) return setFormError("Pick a course for this batch.");
    if (!name.trim()) return setFormError("Batch name is required.");
    if (!code.trim()) return setFormError("A batch code is required.");

    const feeLines: { label: string; amountPaise: number }[] = [];
    for (const r of feeRows) {
      if (!r.label.trim() && !r.amount.trim()) continue;
      if (!r.label.trim()) return setFormError("Every fee line needs a label.");
      const paise = rupeesToPaise(r.amount);
      if (!Number.isFinite(paise)) return setFormError(`Fee amount for "${r.label}" is not a valid number.`);
      feeLines.push({ label: r.label.trim(), amountPaise: paise });
    }

    const payload = {
      courseId,
      name: name.trim(),
      code: code.trim(),
      academicYear: academicYear.trim() || null,
      deliveryMode: deliveryMode || null,
      startDate: startDate || null,
      endDate: endDate || null,
      currency: currency.trim() || "INR",
      status,
      enrollmentStatus,
      collegeIds: colleges.map((c) => c.id),
      feeLines,
    };

    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/batches/${batchId}` : "/api/admin/batches", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (editing) {
        // Batch changed → refresh its cached detail; a course change alters the
        // syllabus, so drop the cached subjects too.
        invalidate(`/api/admin/batches/${batchId}`);
        invalidate(`/api/admin/batches/${batchId}/subjects`);
      }
      if (embedded) {
        setSaved(true);
        setSaving(false);
        router.refresh();
      } else {
        router.push("/dashboard/batches");
        router.refresh();
      }
    } catch (e) {
      setFormError((e as Error).message);
      setSaving(false);
    }
  }

  // Deliberate lifecycle action (lives here in the Details tab, not the list, so
  // it can't be clicked by accident). Status-only PATCH, mirrors the old list.
  async function changeStatus(next: BatchStatus) {
    if (next === "closed" && !confirm("Close this batch? No new students can be enrolled while it's closed.")) return;
    setFormError("");
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/admin/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update status");
      setStatus(next);
      invalidate(`/api/admin/batches/${batchId}`);
      router.refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setStatusBusy(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  if (loadError)
    return embedded ? (
      <p className="text-destructive py-6 text-sm">{loadError}</p>
    ) : (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/dashboard/batches">Back to batches</Link>
        </Button>
      </div>
    );

  return (
    <div className={embedded ? undefined : "mx-auto max-w-3xl"}>
      {!embedded && (
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{editing ? "Edit batch" : "New batch"}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              A dated run of a course — associated colleges, its own fee, and a status you move through
              to close.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/batches">
              <ArrowLeft /> Back
            </Link>
          </Button>
        </header>
      )}

      <div className="grid gap-6">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="b-course">
                  Course <span className="text-primary">*</span>
                </Label>
                <Select value={courseId || undefined} onValueChange={onCourseChange}>
                  <SelectTrigger id="b-course" className="w-full">
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {coursesRef.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {coursesRef.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    No active courses. Create one under Courses first.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as BatchStatus)}>
                  <SelectTrigger id="b-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BATCH_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {BATCH_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-enrolment">Enrolment</Label>
                <Select value={enrollmentStatus} onValueChange={(v) => setEnrollmentStatus(v as BatchEnrollmentStatus)}>
                  <SelectTrigger id="b-enrolment" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BATCH_ENROLLMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {BATCH_ENROLLMENT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Only <span className="font-medium">Open</span> accepts new student enrolments. Use{" "}
                  <span className="font-medium">Closed</span> to stop them while the batch still runs.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="b-name">
                  Batch name <span className="text-primary">*</span>
                </Label>
                <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SVEC · Aug 2026" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-code">
                  Code <span className="text-primary">*</span>
                </Label>
                <Input id="b-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PRP-SVEC-2608" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="b-ay">Academic year</Label>
                <Input id="b-ay" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2026-27" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-mode">Delivery</Label>
                <Select value={deliveryMode || undefined} onValueChange={setDeliveryMode}>
                  <SelectTrigger id="b-mode" className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-cur">Currency</Label>
                <Input id="b-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="b-start">Start date</Label>
                <DatePicker id="b-start" value={startDate} onChange={setStartDate} placeholder="Pick a start date" clearable />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-end">End date</Label>
                <DatePicker id="b-end" value={endDate} onChange={setEndDate} placeholder="Open-ended" clearable />
                <p className="text-muted-foreground text-xs">Optional — leave open until you close the batch.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Colleges */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Associated colleges</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <CollegePicker
              multiple
              label={null}
              values={colleges}
              onChange={setColleges}
              placeholder="Search colleges by name (type 2+ letters)…"
            />
            {colleges.length === 0 && (
              <p className="text-muted-foreground text-sm">No colleges associated yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Fee */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Batch fee</CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyFeeFromCourse()}
                disabled={!selectedCourse || selectedCourse.feeLines.length === 0}
              >
                <Copy /> Copy from course
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addFee}>
                <Plus /> Add line
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {feeRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No fee lines. Copy the course default or add lines. A free batch can have none.
              </p>
            ) : (
              <>
                {feeRows.map((row, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1.5">
                      {i === 0 && <Label className="text-xs">Item</Label>}
                      <Input value={row.label} onChange={(e) => setFee(i, { label: e.target.value })} placeholder="e.g. Tuition" />
                    </div>
                    <div className="grid w-36 gap-1.5">
                      {i === 0 && <Label className="text-xs">Amount (₹)</Label>}
                      <Input inputMode="decimal" value={row.amount} onChange={(e) => setFee(i, { amount: e.target.value })} placeholder="0" />
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
        {saved && !formError && <p className="text-sm text-emerald-600">Saved.</p>}

        <div className="flex flex-wrap items-center gap-2">
          {editing &&
            (status === "closed" ? (
              <Button variant="outline" onClick={() => changeStatus("open")} disabled={statusBusy}>
                {statusBusy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                Reopen batch
              </Button>
            ) : status !== "cancelled" ? (
              <Button
                variant="outline"
                onClick={() => changeStatus("closed")}
                disabled={statusBusy}
                className="text-destructive hover:text-destructive"
              >
                {statusBusy ? <Loader2 className="animate-spin" /> : <Lock />}
                Close batch
              </Button>
            ) : null)}
          <div className="ml-auto flex gap-2">
            {!embedded && (
              <Button variant="outline" asChild>
                <Link href="/dashboard/batches">Cancel</Link>
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {editing ? "Save changes" : "Create batch"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
