"use client";

// Batch class scheduling (issue #64). Staff schedule a one-off or weekly-recurring
// class for a subject of the batch; on save the server creates the Zoom meeting
// and emails the subject's mentors a calendar invite. Talks only to
// /api/admin/batches/[id]/{subjects,sessions}.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Loader2, Pencil, Repeat, Save, Trash2, Video, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import type { CalendarSession } from "@/lib/calendar-query";

const TZ = "Asia/Kolkata";
const WEEKDAYS = [
  { dow: 1, label: "M" }, { dow: 2, label: "T" }, { dow: 3, label: "W" },
  { dow: 4, label: "T" }, { dow: 5, label: "F" }, { dow: 6, label: "S" }, { dow: 0, label: "S" },
];
type Subject = { subjectId: string; name: string };

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short" }).format(new Date(iso));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
// ISO instant → DateTimePicker value "YYYY-MM-DDTHH:mm" in IST wall-clock.
const toLocalInput = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};

export function BatchSchedule({ batchId, embedded = false }: { batchId: string; embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sessions, setSessions] = useState<CalendarSession[]>([]);

  // form
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"online" | "offline" | "hybrid">("online");
  const [repeat, setRepeat] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [durationMin, setDurationMin] = useState("90");
  const [byWeekday, setByWeekday] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState("10:00");
  const [startsOn, setStartsOn] = useState("");
  const [until, setUntil] = useState("");
  const [createZoom, setCreateZoom] = useState(true);
  const [meetingUrl, setMeetingUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  // Editing an existing series (null = creating a new class).
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);

  // Cancel-confirmation dialog (replaces the browser confirm()).
  // choice=true → offer "this occurrence only" vs "whole series" (series anchor);
  // choice=false → single-occurrence cancel (individual occurrence / one-off).
  const [cancelFor, setCancelFor] = useState<{ sessionId: string; title: string; choice: boolean } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState("");
  // Typed confirmation guards against accidental cancels.
  const [cancelConfirm, setCancelConfirm] = useState("");
  const cancelConfirmed = cancelConfirm.trim().toUpperCase() === "CANCEL";

  // Edit a single occurrence (reschedule / prepone / postpone one class).
  const [editOccFor, setEditOccFor] = useState<{ sessionId: string } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editDur, setEditDur] = useState("90");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  const sessionsUrl = `/api/admin/batches/${batchId}/sessions`;

  // Refresh sessions after a mutation: drop the cache, then reload.
  const reloadSessions = useCallback(async () => {
    invalidate(sessionsUrl);
    const json = await cachedGet<{ sessions: CalendarSession[] }>(sessionsUrl);
    setSessions(json.sessions ?? []);
  }, [sessionsUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subJson, sesJson] = await Promise.all([
          cachedGet<{ subjects: { subjectId: string; name: string }[] }>(`/api/admin/batches/${batchId}/subjects`),
          cachedGet<{ sessions: CalendarSession[] }>(sessionsUrl),
        ]);
        if (cancelled) return;
        setSubjects((subJson.subjects ?? []).map((s) => ({ subjectId: s.subjectId, name: s.name })));
        setSessions(sesJson.sessions ?? []);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, sessionsUrl]);

  const toggleWeekday = (dow: number) =>
    setByWeekday((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]));

  function resetForm() {
    setEditingSeriesId(null);
    setTitle("");
    setStartLocal("");
    setRepeat(false);
    setByWeekday([]);
    setUntil("");
    setStartsOn("");
    setFormError("");
  }

  async function startEditSeries(seriesId: string) {
    setFormError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/batches/${batchId}/series/${seriesId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the series");
      const s = json.series;
      setEditingSeriesId(seriesId);
      setSubjectId(s.subjectId);
      setTitle(s.title ?? "");
      setDeliveryMode(s.deliveryMode ?? "online");
      setRepeat(true);
      setByWeekday(s.byWeekday ?? []);
      setTimeOfDay(s.timeOfDay ?? "10:00");
      setDurationMin(String(s.durationMin ?? 90));
      setStartsOn(s.startsOn ?? "");
      setUntil(s.until ?? "");
      setCreateZoom(s.hasZoom || s.deliveryMode !== "offline");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  const online = deliveryMode !== "offline";
  const upcoming = useMemo(
    () => sessions.filter((s) => s.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions]
  );
  // Filter the (chronological) upcoming list by subject so a multi-subject batch
  // reads as one subject at a time instead of a zigzag.
  const [subjectFilter, setSubjectFilter] = useState("all");
  const subjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of upcoming) if (s.subjectName && !seen.has(s.subjectId)) seen.set(s.subjectId, s.subjectName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [upcoming]);
  const filtered = useMemo(
    () => (subjectFilter === "all" ? upcoming : upcoming.filter((s) => s.subjectId === subjectFilter)),
    [upcoming, subjectFilter]
  );

  // The earliest occurrence of each series carries the "Edit series" action.
  const seriesAnchorIds = useMemo(() => {
    const seen = new Set<string>();
    const anchors = new Set<string>();
    for (const s of upcoming) {
      if (s.seriesId && !seen.has(s.seriesId)) {
        seen.add(s.seriesId);
        anchors.add(s.id);
      }
    }
    return anchors;
  }, [upcoming]);

  async function submit() {
    setFormError("");
    setNotice("");
    if (!subjectId) return setFormError("Pick a subject.");
    if (!title.trim()) return setFormError("Enter a class title.");

    const dur = Number(durationMin);
    if (!Number.isInteger(dur) || dur < 1) return setFormError("Enter a valid duration in minutes.");

    const editing = Boolean(editingSeriesId);
    let payload: Record<string, unknown>;
    if (repeat || editing) {
      if (byWeekday.length === 0) return setFormError("Pick at least one weekday.");
      if (!startsOn) return setFormError("Pick a start date for the repeat.");
      payload = {
        subjectId, title: title.trim(), deliveryMode, createZoomMeeting: createZoom && online,
        meetingUrl: meetingUrl.trim() || null,
        recurrence: { byWeekday, timeOfDay, durationMin: dur, timezone: TZ, startsOn, until: until || null },
      };
    } else {
      if (!startLocal) return setFormError("Pick the class date & time.");
      const startsAt = `${startLocal}:00+05:30`; // entered time is IST
      const endsAt = new Date(Date.parse(startsAt) + dur * 60_000).toISOString();
      payload = {
        subjectId, title: title.trim(), deliveryMode, createZoomMeeting: createZoom && online,
        meetingUrl: meetingUrl.trim() || null, startsAt, endsAt,
      };
    }

    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/batches/${batchId}/series/${editingSeriesId}` : `/api/admin/batches/${batchId}/sessions`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? (editing ? "Could not update the series" : "Could not schedule the class"));
      const warn = json.meetingWarning ? ` — note: ${json.meetingWarning}` : "";
      setNotice(editing ? `Series updated${warn}.` : `Class scheduled${warn}.`);
      resetForm();
      await reloadSessions();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openEditOccurrence(s: CalendarSession) {
    setEditErr("");
    setEditOccFor({ sessionId: s.id });
    setEditTitle(s.title);
    setEditStart(toLocalInput(s.startsAt));
    setEditDur(String(Math.max(1, Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60_000))));
  }

  async function saveEditOccurrence() {
    if (!editOccFor) return;
    setEditErr("");
    if (!editTitle.trim()) return setEditErr("Enter a class title.");
    if (!editStart) return setEditErr("Pick the class date & time.");
    const dur = Number(editDur);
    if (!Number.isInteger(dur) || dur < 1) return setEditErr("Enter a valid duration in minutes.");
    const startsAt = `${editStart}:00+05:30`; // entered time is IST
    const endsAt = new Date(Date.parse(startsAt) + dur * 60_000).toISOString();
    setEditBusy(true);
    try {
      const res = await fetch(`/api/admin/batches/${batchId}/sessions/${editOccFor.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), startsAt, endsAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update the class");
      setEditOccFor(null);
      await reloadSessions();
    } catch (e) {
      setEditErr((e as Error).message);
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmCancel(scope: "single" | "following" | "series") {
    if (!cancelFor) return;
    setCancelErr("");
    setCancelBusy(true);
    try {
      const qs = scope === "single" ? "" : `?scope=${scope}`;
      const res = await fetch(`/api/admin/batches/${batchId}/sessions/${cancelFor.sessionId}${qs}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not cancel");
      setCancelFor(null);
      await reloadSessions();
    } catch (e) {
      setCancelErr((e as Error).message);
    } finally {
      setCancelBusy(false);
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
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Class schedule</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Schedule online classes per subject. Enrolled students see them on their calendar; the
              subject&apos;s mentors get a Zoom invite.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/dashboard/batches/${batchId}#subjects`}>
              <ArrowLeft /> Subjects &amp; mentors
            </Link>
          </Button>
        </header>
      )}

      {subjects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Add subjects &amp; mentors to this batch first, then schedule classes for them.
            <div className="mt-4">
              <Button variant="outline" asChild>
                <Link href={`/dashboard/batches/${batchId}#subjects`}>Set up subjects</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">{editingSeriesId ? "Edit series" : "Schedule a class"}</CardTitle>
            {editingSeriesId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X /> Cancel edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Subject</Label>
                <Select value={subjectId || undefined} onValueChange={setSubjectId} disabled={Boolean(editingSeriesId)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.subjectId} value={s.subjectId}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-title">Class title</Label>
                <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ratios & Averages" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Delivery</Label>
                <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as typeof deliveryMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-dur">Duration (minutes)</Label>
                <Input id="s-dur" inputMode="numeric" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={repeat || Boolean(editingSeriesId)}
                disabled={Boolean(editingSeriesId)}
                onCheckedChange={(v) => setRepeat(Boolean(v))}
              />
              Repeat weekly
            </label>

            {!repeat && !editingSeriesId ? (
              <div className="grid gap-1.5">
                <Label>Date &amp; time (IST)</Label>
                <DateTimePicker value={startLocal} onChange={setStartLocal} />
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Repeat on</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w) => (
                      <button
                        key={w.dow}
                        type="button"
                        onClick={() => toggleWeekday(w.dow)}
                        aria-pressed={byWeekday.includes(w.dow)}
                        className={`size-9 rounded-full border text-sm font-medium transition-colors ${
                          byWeekday.includes(w.dow)
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="s-tod">Time (IST)</Label>
                    <Input id="s-tod" type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Starts on</Label>
                    <DatePicker value={startsOn} onChange={setStartsOn} placeholder="First class date" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Until</Label>
                    <DatePicker value={until} onChange={setUntil} placeholder="Batch end" clearable />
                  </div>
                </div>
              </div>
            )}

            {online && (
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={createZoom} onCheckedChange={(v) => setCreateZoom(Boolean(v))} />
                  <Video className="size-4" /> Create a Zoom meeting automatically
                </label>
                {!createZoom && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="s-url">Meeting link (optional)</Label>
                    <Input id="s-url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://…" />
                  </div>
                )}
              </div>
            )}

            {formError && <p className="text-destructive text-sm">{formError}</p>}
            {notice && <p className="text-sm text-emerald-600">{notice}</p>}

            <div className="flex justify-end">
              <Button onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
                {editingSeriesId ? "Save series" : "Schedule class"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Upcoming classes</CardTitle>
          {subjectOptions.length > 1 && (
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjectOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="grid gap-2">
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">No classes scheduled yet.</p>
          ) : (
            filtered.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.title}</span>
                    {s.subjectName && <Badge variant="secondary">{s.subjectName}</Badge>}
                    {s.seriesId && <Badge variant="outline">Weekly</Badge>}
                    {s.status === "live" && <Badge>Live</Badge>}
                    {s.meetingStatus === "failed" && <Badge variant="destructive">No Zoom</Badge>}
                  </div>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {fmtDay(s.startsAt)} · {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                    {s.mentors.length ? ` · ${s.mentors.join(", ")}` : ""}
                  </p>
                </div>
                {s.joinUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={s.joinUrl} target="_blank" rel="noreferrer">
                      <Video /> Zoom
                    </a>
                  </Button>
                )}
                {/* Edit just this class (reschedule / prepone / postpone). */}
                <Button variant="outline" size="sm" onClick={() => openEditOccurrence(s)}>
                  <Pencil /> Edit
                </Button>
                {/* Series representative row also edits the recurrence pattern. */}
                {s.seriesId && seriesAnchorIds.has(s.id) && (
                  <Button variant="outline" size="sm" onClick={() => startEditSeries(s.seriesId!)}>
                    <Repeat /> Edit series
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setCancelErr("");
                    setCancelConfirm("");
                    setCancelFor({ sessionId: s.id, title: s.title, choice: Boolean(s.seriesId) });
                  }}
                >
                  <Trash2 /> Cancel
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Edit a single occurrence */}
      <Dialog open={Boolean(editOccFor)} onOpenChange={(o) => !o && setEditOccFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit this class</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Reschedule just this occurrence — the rest of the series is unchanged. The subject&apos;s mentors
            get an updated calendar invite.
          </p>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-title">Class title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Date &amp; time (IST)</Label>
                <DateTimePicker value={editStart} onChange={setEditStart} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-dur">Duration (minutes)</Label>
                <Input id="edit-dur" inputMode="numeric" value={editDur} onChange={(e) => setEditDur(e.target.value)} />
              </div>
            </div>
            {editErr && <p className="text-destructive text-sm">{editErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOccFor(null)} disabled={editBusy}>
              Cancel
            </Button>
            <Button onClick={saveEditOccurrence} disabled={editBusy}>
              {editBusy ? <Loader2 className="animate-spin" /> : <Save />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <Dialog open={Boolean(cancelFor)} onOpenChange={(o) => !o && setCancelFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel class?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {cancelFor?.choice ? (
              <>
                <span className="text-foreground font-medium">{cancelFor?.title}</span> is a weekly class. Choose
                what to cancel — Zoom and the mentors are updated accordingly. This can&apos;t be undone.
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">{cancelFor?.title}</span> will be cancelled and the
                mentors notified. This can&apos;t be undone.
              </>
            )}
          </p>
          {/* Typed confirmation to prevent accidental cancels. */}
          <div className="grid gap-1.5">
            <Label htmlFor="cancel-confirm">
              Type <span className="text-foreground font-semibold">CANCEL</span> to confirm
            </Label>
            <Input
              id="cancel-confirm"
              value={cancelConfirm}
              onChange={(e) => setCancelConfirm(e.target.value)}
              placeholder="CANCEL"
              autoComplete="off"
            />
          </div>
          {cancelErr && <p className="text-destructive text-sm">{cancelErr}</p>}
          {cancelFor?.choice ? (
            <div className="grid gap-2">
              <Button variant="outline" className="justify-start" onClick={() => confirmCancel("single")} disabled={cancelBusy || !cancelConfirmed}>
                <Trash2 /> This class only
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => confirmCancel("following")} disabled={cancelBusy || !cancelConfirmed}>
                <Trash2 /> This and all following
              </Button>
              <Button variant="destructive" className="justify-start" onClick={() => confirmCancel("series")} disabled={cancelBusy || !cancelConfirmed}>
                {cancelBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                The whole series (all upcoming)
              </Button>
              <Button variant="ghost" onClick={() => setCancelFor(null)} disabled={cancelBusy}>
                Keep it
              </Button>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelFor(null)} disabled={cancelBusy}>
                Keep it
              </Button>
              <Button variant="destructive" onClick={() => confirmCancel("single")} disabled={cancelBusy || !cancelConfirmed}>
                {cancelBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Cancel class
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
