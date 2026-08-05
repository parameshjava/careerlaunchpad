"use client";

/**
 * Reference Catalogue (issue #99) — the admin screen for degrees, branches and the
 * degree→branch mapping. Modelled on components/colleges/CollegesManager.tsx (the
 * established pattern for this job): API-only CRUD, deactivate rather than delete,
 * rows that reflow on mobile.
 *
 * WHY THIS SCREEN EXISTS AT ALL
 *   The seed in migration 161 is a snapshot. AP/TS counselling adds branches every
 *   admission season — CSBS, CSE—IoT and Data Science all appeared within the last
 *   few years — so the mapping has to be editable here, not by a migration PR each
 *   time. The "Other answers" tab is the highest-value part: it turns the write-ins
 *   students actually typed into real catalogue entries, which is the only thing
 *   that stops the list rotting back to everyone-picks-Other.
 *
 * THE MAPPING TAB READS AS "WHAT WILL A STUDENT SEE?", not as a join table: pick a
 * degree and both sides are on screen at once — what it offers (ordered) and what's
 * still available — so mapping is a visible comparison rather than a hunt through an
 * overlay. Preview renders the REAL student Branch dropdown (the same Combobox, the
 * same options) so there is no "looks right here, wrong in the form" gap.
 *
 * Deactivate, never delete: student_profile.branch is a plain slug with no FK, so
 * every destructive affordance shows the live student count and only ever flips
 * is_active. Slugs are read-only after create (they are the stored identity).
 *
 * UI vocabulary per docs/STYLE_GUIDE.md: folder tabs, sections in Card, the shared
 * DataTable (+ SortHeader / StatusBadge) for the two catalogue grids, the standard
 * empty state. The Mapping tab keeps a hand-rolled ordered list on purpose — it is
 * a reorderable sequence ("position N in what the student sees"), which a sortable
 * grid can't express.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Check, Copy, Eye, Pencil, Plus, RefreshCw, Undo2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefSelect } from "@/components/ui/ref-select";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, arrIncludes } from "@/components/data-table";
import { SortHeader, StatusBadge } from "@/components/data-table-parts";
import { groupContiguously, normalizeSearch } from "@/lib/degree-branch";
import { formatDateTime } from "@/lib/format-date";

// Folder-tab styling, shared with the Students grid and the Team hub
// (docs/STYLE_GUIDE.md → Tabs): muted inactive tabs that keep their underline, the
// active tab a solid brand fill sitting on the border so it connects to the page.
const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

// The standard empty/loading panel (docs/STYLE_GUIDE.md → Empty state).
const EMPTY_CLS = "text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm";

// ---- API shapes -------------------------------------------------------------
type Degree = {
  id: string; slug: string; label: string; category: string | null; sort_order: number;
  is_active: boolean; branch_mode: "required" | "optional" | "none";
  level: "diploma" | "ug" | "pg" | null; duration_years: number | null; search_terms: string[];
  mapped_count: number; student_count: number; mentor_count: number;
};
type Branch = {
  id: string; slug: string; label: string; category: string | null; family: string | null;
  sort_order: number; is_active: boolean; search_terms: string[];
  student_count: number; mentor_count: number; degree_count: number;
};
type Assigned = {
  branch_slug: string; label: string; category: string | null; branch_active: boolean;
  group_label: string | null; sort_order: number; is_active: boolean; student_count: number;
};
type Available = { slug: string; label: string; category: string | null };
type OtherAnswer = { kind: string; answer: string; uses: number };
type Unspecified = { kind: string; uses: number };
type AuditEntry = {
  id: string; table_name: string; row_key: string; action: string;
  created_at: string; actor_email: string | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export function ReferenceCatalogue() {
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setError("");
    try {
      const [d, b] = await Promise.all([
        api<{ degrees: Degree[] }>("/api/admin/reference/degrees"),
        api<{ branches: Branch[] }>("/api/admin/reference/branches"),
      ]);
      setDegrees(d.degrees);
      setBranches(b.branches);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <Tabs defaultValue="mapping">
        {/* The rail scrolls rather than wrapping, so five folder tabs fit at 320px
            without the row reflowing into two lines. */}
        <TabsList
          variant="line"
          className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
        >
          <TabsTrigger value="mapping" className={TAB_CLS}>Mapping</TabsTrigger>
          <TabsTrigger value="degrees" className={TAB_CLS}>Degrees ({degrees.length})</TabsTrigger>
          <TabsTrigger value="branches" className={TAB_CLS}>Branches ({branches.length})</TabsTrigger>
          <TabsTrigger value="other" className={TAB_CLS}>Other answers</TabsTrigger>
          <TabsTrigger value="history" className={TAB_CLS}>History</TabsTrigger>
        </TabsList>

        {/* min-w-0 lets a wide DataTable scroll inside its container instead of
            overflowing the page on mobile. */}
        <TabsContent value="mapping" className="mt-4 min-w-0">
          <MappingTab degrees={degrees} branches={branches} onChanged={reload} />
        </TabsContent>
        <TabsContent value="degrees" className="mt-4 min-w-0">
          <DegreesTab degrees={degrees} loading={loading} onChanged={reload} />
        </TabsContent>
        <TabsContent value="branches" className="mt-4 min-w-0">
          <BranchesTab branches={branches} loading={loading} onChanged={reload} />
        </TabsContent>
        <TabsContent value="other" className="mt-4 min-w-0">
          <OtherAnswersTab branches={branches} degrees={degrees} onChanged={reload} />
        </TabsContent>
        <TabsContent value="history" className="mt-4 min-w-0">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapping — the tab that answers "what will a student on this degree see?"
// ---------------------------------------------------------------------------
/**
 * Pick a degree and its WHOLE branch list renders — uncut, in student order, with
 * the same group headings the dropdown shows. Every row can be reordered, have its
 * heading changed, be edited, or be removed; new branches are added from a
 * search-driven section below.
 *
 * DESIGN HISTORY, because two earlier cuts were wrong in instructive ways:
 *   1. "Add a branch" behind an overlay combobox — wrong, because mapping a degree
 *      means repeatedly comparing what's in against what's out, and an overlay hides
 *      one side every time you reach for the other.
 *   2. Two side-by-side panels, each scrolling inside a fixed 26rem box — also wrong:
 *      B.Tech has 30 branches and B.Sc 32, so a 26rem window showed four at a time
 *      and "see all the branches for this degree" became impossible.
 *
 * So the assigned list has NO inner scroll and NO row cap: the page scrolls, the list
 * doesn't. The ADD section keeps an inner scroll on purpose — it is a search result
 * over all 113 remaining branches, not the thing you came here to read.
 */
function MappingTab({
  degrees, branches, onChanged,
}: { degrees: Degree[]; branches: Branch[]; onChanged: () => void }) {
  const [degreeSlug, setDegreeSlug] = useState("");
  const [assigned, setAssigned] = useState<Assigned[]>([]);
  const [available, setAvailable] = useState<Available[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewValue, setPreviewValue] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [qIn, setQIn] = useState("");
  const [qAdd, setQAdd] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  // Which pairs exist server-side. A pair the admin added but hasn't saved has
  // nothing to preserve, so removing it discards rather than retires.
  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(new Set());

  const degree = degrees.find((d) => d.slug === degreeSlug) ?? null;

  /** Active rows first, retired ones collected at the end, each block keeping its
   * order. Applied on load and on every retire/restore so the rendered order and the
   * indices move()/Save use are always the same list — otherwise a swap could cross
   * the retired block and quietly reorder a branch into it. */
  const activeFirst = (rows: Assigned[]) =>
    [...rows.filter((a) => a.is_active), ...rows.filter((a) => !a.is_active)];

  // `keepNotice` exists because save() and copy() re-load to pick up server-assigned
  // ordering, and a blanket setNotice("") here wiped their own success message before
  // it could ever render — the edit worked but the screen said nothing.
  const load = useCallback(async (slug: string, keepNotice = false) => {
    if (!slug) { setAssigned([]); setAvailable([]); return; }
    setError(""); setDirty(false); setPicked([]);
    if (!keepNotice) setNotice("");
    try {
      const data = await api<{ assigned: Assigned[]; available: Available[] }>(
        `/api/admin/reference/mapping/${encodeURIComponent(slug)}`,
      );
      setAssigned(activeFirst(data.assigned));
      setAvailable(data.available);
      setSavedSlugs(new Set(data.assigned.map((a) => a.branch_slug)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(degreeSlug); }, [degreeSlug, load]);

  // Open on something useful: the first degree that actually has branches.
  useEffect(() => {
    if (!degreeSlug && degrees.length) {
      setDegreeSlug((degrees.find((d) => d.branch_mode !== "none") ?? degrees[0]).slug);
    }
  }, [degrees, degreeSlug]);

  // ---- mutations (all local until Save) ----
  function move(index: number, delta: number) {
    const next = [...assigned];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const moved = assigned[index];
    const displaced = assigned[target];
    // Moving a row ACROSS a group boundary makes it ADOPT the destination's
    // heading. Without this, a branch moved into "Single major" would keep saying
    // "Common combinations" and re-open a one-row group of its own where it landed.
    next[index] = displaced;
    next[target] = { ...moved, group_label: displaced.group_label };
    setAssigned(next);
    setDirty(true);
  }

  /**
   * Retire a pair rather than delete it. Save submits only the ACTIVE rows, and the
   * RPC deactivates whatever is missing (migration 161) — so a student already on
   * this branch can still save Step 2, which a hard delete broke outright.
   *
   * `student_count === 0` and never persisted → nothing to preserve, so it is simply
   * dropped and returned to the available pool.
   */
  function retire(slug: string) {
    const row = assigned.find((a) => a.branch_slug === slug);
    if (!row) return;
    const neverSaved = !savedSlugs.has(slug);
    if (neverSaved) {
      setAssigned(assigned.filter((a) => a.branch_slug !== slug));
      setAvailable(
        [...available, { slug: row.branch_slug, label: row.label, category: row.category }].sort((a, b) =>
          a.label.localeCompare(b.label),
        ),
      );
    } else {
      setAssigned(activeFirst(assigned.map((a) => (a.branch_slug === slug ? { ...a, is_active: false } : a))));
    }
    setDirty(true);
  }

  function restore(slug: string) {
    setAssigned(activeFirst(assigned.map((a) => (a.branch_slug === slug ? { ...a, is_active: true } : a))));
    setDirty(true);
  }

  function add(slugs: string[]) {
    const rows = available.filter((a) => slugs.includes(a.slug));
    if (!rows.length) return;
    setAssigned([
      ...assigned,
      ...rows.map((row, i) => ({
        branch_slug: row.slug, label: row.label, category: row.category, branch_active: true,
        // Inherit the last row's heading so an appended branch doesn't silently
        // open a new group at the bottom of the list.
        group_label: assigned.at(-1)?.group_label ?? null,
        sort_order: assigned.length + i + 1, is_active: true, student_count: 0,
      })),
    ]);
    setAvailable(available.filter((a) => !slugs.includes(a.slug)));
    setPicked([]);
    setDirty(true);
  }

  function setGroup(slug: string, value: string) {
    setAssigned(assigned.map((a) => (a.branch_slug === slug ? { ...a, group_label: value || null } : a)));
    setDirty(true);
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      // sort_order comes from the submitted ORDER, so the list the admin sees is
      // exactly the list a student gets.
      await api(`/api/admin/reference/mapping/${encodeURIComponent(degreeSlug)}`, {
        method: "PUT",
        // Only the ACTIVE rows: whatever is missing from this list gets retired by
        // replace_degree_branches (never deleted).
        body: JSON.stringify({
          branches: assigned
            .filter((a) => a.is_active)
            .map((a, i) => ({
              branch_slug: a.branch_slug, sort_order: i + 1, group_label: a.group_label,
            })),
        }),
      });
      setNotice("Saved. The student and mentor forms pick this up on their next load.");
      onChanged();
      await load(degreeSlug, true);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!copyFrom) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { copied } = await api<{ copied: number }>(
        `/api/admin/reference/mapping/${encodeURIComponent(degreeSlug)}/copy`,
        { method: "POST", body: JSON.stringify({ from: copyFrom }) },
      );
      setNotice(`Added ${copied} branch${copied === 1 ? "" : "es"} from ${copyFrom}. Nothing was removed.`);
      setCopyFrom("");
      onChanged();
      await load(degreeSlug, true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hit = (needle: string, text: string) =>
    !needle.trim() || normalizeSearch(text).includes(normalizeSearch(needle));
  const shownIn = assigned.filter((a) => hit(qIn, `${a.label} ${a.branch_slug} ${a.group_label ?? ""}`));
  // `assigned` is kept active-first by activeFirst() on every mutation, so the last
  // active row is the boundary "move down" must stop at.
  const lastActiveIndex = assigned.reduce((last, a, i) => (a.is_active ? i : last), -1);
  const activeCount = lastActiveIndex + 1;
  const matchAdd = available.filter((a) => hit(qAdd, `${a.label} ${a.slug} ${a.category ?? ""}`));

  // Headings already in use, offered as native suggestions so groups stay consistent
  // without a fixed list (group_label is free text in the DB).
  const groupSuggestions = Array.from(
    new Set([
      ...assigned.map((a) => a.group_label).filter((g): g is string => !!g),
      ...available.map((a) => a.category).filter((c): c is string => !!c),
    ]),
  ).sort();
  const groupListId = `${degreeSlug}-groups`;

  const previewOptions: ComboboxOption[] = groupContiguously(assigned, (a) => a.group_label ?? a.category).map(
    (a) => ({ value: a.branch_slug, label: a.label, group: a.group_label ?? a.category }),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: which degree, its rules, and the whole-list actions. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="grid gap-1.5">
          <Label>Degree</Label>
          <Combobox
            value={degreeSlug}
            onChange={setDegreeSlug}
            options={groupContiguously(degrees, (d) => d.category).map((d) => ({
              value: d.slug, label: d.label, group: d.category, searchTerms: d.search_terms,
            }))}
            placeholder="Pick a degree…"
          />
        </div>
        {degree && (
          <div className="flex flex-wrap items-end gap-2">
            <Badge variant="secondary">branch mode: {degree.branch_mode}</Badge>
            <Badge variant="secondary">{activeCount} branches</Badge>
            <Badge variant="secondary">{degree.student_count} students</Badge>
            {degree.duration_years && <Badge variant="secondary">{degree.duration_years}-year</Badge>}
          </div>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}

      {degree?.branch_mode === "none" && (
        <Alert tone="warn">
          {degree.label} has <b>branch mode: none</b>, so the Branch field isn&apos;t shown to students at all and
          any mapping below is ignored. Change it on the Degrees tab if that&apos;s wrong.
        </Alert>
      )}

      {degreeSlug && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={!dirty || busy} onClick={save}>
              {busy ? "Saving…" : "Save mapping"}
            </Button>
            {dirty && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void load(degreeSlug)}>
                <Undo2 className="size-4" /> Discard
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => { setPreviewValue(""); setPreview(true); }}>
              <Eye className="size-4" /> Preview as student
            </Button>
            {dirty && <span className="text-muted-foreground text-xs">Unsaved changes</span>}
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <RefSelect
                value={copyFrom}
                onChange={setCopyFrom}
                className="w-full sm:w-56"
                placeholder="Copy from another degree…"
                emptyLabel="Copy from another degree…"
                options={degrees
                  .filter((d) => d.slug !== degreeSlug && d.mapped_count > 0)
                  .map((d) => ({ value: d.slug, label: `${d.label} (${d.mapped_count})` }))}
              />
              <Button type="button" variant="outline" disabled={!copyFrom || busy} onClick={copy}>
                <Copy className="size-4" /> Copy
              </Button>
            </div>
          </div>

          {/* ---- the degree's FULL list: no inner scroll, no cap ---- */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">
                  All branches in {degree?.label}{" "}
                  <span className="text-muted-foreground font-normal">({activeCount})</span>
                  {activeCount !== assigned.length && (
                    <span className="text-muted-foreground font-normal">
                      {" "}+ {assigned.length - activeCount} no longer offered
                    </span>
                  )}
                </h3>
                <p className="text-muted-foreground text-xs">
                  In student order, under the headings they see. Filtering never reorders anything.
                </p>
                <Input
                  value={qIn}
                  onChange={(e) => setQIn(e.target.value)}
                  placeholder="Find a branch in this list…"
                  className="mt-1 w-full sm:ml-auto sm:mt-0 sm:w-64"
                />
              </div>

              {qIn.trim() && (
                <p className="text-muted-foreground mb-2 text-xs">
                  {shownIn.length} of {assigned.length} shown ·{" "}
                  <button type="button" className="underline" onClick={() => setQIn("")}>clear filter</button>
                </p>
              )}

              {shownIn.length === 0 ? (
                <p className={EMPTY_CLS}>
                  {assigned.length === 0
                    ? "Nothing mapped yet — students on this degree would see an empty list. Add branches below, or copy another degree’s set."
                    : "No branch in this list matches that filter."}
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {shownIn.map((row) => {
                    // Retired rows sink to the bottom of the list, so "move down" has
                    // to stop at the last ACTIVE row or a branch could be pushed below
                    // the retired block and silently reordered into it.
                    // Index, arrows and the group heading all read from the FULL
                    // list, so a filtered view can never silently reorder or
                    // mis-group something that's scrolled out of sight.
                    const i = assigned.findIndex((a) => a.branch_slug === row.branch_slug);
                    const prev = assigned[i - 1];
                    const heading = row.group_label ?? row.category;
                    const newGroup = !qIn.trim() && heading && heading !== (prev?.group_label ?? prev?.category);
                    const full = branches.find((b) => b.slug === row.branch_slug) ?? null;
                    return (
                      <Fragment key={row.branch_slug}>
                        {newGroup && (
                          <li className="bg-muted/40 -mx-6 px-6 py-1.5">
                            <p className="text-muted-foreground text-[0.7rem] font-bold tracking-[0.06em] uppercase">
                              {heading}
                            </p>
                          </li>
                        )}
                        <li
                          className={`flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3 ${
                            row.is_active ? "" : "opacity-60"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2 sm:flex-1">
                            <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                              {row.is_active ? i + 1 : "—"}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {row.label}
                                {/* Two different retirements, so two different badges:
                                    the PAIR is no longer offered on this degree, vs the
                                    BRANCH itself being deactivated catalogue-wide. */}
                                {!row.is_active && (
                                  <StatusBadge tone="amber" className="ml-2 align-middle">not offered</StatusBadge>
                                )}
                                {!row.branch_active && (
                                  <StatusBadge tone="slate" className="ml-2 align-middle">deactivated</StatusBadge>
                                )}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                <code>{row.branch_slug}</code> · {row.student_count} students
                                {!row.is_active && row.student_count > 0 && " · they keep it and can still save"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pl-8 sm:pl-0">
                            {row.is_active ? (
                              <>
                                {/* The heading this branch sits under. Free text with a
                                    native <datalist> — no second overlay on a row that
                                    already carries four buttons. */}
                                <input
                                  list={groupListId}
                                  value={row.group_label ?? ""}
                                  onChange={(e) => setGroup(row.branch_slug, e.target.value)}
                                  placeholder="No heading"
                                  aria-label={`Group heading for ${row.label}`}
                                  className="border-input h-9 w-full min-w-0 rounded-lg border bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-36 dark:bg-input/30"
                                />
                                <IconButton label={`Move ${row.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                                  <ArrowUp className="size-4" />
                                </IconButton>
                                <IconButton
                                  label={`Move ${row.label} down`}
                                  disabled={i === lastActiveIndex}
                                  onClick={() => move(i, 1)}
                                >
                                  <ArrowDown className="size-4" />
                                </IconButton>
                                {/* Edit the BRANCH itself (label, family, aliases) without
                                    leaving the mapping you're working on. */}
                                <IconButton
                                  label={`Edit ${row.label}`}
                                  disabled={!full}
                                  onClick={() => full && setEditBranch(full)}
                                >
                                  <Pencil className="size-4" />
                                </IconButton>
                                <IconButton
                                  label={`Stop offering ${row.label} on ${degree?.label ?? "this degree"}`}
                                  onClick={() => retire(row.branch_slug)}
                                  destructive
                                >
                                  <X className="size-4" />
                                </IconButton>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="ml-auto h-11 sm:h-8"
                                onClick={() => restore(row.branch_slug)}
                              >
                                <Undo2 className="size-4" /> Offer again
                              </Button>
                            )}
                          </div>
                        </li>
                      </Fragment>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ---- add more: a SEARCH over the remaining catalogue, so an inner
                  scroll is right here (113 rows is not what you came to read) ---- */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">
                  Add branches to {degree?.label}{" "}
                  <span className="text-muted-foreground font-normal">({available.length} available)</span>
                </h3>
                <p className="text-muted-foreground text-xs">
                  Tick any number, then Add. Not in the catalogue yet? Create it on the Branches tab.
                </p>
                <Input
                  value={qAdd}
                  onChange={(e) => setQAdd(e.target.value)}
                  placeholder="Search all other branches…"
                  className="mt-1 w-full sm:ml-auto sm:mt-0 sm:w-64"
                />
              </div>

              {matchAdd.length === 0 ? (
                <p className={EMPTY_CLS}>
                  {available.length === 0
                    ? "Every branch in the catalogue is already on this degree."
                    : "Nothing matches that search."}
                </p>
              ) : (
                <>
                  <ul className="max-h-72 divide-y overflow-y-auto overscroll-contain border-y">
                    {matchAdd.map((row) => (
                      <li key={row.slug}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 sm:min-h-9">
                          <input
                            type="checkbox"
                            className="size-4 shrink-0"
                            checked={picked.includes(row.slug)}
                            onChange={(e) =>
                              setPicked((p) =>
                                e.target.checked ? [...p, row.slug] : p.filter((s) => s !== row.slug),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{row.label}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                              <code>{row.slug}</code> · {row.category ?? "—"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" disabled={picked.length === 0} onClick={() => add(picked)}>
                      <Plus className="size-4" />
                      Add {picked.length || ""} {picked.length === 1 ? "branch" : "branches"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPicked(matchAdd.map((a) => a.slug))}
                      disabled={matchAdd.length === 0}
                    >
                      Select all {matchAdd.length} shown
                    </Button>
                    {picked.length > 0 && (
                      <Button type="button" variant="outline" onClick={() => setPicked([])}>Clear</Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <datalist id={groupListId}>
            {groupSuggestions.map((g) => <option key={g} value={g} />)}
          </datalist>
        </>
      )}

      {/* Editing a branch from here is the same dialog the Branches tab uses. */}
      {editBranch && (
        <BranchEditor
          branch={editBranch}
          onClose={() => setEditBranch(null)}
          onSaved={() => { setEditBranch(null); onChanged(); void load(degreeSlug, true); }}
        />
      )}

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Branch, as {degree?.label ?? "this degree"} students see it</DialogTitle>
          </DialogHeader>
          {/* The REAL student control with the REAL options — including unsaved
              reordering — so "looks right here" means "is right in the form". */}
          <div className="grid gap-1.5">
            <Label>Branch</Label>
            <Combobox
              value={previewValue}
              onChange={setPreviewValue}
              options={previewOptions}
              placeholder="Select your branch…"
              searchPlaceholder="e.g. cse, computers, mpc"
              emptyHint="Can’t find your branch? Pick “Other” and type it in."
            />
            <p className="text-muted-foreground text-xs">
              {previewOptions.length} options{dirty ? " (including your unsaved changes)" : ""}.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Degrees
// ---------------------------------------------------------------------------
const BRANCH_MODE_OPTIONS = [
  { value: "required", label: "required — branch must be picked" },
  { value: "optional", label: "optional — branch shown, no asterisk" },
  { value: "none", label: "none — no Branch field at all" },
];
const LEVEL_OPTIONS = [
  { value: "ug", label: "UG" },
  { value: "pg", label: "PG" },
  { value: "diploma", label: "Diploma" },
];

/** Distinct non-null values as faceted-filter options, in first-seen order. */
function facets(values: (string | null)[]): { label: string; value: string }[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).map((v) => ({ label: v, value: v }));
}

function DegreesTab({ degrees, loading, onChanged }: { degrees: Degree[]; loading: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<Degree | "new" | null>(null);

  // Built here rather than at module scope so the Edit cell closes over
  // setEditing — the row action is what makes this grid useful.
  const columns: ColumnDef<Degree>[] = [
    {
      accessorKey: "label",
      header: ({ column }) => <SortHeader column={column}>Degree</SortHeader>,
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium">{row.original.label}</span>
          {!row.original.is_active && <StatusBadge tone="slate" className="ml-2 align-middle">inactive</StatusBadge>}
          <span className="text-muted-foreground block text-xs"><code>{row.original.slug}</code></span>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: ({ column }) => <SortHeader column={column}>Group</SortHeader>,
      cell: ({ row }) => row.original.category ?? "—",
      filterFn: arrIncludes,
    },
    {
      accessorKey: "branch_mode",
      header: ({ column }) => <SortHeader column={column}>Branch</SortHeader>,
      cell: ({ row }) => (
        <StatusBadge tone={BRANCH_MODE_TONE[row.original.branch_mode]}>{row.original.branch_mode}</StatusBadge>
      ),
      filterFn: arrIncludes,
    },
    {
      accessorKey: "duration_years",
      header: ({ column }) => <SortHeader column={column}>Years</SortHeader>,
      cell: ({ row }) => row.original.duration_years ?? "—",
    },
    {
      accessorKey: "mapped_count",
      header: ({ column }) => <SortHeader column={column}>Branches</SortHeader>,
      cell: ({ row }) => <span className="tabular-nums">{row.original.mapped_count}</span>,
    },
    {
      accessorKey: "student_count",
      header: ({ column }) => <SortHeader column={column}>Students</SortHeader>,
      cell: ({ row }) => <span className="tabular-nums">{row.original.student_count}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(row.original)}>Edit</Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          <b>Branch</b> decides whether students see a Branch field at all; <b>Years</b> decides which Years of
          Study they can pick.
        </p>
        <Button type="button" className="shrink-0" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add degree
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className={EMPTY_CLS}>Loading…</p>
          ) : (
            <DataTable
              columns={columns}
              data={degrees}
              searchKey="label"
              searchPlaceholder="Search degrees…"
              filters={[
                { columnId: "category", title: "Group", options: facets(degrees.map((d) => d.category)) },
                { columnId: "branch_mode", title: "Branch mode", options: BRANCH_MODE_OPTIONS.map((o) => ({ label: o.value, value: o.value })) },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {editing && (
        <DegreeEditor
          degree={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

// 'none' is not a failure state, just an absence — slate, not rose.
const BRANCH_MODE_TONE = { required: "emerald", optional: "amber", none: "slate" } as const;

function DegreeEditor({ degree, onClose, onSaved }: { degree: Degree | null; onClose: () => void; onSaved: () => void }) {
  const [slug, setSlug] = useState(degree?.slug ?? "");
  const [label, setLabel] = useState(degree?.label ?? "");
  const [category, setCategory] = useState(degree?.category ?? "");
  const [level, setLevel] = useState<string>(degree?.level ?? "");
  const [branchMode, setBranchMode] = useState<string>(degree?.branch_mode ?? "required");
  const [duration, setDuration] = useState(degree?.duration_years != null ? String(degree.duration_years) : "");
  const [sortOrder, setSortOrder] = useState(String(degree?.sort_order ?? 0));
  const [terms, setTerms] = useState((degree?.search_terms ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function save() {
    setBusy(true); setError("");
    const payload = {
      label, category, level: level || null, branch_mode: branchMode,
      duration_years: duration, sort_order: Number(sortOrder) || 0, search_terms: terms,
    };
    try {
      if (degree) {
        await api(`/api/admin/reference/degrees/${encodeURIComponent(degree.slug)}`, {
          method: "PATCH", body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/reference/degrees", { method: "POST", body: JSON.stringify({ ...payload, slug }) });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(active: boolean) {
    await api(`/api/admin/reference/degrees/${encodeURIComponent(degree!.slug)}`, {
      method: "PATCH", body: JSON.stringify({ is_active: active }),
    });
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{degree ? `Edit ${degree.label}` : "Add a degree"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Slug</Label>
            {/* Read-only after create: student_profile.degree stores this slug with
                no FK, so changing it would orphan every row holding it. */}
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!degree} placeholder="e.g. bsc_hons" />
            {degree && <p className="text-muted-foreground text-xs">Slugs can&apos;t change — student records store them.</p>}
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. B.Sc (Honours)" />
          </div>
          <div className="grid gap-1.5">
            <Label>Group (dropdown heading)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="UG / PG / Diploma" />
          </div>
          <div className="grid gap-1.5">
            <Label>Level</Label>
            <RefSelect value={level} onChange={setLevel} className="w-full" options={LEVEL_OPTIONS} placeholder="—" emptyLabel="—" />
          </div>
          <div className="grid gap-1.5">
            <Label>Duration (years)</Label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" placeholder="3" />
            <p className="text-muted-foreground text-xs">Caps the Year of Study list.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Sort order</Label>
            <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Branch mode</Label>
            <RefSelect value={branchMode} onChange={setBranchMode} className="w-full" options={BRANCH_MODE_OPTIONS} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Search aliases (comma-separated)</Label>
            <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="btech, b tech, engineering" />
            <p className="text-muted-foreground text-xs">What students might type instead of the label.</p>
          </div>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter className="gap-2">
          {degree && (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              onClick={() => (degree.is_active ? setConfirmDeactivate(true) : void setActive(true))}
            >
              {degree.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>

      {degree && (
        <ConfirmDialog
          open={confirmDeactivate}
          onOpenChange={setConfirmDeactivate}
          title={`Deactivate ${degree.label}?`}
          destructive
          confirmLabel="Deactivate"
          description={
            <>
              It disappears from new registration forms.{" "}
              <b>{degree.student_count} student{degree.student_count === 1 ? "" : "s"}</b> and{" "}
              <b>{degree.mentor_count} mentor{degree.mentor_count === 1 ? "" : "s"}</b> currently hold it — their
              records keep the value and still show this label. Nothing is deleted.
            </>
          }
          onConfirm={() => setActive(false)}
        />
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
function BranchesTab({ branches, loading, onChanged }: { branches: Branch[]; loading: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<Branch | "new" | null>(null);

  const columns: ColumnDef<Branch>[] = [
    {
      accessorKey: "label",
      header: ({ column }) => <SortHeader column={column}>Branch</SortHeader>,
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium">{row.original.label}</span>
          {!row.original.is_active && <StatusBadge tone="slate" className="ml-2 align-middle">inactive</StatusBadge>}
          <span className="text-muted-foreground block text-xs"><code>{row.original.slug}</code></span>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: ({ column }) => <SortHeader column={column}>Category</SortHeader>,
      cell: ({ row }) => row.original.category ?? "—",
      filterFn: arrIncludes,
    },
    {
      accessorKey: "family",
      header: ({ column }) => <SortHeader column={column}>Family</SortHeader>,
      cell: ({ row }) => row.original.family ?? "—",
      filterFn: arrIncludes,
    },
    {
      accessorKey: "degree_count",
      header: ({ column }) => <SortHeader column={column}>Degrees</SortHeader>,
      cell: ({ row }) => <span className="tabular-nums">{row.original.degree_count}</span>,
    },
    {
      accessorKey: "student_count",
      header: ({ column }) => <SortHeader column={column}>Students</SortHeader>,
      cell: ({ row }) => <span className="tabular-nums">{row.original.student_count}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(row.original)}>Edit</Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          <b>Family</b> is the coarse bucket mentor matching and analytics group by — a B.Sc{" "}
          <code>computer_science</code> student and a B.Tech <code>cse</code> mentor both sit in{" "}
          <code>computing</code>. <b>Degrees</b> is how many offer this branch: renaming a shared one renames it
          everywhere.
        </p>
        <Button type="button" className="shrink-0" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add branch
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className={EMPTY_CLS}>Loading…</p>
          ) : (
            <DataTable
              columns={columns}
              data={branches}
              searchKey="label"
              searchPlaceholder="Search branches…"
              filters={[
                { columnId: "category", title: "Category", options: facets(branches.map((b) => b.category)) },
                { columnId: "family", title: "Family", options: facets(branches.map((b) => b.family)) },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {editing && (
        <BranchEditor
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function BranchEditor({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const [slug, setSlug] = useState(branch?.slug ?? "");
  const [label, setLabel] = useState(branch?.label ?? "");
  const [category, setCategory] = useState(branch?.category ?? "");
  const [family, setFamily] = useState(branch?.family ?? "");
  const [sortOrder, setSortOrder] = useState(String(branch?.sort_order ?? 0));
  const [terms, setTerms] = useState((branch?.search_terms ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function save() {
    setBusy(true); setError("");
    const payload = { label, category, family, sort_order: Number(sortOrder) || 0, search_terms: terms };
    try {
      if (branch) {
        await api(`/api/admin/reference/branches/${encodeURIComponent(branch.slug)}`, {
          method: "PATCH", body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/reference/branches", { method: "POST", body: JSON.stringify({ ...payload, slug }) });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(active: boolean) {
    await api(`/api/admin/reference/branches/${encodeURIComponent(branch!.slug)}`, {
      method: "PATCH", body: JSON.stringify({ is_active: active }),
    });
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{branch ? `Edit ${branch.label}` : "Add a branch"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!branch} placeholder="e.g. cs_quantum" />
            {branch && <p className="text-muted-foreground text-xs">Slugs can&apos;t change — student records store them.</p>}
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Quantum Computing" />
            {/* Labels are globally unique (the Excel import resolves a Branch cell
                by label) and a shared branch has ONE row, so a rename lands on
                every degree that offers it. */}
            <p className="text-muted-foreground text-xs">
              Must be unique across all branches.
              {branch && branch.degree_count > 1 && (
                <> This one is offered by <b>{branch.degree_count} degrees</b> — renaming it changes all of them.</>
              )}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Category (fallback heading)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Engineering" />
          </div>
          <div className="grid gap-1.5">
            <Label>Family</Label>
            <Input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="computing" />
            <p className="text-muted-foreground text-xs">Mentor matching + analytics bucket.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Sort order (fallback)</Label>
            <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
            <p className="text-muted-foreground text-xs">Per-degree order wins; this is only a tiebreak.</p>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Search aliases (comma-separated)</Label>
            <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="csc, computers, comp sci" />
          </div>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter className="gap-2">
          {branch && (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              onClick={() => (branch.is_active ? setConfirmDeactivate(true) : void setActive(true))}
            >
              {branch.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>

      {branch && (
        <ConfirmDialog
          open={confirmDeactivate}
          onOpenChange={setConfirmDeactivate}
          title={`Deactivate ${branch.label}?`}
          destructive
          confirmLabel="Deactivate"
          description={
            <>
              It disappears from new registration forms and from the Excel template.{" "}
              <b>{branch.student_count} student{branch.student_count === 1 ? "" : "s"}</b> and{" "}
              <b>{branch.mentor_count} mentor{branch.mentor_count === 1 ? "" : "s"}</b> currently hold it — their
              records keep the value and still show this label. Nothing is deleted, and you can reactivate it here.
            </>
          }
          onConfirm={() => setActive(false)}
        />
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// "Other" answers inbox
// ---------------------------------------------------------------------------
function OtherAnswersTab({
  branches, degrees, onChanged,
}: { branches: Branch[]; degrees: Degree[]; onChanged: () => void }) {
  const [answers, setAnswers] = useState<OtherAnswer[] | null>(null);
  const [unspecified, setUnspecified] = useState<Unspecified[]>([]);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<{ answers: OtherAnswer[]; unspecified: Unspecified[] }>(
        "/api/admin/reference/other-answers",
      );
      setAnswers(data.answers);
      setUnspecified(data.unspecified ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function resolve(row: OtherAnswer) {
    const key = `${row.kind}:${row.answer}`;
    const slug = target[key];
    if (!slug) return;
    setBusy(key); setError(""); setNotice("");
    try {
      const { updated } = await api<{ updated: number }>("/api/admin/reference/other-answers", {
        method: "POST",
        body: JSON.stringify({ kind: row.kind, answer: row.answer, [`${row.kind}_slug`]: slug }),
      });
      setNotice(`Updated ${updated} profile${updated === 1 ? "" : "s"} to ${slug}.`);
      onChanged();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        What students and mentors typed when they picked <b>Other</b>. Acting on these is what keeps the catalogue
        current — map an answer to a real option and the matching profiles are corrected and their write-in cleared.
      </p>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="ok">{notice}</Alert>}
      {/* Profiles on "Other" with nothing typed. NOT offered as a mappable row: the
          bucket is heterogeneous, so bulk-mapping it would silently rewrite unrelated
          students. Surfaced as a count so it can be chased instead of staying
          invisible — see ref_other_unspecified(), migration 161. */}
      {unspecified.some((u) => u.uses > 0) && (
        <Alert tone="warn">
          {unspecified.map((u) => `${u.uses} ${u.kind}`).join(" and ")} answer
          {unspecified.reduce((n, u) => n + u.uses, 0) === 1 ? " is" : "s are"} set to <b>Other</b> with no text —
          nothing to map. Those students need to re-pick on their next Step 2 edit, or you can ask them directly.
        </Alert>
      )}
      <Card>
        <CardContent className="pt-6">
          {answers === null && <p className={EMPTY_CLS}>Loading…</p>}
          {answers?.length === 0 && (
            <p className={EMPTY_CLS}>
              No write-ins yet. They appear here as soon as someone picks “Other” and types their own answer.
            </p>
          )}
          {!!answers?.length && (
            <ul className="divide-y rounded-xl border">
              {answers.map((row) => {
                const key = `${row.kind}:${row.answer}`;
                const options: ComboboxOption[] =
                  row.kind === "branch"
                    ? branches.filter((b) => b.is_active).map((b) => ({
                        value: b.slug, label: b.label, group: b.category, searchTerms: b.search_terms,
                      }))
                    : degrees.filter((d) => d.is_active).map((d) => ({
                        value: d.slug, label: d.label, group: d.category, searchTerms: d.search_terms,
                      }));
                return (
                  <li key={key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">“{row.answer}”</p>
                      <p className="text-muted-foreground text-xs">
                        {row.kind} · {row.uses} time{row.uses === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="grid gap-1.5 sm:w-72">
                      <Label className="text-xs">Map to</Label>
                      <Combobox
                        value={target[key] ?? ""}
                        onChange={(v) => setTarget((t) => ({ ...t, [key]: v }))}
                        options={options}
                        placeholder={`Pick a ${row.kind}…`}
                        emptyHint={`No match — add it on the ${row.kind === "branch" ? "Branches" : "Degrees"} tab first.`}
                      />
                    </div>
                    <Button type="button" size="sm" disabled={!target[key] || busy === key} onClick={() => resolve(row)}>
                      {busy === key ? "Applying…" : <><Check className="size-4" /> Apply</>}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
function HistoryTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<{ entries: AuditEntry[] }>("/api/admin/reference/audit");
      setEntries(data.entries);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Every catalogue edit, newest first. Reference data feeds forms, matching and reports, so changes are logged.
        </p>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void load()}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      <Card>
        <CardContent className="pt-6">
          {entries === null && <p className={EMPTY_CLS}>Loading…</p>}
          {entries?.length === 0 && <p className={EMPTY_CLS}>No edits recorded yet.</p>}
          {!!entries?.length && (
            <ul className="divide-y rounded-xl border">
              {entries.map((e) => (
                <li key={e.id} className="p-3">
                  <p className="text-sm">
                    <Badge variant="secondary" className="mr-2">{e.action}</Badge>
                    <code>{e.row_key}</code> <span className="text-muted-foreground">in {e.table_name}</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {e.actor_email ?? "unknown"} · {formatDateTime(e.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- building blocks --------------------------------------------------------
function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" | "warn" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-destructive/40 bg-destructive/5 text-destructive";
  return <p className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

/** A ≥44px icon-only tap target — the reorder controls have to be thumb-sized. */
function IconButton({
  label, onClick, disabled, destructive, children,
}: {
  label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`border-input flex size-11 items-center justify-center rounded-lg border transition sm:size-9 ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : destructive
            ? "hover:border-destructive/60 hover:text-destructive"
            : "hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
