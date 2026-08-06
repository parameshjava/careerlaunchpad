"use client";

// Edit the feedback instrument (issue #84 §F9, migration 170).
//
// THE RULE THIS SCREEN IS BUILT AROUND
//   A published version is read-only, forever. You do not re-word question 3; you start
//   v2, change it there, and publish. That is why answers reference an item id — so
//   "clarity" in v1 and "clarity" in v2 stay different questions and a trend across a
//   re-wording is never silently drawn. The UI therefore offers exactly one editable
//   thing (the draft) and shows the rest as history with its usage counts.
//
// Publishing affects the NEXT chapter completion. Windows already open keep the form
// they opened with, so nobody is ever mid-form when the questions change.
import { useCallback, useEffect, useState } from "react";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RefSelect } from "@/components/ui/ref-select";
import { formatDate } from "@/lib/format-date";
import { GROUP_LABELS } from "@/lib/feedback-query";
import type { FormItemDraft, FormVersion } from "@/lib/feedback-forms";

const GROUP_OPTIONS = (Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]).map((k) => ({
  value: k,
  label: GROUP_LABELS[k],
}));

const TYPE_OPTIONS = [
  { value: "rating5", label: "Rating 1–5" },
  { value: "choice", label: "Choice" },
];

const BLANK: FormItemDraft = {
  dimensionKey: "",
  prompt: "",
  shortLabel: null,
  itemGroup: "teaching",
  sortOrder: 0,
  responseType: "rating5",
  choices: null,
  required: true,
  allowNa: true,
};

export function FeedbackFormEditor() {
  const [forms, setForms] = useState<FormVersion[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftItems, setDraftItems] = useState<FormItemDraft[]>([]);
  // On-screen edits not yet written to the draft. Publishing makes a version immutable
  // (migration 170), so publishing over unsaved edits loses them PERMANENTLY — the only
  // remedy would be starting v3. Hence: Publish is disabled until they are saved.
  const [unsaved, setUnsaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feedback/forms");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the form versions");
      const list = (json.forms ?? []) as FormVersion[];
      setForms(list);
      setDraftItems(list.find((f) => f.status === "draft")?.items ?? []);
      setUnsaved(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(path: string, init: RequestInit, okMessage?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? okMessage ?? "That didn't work");
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (forms === null && !error)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );

  const list = forms ?? [];
  const draft = list.find((f) => f.status === "draft");
  const active = list.find((f) => f.status === "active");

  return (
    <div className="grid gap-4">
      {error && (
        <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="text-muted-foreground bg-muted/40 grid gap-1.5 rounded-lg border px-3 py-2.5 text-xs">
        <p>
          Published versions can&apos;t be edited — that is what keeps last term&apos;s scores
          comparable. To change a question, start a new version from the active one, edit it, and
          publish. Windows already open keep the version they opened with.
        </p>
        {/* Stated here, not just enforced at publish: four items are read BY NAME by the
            reporting, and finding that out from a publish error is a poor way to learn it. */}
        <p>
          Four things the reports read by name, so publishing without them is refused: a question
          keyed <span className="text-foreground font-medium">attended</span> (the attendance mix),
          one keyed <span className="text-foreground font-medium">confidence</span> (felt-ready vs
          actually-passed), and at least one rating question in each of{" "}
          <span className="text-foreground font-medium">Teaching</span> and{" "}
          <span className="text-foreground font-medium">Content &amp; material</span> (a 1–2 rating
          only reaches triage from those two).
        </p>
      </div>

      {!draft && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              call("/api/admin/feedback/forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ copy_from: active?.id ?? null }),
              })
            }
          >
            <Plus className="size-4" />
            {active ? `New version from v${active.version}` : "Start the first version"}
          </Button>
        </div>
      )}

      {draft && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="grid gap-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                Draft · v{draft.version}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {draftItems.length} question{draftItems.length === 1 ? "" : "s"}
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    call(`/api/admin/feedback/forms/${draft.id}/items`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        items: draftItems.map((i) => ({
                          dimension_key: i.dimensionKey,
                          prompt: i.prompt,
                          short_label: i.shortLabel,
                          item_group: i.itemGroup,
                          response_type: i.responseType,
                          choices: i.choices,
                          required: i.required,
                          allow_na: i.allowNa,
                        })),
                      }),
                    })
                  }
                >
                  Save questions
                </Button>
                <Button
                  size="sm"
                  disabled={busy || draftItems.length === 0 || unsaved}
                  title={unsaved ? "Save your questions first" : undefined}
                  onClick={() =>
                    call(`/api/admin/feedback/forms/${draft.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "active" }),
                    })
                  }
                >
                  Publish v{draft.version}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    call(`/api/admin/feedback/forms/${draft.id}`, { method: "DELETE" })
                  }
                >
                  Discard
                </Button>
              </div>
            </div>

            <p
              className={
                unsaved
                  ? "rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                  : "text-muted-foreground text-xs"
              }
            >
              {unsaved
                ? "You have unsaved question edits. Save them first — publishing uses what is stored, and a published version can never be edited again."
                : "Publishing affects the next chapter completion. Windows already open keep the version they opened with."}
            </p>

            <div className="grid gap-2">
              {draftItems.map((item, n) => (
                <ItemRow
                  key={n}
                  item={item}
                  index={n}
                  total={draftItems.length}
                  onChange={(next) => {
                    setUnsaved(true);
                    setDraftItems((prev) => prev.map((p, i) => (i === n ? next : p)));
                  }}
                  onRemove={() => {
                    setUnsaved(true);
                    setDraftItems((prev) => prev.filter((_, i) => i !== n));
                  }}
                  onMove={(dir) => {
                    setUnsaved(true);
                    setDraftItems((prev) => {
                      const to = n + dir;
                      if (to < 0 || to >= prev.length) return prev;
                      const copy = [...prev];
                      [copy[n], copy[to]] = [copy[to], copy[n]];
                      return copy;
                    });
                  }}
                />
              ))}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                setUnsaved(true);
                setDraftItems((prev) => [...prev, { ...BLANK }]);
              }}
            >
              <Plus className="size-4" /> Add a question
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2">
        <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
          Versions
        </p>
        {list
          .filter((f) => f.status !== "draft")
          .map((f) => (
            <Card key={f.id} className={f.status === "active" ? "border-l-4 border-l-primary" : undefined}>
              <CardContent className="grid gap-2 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">v{f.version}</span>
                  <Badge variant={f.status === "active" ? "default" : "secondary"}>
                    {f.status === "active" ? "In use" : "Retired"}
                  </Badge>
                  {f.publishedAt && (
                    <span className="text-muted-foreground text-xs">
                      published {formatDate(f.publishedAt)}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    · {f.requestCount} chapter{f.requestCount === 1 ? "" : "s"} asked ·{" "}
                    {f.responseCount} response{f.responseCount === 1 ? "" : "s"}
                  </span>
                </div>
                <ol className="text-muted-foreground grid gap-1 text-xs">
                  {f.items.map((i) => (
                    <li key={i.id ?? i.dimensionKey} className="break-words">
                      <span className="text-foreground font-medium">{i.dimensionKey}</span> ·{" "}
                      {GROUP_LABELS[i.itemGroup]} · {i.prompt}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        {list.filter((f) => f.status !== "draft").length === 0 && (
          <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-8 text-center text-sm">
            No published version yet. Students are not asked anything until one exists.
          </p>
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  item: FormItemDraft;
  index: number;
  total: number;
  onChange: (next: FormItemDraft) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="bg-muted/30 grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <GripVertical className="text-muted-foreground size-4 shrink-0" />
        <span className="text-muted-foreground text-xs font-semibold tabular-nums">
          Q{index + 1}
        </span>
        <div className="ml-auto flex gap-1">
          {/* Buttons, not drag-and-drop: this list is edited once or twice a year and a
              reorder must work with a thumb on a phone. */}
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`prompt-${index}`}>What the student is asked</Label>
        <Input
          id={`prompt-${index}`}
          value={item.prompt}
          onChange={(e) => onChange({ ...item, prompt: e.target.value })}
          placeholder="The trainer explained this chapter's concepts clearly."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`key-${index}`}>Key</Label>
          <Input
            id={`key-${index}`}
            value={item.dimensionKey}
            onChange={(e) => onChange({ ...item, dimensionKey: e.target.value })}
            placeholder="clarity"
          />
          <span className="text-muted-foreground text-xs">
            How the score is reported. Lowercase, no spaces.
          </span>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`short-${index}`}>Short label</Label>
          <Input
            id={`short-${index}`}
            value={item.shortLabel ?? ""}
            onChange={(e) => onChange({ ...item, shortLabel: e.target.value || null })}
            placeholder="Explained clearly"
          />
          <span className="text-muted-foreground text-xs">Shown on the phone-width form.</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>What it rates</Label>
          <RefSelect
            options={GROUP_OPTIONS}
            value={item.itemGroup}
            onChange={(v) => onChange({ ...item, itemGroup: (v || "teaching") as FormItemDraft["itemGroup"] })}
            placeholder="Group"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Answer type</Label>
          <RefSelect
            options={TYPE_OPTIONS}
            value={item.responseType}
            onChange={(v) =>
              onChange({ ...item, responseType: (v || "rating5") as FormItemDraft["responseType"] })
            }
            placeholder="Type"
          />
        </div>
      </div>

      {item.responseType === "choice" && (
        <div className="grid gap-1.5">
          <Label htmlFor={`choices-${index}`}>Options</Label>
          <Input
            id={`choices-${index}`}
            value={(item.choices ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                ...item,
                choices: e.target.value
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              })
            }
            placeholder="none, some, most, all"
          />
          <span className="text-muted-foreground text-xs">
            Comma-separated, in the order they should appear.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={item.required}
            onCheckedChange={(v) => onChange({ ...item, required: v === true })}
          />
          Must be answered
        </label>
        {item.responseType === "rating5" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={item.allowNa}
              onCheckedChange={(v) => onChange({ ...item, allowNa: v === true })}
            />
            Offer &ldquo;not applicable&rdquo;
          </label>
        )}
      </div>
    </div>
  );
}
