"use client";

// Staff Actions tab on /dashboard/batches/[id] (issue #84) — the todo list from the
// issue, upgraded so a closed item is still meaningful months later.
//
// WHAT MAKES THIS MORE THAN A CHECKLIST
//   • Every item carries the SOURCE that produced it (chapter + dimension + the
//     feedback window itself). "Fix the audio" with no provenance is unreviewable.
//   • "Publish to students" is what closes the loop: published titles appear on the
//     student's assessments hub. Students who never see a change stop answering.
//   • A resolution note is required in spirit, not in schema — the field is right
//     there when you close an item, because the note is what makes it evidence.
//
// Overdue means open AND past due; a done item is never overdue.
//
// Also serves the cross-batch triage inbox (/dashboard/feedback → Actions): pass
// batchId={null} and it lists every item the caller may see, labelled with its batch.
// "New action" is hidden there on purpose — an item filed without a batch has no
// provenance, and provenance is the whole point of the table. Cross-batch creation
// happens from the chapter that tripped, on that batch's Feedback tab.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RefSelect } from "@/components/ui/ref-select";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "@/lib/format-date";
import type { ActionItem } from "@/lib/feedback-query";

export type ActionSeed = {
  requestId: string;
  subjectId: string;
  chapterId: string;
  chapterName: string | null;
  dimensionKey?: string;
};

const STATUS_LABEL: Record<ActionItem["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  dropped: "Not going ahead",
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ActionItem["status"][]).map((v) => ({
  value: v,
  label: STATUS_LABEL[v],
}));

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const today = () => new Date().toISOString().slice(0, 10);

export function BatchActions({
  batchId,
  seed,
  onSeedConsumed,
}: {
  /** null ⇒ every batch the caller may see (the triage inbox), read-only creation. */
  batchId: string | null;
  /** Pre-fills the form when staff click "Create action" on the Feedback tab. */
  seed?: ActionSeed | null;
  onSeedConsumed?: () => void;
}) {
  const [actions, setActions] = useState<ActionItem[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    detail: "",
    priority: "normal",
    dueOn: "",
    published: false,
    subjectId: "" as string | null,
    chapterId: "" as string | null,
    requestId: "" as string | null,
    dimensionKey: "" as string | null,
    chapterName: "" as string | null,
  });

  const load = useCallback(() => {
    fetch(batchId ? `/api/admin/feedback/actions?batch=${batchId}` : "/api/admin/feedback/actions")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setActions(d.actions ?? []);
      })
      .catch((e) => setError(String(e)));
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  // A seed arriving from the Feedback tab opens the form with the source attached.
  useEffect(() => {
    if (!seed) return;
    setForm((f) => ({
      ...f,
      subjectId: seed.subjectId,
      chapterId: seed.chapterId,
      requestId: seed.requestId,
      dimensionKey: seed.dimensionKey ?? "",
      chapterName: seed.chapterName,
      title: f.title || (seed.chapterName ? `Follow up on ${seed.chapterName} feedback` : ""),
    }));
    setAdding(true);
    onSeedConsumed?.();
  }, [seed, onSeedConsumed]);

  async function create() {
    if (!form.title.trim() || !batchId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/feedback/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: batchId,
          title: form.title,
          detail: form.detail || null,
          priority: form.priority,
          due_on: form.dueOn || null,
          published_to_students: form.published,
          subject_id: form.subjectId || null,
          chapter_id: form.chapterId || null,
          request_id: form.requestId || null,
          dimension_key: form.dimensionKey || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create the action");
      setActions((prev) => [json.action, ...(prev ?? [])]);
      setAdding(false);
      setForm({
        title: "", detail: "", priority: "normal", dueOn: "", published: false,
        subjectId: "", chapterId: "", requestId: "", dimensionKey: "", chapterName: "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError("");
    try {
      const res = await fetch(`/api/admin/feedback/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update the action");
      // MERGE, don't replace: the unscoped GET enriches each row with batchName
      // (withBatchNames), and the PATCH response has no such field — swapping the row
      // wholesale drops the batch label and link on the cross-batch inbox, leaving an
      // item with no provenance until the page is reloaded.
      setActions((prev) =>
        (prev ?? []).map((a) =>
          a.id === id ? { ...a, ...json.action, batchName: json.action.batchName ?? a.batchName } : a,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (actions === null && !error)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );

  const list = actions ?? [];
  const openCount = list.filter((a) => a.status === "open" || a.status === "in_progress").length;
  const overdue = list.filter(
    (a) => (a.status === "open" || a.status === "in_progress") && a.dueOn && a.dueOn < today(),
  ).length;

  return (
    <div className="grid gap-4">
      {error && (
        <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {overdue > 0 && (
          <Badge className="bg-rose-600 hover:bg-rose-600">{overdue} overdue</Badge>
        )}
        <Badge variant="secondary">{openCount} open</Badge>
        <Badge variant="secondary">{list.filter((a) => a.status === "done").length} closed</Badge>
        {batchId && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" /> New action
          </Button>
        )}
      </div>

      {adding && batchId && (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            {form.chapterName && (
              <p className="text-muted-foreground text-xs">
                Source: <span className="text-foreground font-medium">{form.chapterName}</span>
                {form.dimensionKey ? ` · ${form.dimensionKey}` : ""}
              </p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="fa-title">What needs to happen</Label>
              <Input
                id="fa-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Add 15 harder practice sums to Quadratic Equations"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fa-detail">Detail (optional)</Label>
              <Textarea
                id="fa-detail"
                rows={2}
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <RefSelect
                  options={PRIORITY_OPTIONS}
                  value={form.priority}
                  onChange={(v) => setForm({ ...form, priority: v || "normal" })}
                  placeholder="Priority"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Due</Label>
                <DatePicker
                  value={form.dueOn}
                  clearable
                  onChange={(v) => setForm({ ...form, dueOn: v })}
                />
              </div>
            </div>
            <label className="bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm">
              <Checkbox
                checked={form.published}
                onCheckedChange={(v) => setForm({ ...form, published: v === true })}
                className="mt-0.5"
              />
              <span>
                Show this to students on their assessments page
                <span className="text-muted-foreground block text-xs">
                  Closing the loop is what keeps response rates up. Only the title, status and
                  resolution note are shown — write it for a student audience.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={create} disabled={saving || !form.title.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Create action"}
              </Button>
              <Button variant="outline" onClick={() => setAdding(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {list.length === 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
          {batchId
            ? "No actions yet. Open the Feedback tab and create one from a chapter that needs attention."
            : "No actions anywhere yet. They start on a batch's Feedback tab, from the chapter that tripped."}
        </p>
      ) : (
        <div className="grid gap-2">
          {list.map((a) => {
            const isOverdue =
              (a.status === "open" || a.status === "in_progress") && a.dueOn && a.dueOn < today();
            // A trip-proposed item nobody has owned or started yet (migration 166).
            // It is a real open item, but it is the machine's suggestion, not a
            // commitment — so it reads differently until someone takes it.
            const unclaimed = a.autoSource != null && !a.ownerUserId && a.status === "open";
            const stripe =
              a.status === "done"
                ? "border-l-emerald-600"
                : isOverdue
                  ? "border-l-rose-600"
                  : a.status === "dropped"
                    ? "border-l-muted-foreground/40"
                    : unclaimed
                      ? "border-l-amber-500"
                      : "border-l-primary";
            return (
              <Card key={a.id} className={`border-l-4 ${stripe}`}>
                <CardContent className="grid gap-2 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium break-words">{a.title}</p>
                    {unclaimed && (
                      <Badge
                        variant="secondary"
                        className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        Proposed
                      </Badge>
                    )}
                    {isOverdue && <Badge className="bg-rose-600 hover:bg-rose-600">Overdue</Badge>}
                  </div>
                  {a.detail && (
                    <p className="text-muted-foreground text-xs break-words">{a.detail}</p>
                  )}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    {/* Only the unscoped inbox carries a name; on a batch's own tab
                        repeating it on every card would be noise. */}
                    {a.batchName && (
                      <Link
                        href={`/dashboard/batches/${a.batchId}#actions`}
                        className="text-primary font-medium hover:underline"
                      >
                        {a.batchName}
                      </Link>
                    )}
                    {a.chapterId && (
                      <span className="bg-muted rounded border px-1.5 py-0.5">
                        Source: chapter{a.dimensionKey ? ` · ${a.dimensionKey}` : ""}
                      </span>
                    )}
                    {a.dueOn && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3.5" /> {formatDate(a.dueOn)}
                      </span>
                    )}
                    {a.priority !== "normal" && <Badge variant="secondary">{a.priority}</Badge>}
                    {a.publishedToStudents && (
                      <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-primary">
                        Published to students
                      </Badge>
                    )}
                  </div>
                  {a.resolutionNote && (
                    <p className="border-l-2 border-l-emerald-600 pl-3 text-xs">
                      <span className="font-medium">Resolution:</span> {a.resolutionNote}
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-center">
                    <RefSelect
                      options={STATUS_OPTIONS}
                      value={a.status}
                      onChange={(v) => v && patch(a.id, { status: v })}
                      placeholder="Status"
                    />
                    <div className="flex flex-wrap gap-2">
                      {unclaimed && (
                        <Button size="sm" onClick={() => patch(a.id, { claim: true })}>
                          Take this on
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          patch(a.id, { published_to_students: !a.publishedToStudents })
                        }
                      >
                        {a.publishedToStudents ? "Unpublish" : "Publish to students"}
                      </Button>
                      <ResolutionEditor
                        value={a.resolutionNote}
                        onSave={(note) => patch(a.id, { resolution_note: note })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResolutionEditor({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");

  if (!editing)
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        {value ? "Edit resolution" : "Add resolution"}
      </Button>
    );

  return (
    <div className="grid w-full gap-2">
      <Textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What actually changed, and what it did to the next chapter's score"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(text);
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
