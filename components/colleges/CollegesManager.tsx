"use client";

/**
 * Colleges management UI (console surface → Tailwind + shadcn primitives). Talks
 * exclusively to /api/colleges/* — list/search/paginate, create, update, and
 * archive/restore — so every change round-trips through the API and the DB stays
 * the single source of truth. Mobile-first: filters stack and rows render as
 * cards, scaling up to a denser layout on wider screens.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import {
  COLLEGE_STATUSES,
  OWNERSHIP_TYPES,
  SELF_UNIVERSITY,
  type College,
  type CollegeStatus,
  type OwnershipType,
} from "@/lib/college";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RefSelect } from "@/components/ui/ref-select";
import { StatusBadge } from "@/components/data-table-parts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/** Columns the list endpoint can sort by (must match SORTABLE in the API route). */
type SortKey =
  | "college_code"
  | "name"
  | "place"
  | "district"
  | "state"
  | "pincode"
  | "established_in"
  | "ownership_type"
  | "status";

/** A university option for the affiliating-university dropdown/filter. */
type UniversityOption = { id: string; name: string; state: string | null };

type FormFields = {
  name: string;
  place: string;
  address: string;
  district: string;
  state: string;
  pincode: string;
  established_in: string;
  ownership_type: "" | OwnershipType;
  status: CollegeStatus;
  college_code: string;
  /** Affiliating university id ("" = none). Ignored when isUniversity is true. */
  university_id: string;
  /** This institution is itself a university (self-association). */
  isUniversity: boolean;
};

const EMPTY_FORM: FormFields = {
  name: "",
  place: "",
  address: "",
  district: "",
  state: "",
  pincode: "",
  established_in: "",
  ownership_type: "",
  status: "active",
  college_code: "",
  university_id: "",
  isUniversity: false,
};

function toForm(c: College): FormFields {
  // A row whose university_id points at itself IS a university.
  const isUniversity = c.university_id != null && c.university_id === c.id;
  return {
    name: c.name ?? "",
    place: c.place ?? "",
    address: c.address ?? "",
    district: c.district ?? "",
    state: c.state ?? "",
    pincode: c.pincode ?? "",
    established_in: c.established_in != null ? String(c.established_in) : "",
    ownership_type: c.ownership_type ?? "",
    status: c.status ?? "active",
    college_code: c.college_code ?? "",
    university_id: isUniversity ? "" : (c.university_id ?? ""),
    isUniversity,
  };
}

/** Shape the form into the JSON the API expects (empty strings → null). */
function toPayload(f: FormFields) {
  const n = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    name: f.name.trim(),
    place: n(f.place),
    address: n(f.address),
    district: n(f.district),
    state: n(f.state),
    pincode: n(f.pincode),
    established_in: f.established_in.trim() === "" ? null : Number(f.established_in),
    ownership_type: f.ownership_type === "" ? null : f.ownership_type,
    status: f.status,
    college_code: n(f.college_code),
    // SELF_UNIVERSITY tells the server to self-associate; otherwise the chosen
    // university id, or null for none.
    university_id: f.isUniversity ? SELF_UNIVERSITY : f.university_id || null,
  };
}

export function CollegesManager() {
  // Filters
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<CollegeStatus | "all">("active");
  const [universityFilter, setUniversityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Server-side sort: a whitelisted column + direction (see /api/colleges).
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Data
  const [colleges, setColleges] = useState<College[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [universities, setUniversities] = useState<UniversityOption[]>([]);

  // Form (add or edit)
  const [editing, setEditing] = useState<College | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation (type-to-confirm, since a delete is irreversible).
  const [deleteTarget, setDeleteTarget] = useState<College | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status: statusFilter,
      sort,
      dir,
    });
    if (q.trim()) params.set("q", q.trim());
    if (stateFilter) params.set("state", stateFilter);
    if (ownershipFilter) params.set("ownership", ownershipFilter);
    if (universityFilter) params.set("university", universityFilter);

    try {
      const res = await fetch(`/api/colleges?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load colleges");
      setColleges(json.colleges);
      setTotal(json.total);
    } catch (e) {
      setListError((e as Error).message);
      setColleges([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, stateFilter, ownershipFilter, statusFilter, universityFilter, sort, dir]);

  // Debounce only the free-text search; other filters apply immediately.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(load, q.trim() ? 300 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [load, q]);

  // Reset to page 1 whenever a filter, the page size, or the sort changes.
  useEffect(() => {
    setPage(1);
  }, [q, stateFilter, ownershipFilter, statusFilter, universityFilter, pageSize, sort, dir]);

  // Click a column header: same column toggles direction, a new column sorts asc.
  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  }

  // Load the state list once for the filter + form datalist.
  useEffect(() => {
    fetch("/api/colleges/states")
      .then((r) => (r.ok ? r.json() : { states: [] }))
      .then((j) => setStates(j.states ?? []))
      .catch(() => setStates([]));
  }, []);

  // Load the universities once for the filter + form dropdown. Re-run after a
  // save so a newly-marked university shows up immediately.
  const loadUniversities = useCallback(() => {
    fetch("/api/colleges/universities")
      .then((r) => (r.ok ? r.json() : { universities: [] }))
      .then((j) => setUniversities(j.universities ?? []))
      .catch(() => setUniversities([]));
  }, []);
  useEffect(() => {
    loadUniversities();
  }, [loadUniversities]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(c: College) {
    setEditing(c);
    setForm(toForm(c));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = toPayload(form);
    const url = editing ? `/api/colleges/${editing.id}` : "/api/colleges";
    const method = editing ? "PATCH" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      closeForm();
      await load();
      loadUniversities();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(c: College, status: CollegeStatus) {
    try {
      const res = await fetch(`/api/colleges/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      await load();
    } catch (e) {
      setListError((e as Error).message);
    }
  }

  // Irreversible delete → type-to-confirm dialog (throws so the dialog surfaces
  // the error inline and stays open on failure).
  async function remove(c: College) {
    const res = await fetch(`/api/colleges/${c.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Delete failed");
    await load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-5">
      {/* Add / edit form — modal dialog */}
      <div>
        <Button onClick={openAdd}>Add college</Button>
      </div>
      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit college" : "Add college"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" required className="sm:col-span-2">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="College name"
                    required
                  />
                </Field>

                <Field label="Place (city / town)">
                  <Input
                    value={form.place}
                    onChange={(e) => setForm({ ...form, place: e.target.value })}
                    placeholder="e.g. Vijayawada"
                  />
                </Field>

                <Field label="District">
                  <Input
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })}
                  />
                </Field>

                <Field label="State">
                  <Input
                    list="college-states"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  />
                  <datalist id="college-states">
                    {states.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>

                <Field label="Pincode">
                  <Input
                    value={form.pincode}
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                    placeholder="6 digits"
                  />
                </Field>

                <Field label="College code">
                  <Input
                    value={form.college_code}
                    onChange={(e) => setForm({ ...form, college_code: e.target.value })}
                    placeholder="e.g. 10033 (OAMDC)"
                  />
                </Field>

                <Field label="Address" className="sm:col-span-2">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Full address"
                  />
                </Field>

                <Field label="Established (year)">
                  <Input
                    value={form.established_in}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setForm({ ...form, established_in: e.target.value })}
                    placeholder="e.g. 1998"
                  />
                </Field>

                <Field label="Ownership">
                  <RefSelect
                    value={form.ownership_type}
                    onChange={(v) =>
                      setForm({ ...form, ownership_type: v as "" | OwnershipType })
                    }
                    emptyLabel="—"
                    options={OWNERSHIP_TYPES.map((o) => ({
                      value: o,
                      label: o === "GOVERNMENT" ? "Government" : "Private",
                    }))}
                  />
                </Field>

                <Field label="Status">
                  <RefSelect
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v as CollegeStatus })}
                    options={COLLEGE_STATUSES.map((s) => ({
                      value: s,
                      label: s === "active" ? "Active" : "Archived",
                    }))}
                  />
                </Field>

                {/* University association — optional. A row can EITHER be a
                    university itself (self-association) OR be affiliated to one. */}
                <div className="bg-muted/40 grid gap-3 rounded-md border p-3 sm:col-span-2">
                  <label className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0"
                      checked={form.isUniversity}
                      onChange={(e) => setForm({ ...form, isUniversity: e.target.checked })}
                    />
                    <span>
                      <span className="font-medium">This institution is itself a university</span>
                      <span className="text-muted-foreground block text-xs">
                        It will be associated to itself and become selectable as an affiliating university for other colleges.
                      </span>
                    </span>
                  </label>

                  <Field label="Affiliating university">
                    <RefSelect
                      value={form.university_id}
                      onChange={(v) => setForm({ ...form, university_id: v })}
                      disabled={form.isUniversity}
                      emptyLabel="— None —"
                      options={universities.map((u) => ({
                        value: u.id,
                        label: u.name + (u.state ? ` · ${u.state}` : ""),
                      }))}
                    />
                    {form.isUniversity && (
                      <p className="text-muted-foreground text-xs">
                        Disabled — a university is associated to itself.
                      </p>
                    )}
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <Button type="submit" disabled={saving || !form.name.trim()}>
                    {saving ? "Saving…" : editing ? "Save changes" : "Add college"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={closeForm} disabled={saving}>
                    Cancel
                  </Button>
                  {formError && <p className="text-destructive text-sm">{formError}</p>}
                </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — irreversible, so type-to-confirm the name */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        destructive
        title="Delete college"
        description={
          <>
            This permanently removes <span className="text-foreground font-semibold">{deleteTarget?.name}</span>{" "}
            and can&apos;t be undone.
          </>
        }
        confirmPhrase={deleteTarget?.name}
        confirmLabel="Delete college"
        onConfirm={() => remove(deleteTarget!)}
      />

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1">
          <Input
            placeholder="Search name, place or district…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <RefSelect
          value={stateFilter}
          onChange={setStateFilter}
          emptyLabel="All states"
          aria-label="Filter by state"
          options={states.map((s) => ({ value: s, label: s }))}
        />
        <RefSelect
          value={ownershipFilter}
          onChange={setOwnershipFilter}
          emptyLabel="All ownership"
          aria-label="Filter by ownership"
          options={OWNERSHIP_TYPES.map((o) => ({
            value: o,
            label: o === "GOVERNMENT" ? "Government" : "Private",
          }))}
        />
        <RefSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as CollegeStatus | "all")}
          aria-label="Filter by status"
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
            { value: "all", label: "All statuses" },
          ]}
        />
        <RefSelect
          value={universityFilter}
          onChange={setUniversityFilter}
          emptyLabel="All universities"
          aria-label="Filter by university"
          options={universities.map((u) => ({ value: u.id, label: u.name }))}
        />
      </div>

      {/* Result count + rows-per-page */}
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {loading
            ? "Loading…"
            : total === 0
              ? "0 colleges"
              : `${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${total.toLocaleString()} colleges`}
        </span>
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <RefSelect
            value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
            aria-label="Rows per page"
            className="h-8 w-auto"
            options={PAGE_SIZE_OPTIONS.map((n) => ({
              value: String(n),
              label: String(n),
            }))}
          />
        </label>
      </div>

      {listError && <p className="text-destructive text-sm">{listError}</p>}

      {/* Results — dense, spreadsheet-style grid. Scrolls sideways inside its
          own container on narrow screens so the page never overflows. */}
      <div className="rounded-md border">
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[1180px] text-sm">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <SortHeader label="Code" col="college_code" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Name" col="name" sort={sort} dir={dir} onSort={toggleSort} className="min-w-[220px]" />
                <TableHead className="min-w-[200px]">University</TableHead>
                <SortHeader label="Place" col="place" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="District" col="district" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="State" col="state" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Pincode" col="pincode" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Est." col="established_in" sort={sort} dir={dir} onSort={toggleSort} align="right" />
                <SortHeader label="Ownership" col="ownership_type" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Status" col="status" sort={sort} dir={dir} onSort={toggleSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && colleges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground py-8 text-center">
                    No colleges match these filters.
                  </TableCell>
                </TableRow>
              )}
              {colleges.map((c) => (
                <TableRow key={c.id} className={c.status === "archived" ? "opacity-60" : undefined}>
                  <TableCell className="text-muted-foreground tabular-nums">{c.college_code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {c.university_id && c.university_id === c.id ? (
                      <Badge variant="secondary">University</Badge>
                    ) : (
                      (c.university?.name ?? "—")
                    )}
                  </TableCell>
                  <TableCell>{c.place ?? "—"}</TableCell>
                  <TableCell>{c.district ?? "—"}</TableCell>
                  <TableCell>{c.state ?? "—"}</TableCell>
                  <TableCell>{c.pincode ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.established_in ?? "—"}</TableCell>
                  <TableCell>
                    {c.ownership_type
                      ? c.ownership_type === "GOVERNMENT"
                        ? "Government"
                        : "Private"
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={c.status === "active" ? "emerald" : "slate"}>
                      {c.status === "active" ? "Active" : "Archived"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Edit"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={c.status === "active" ? "Archive" : "Restore"}
                        aria-label={`${c.status === "active" ? "Archive" : "Restore"} ${c.name}`}
                        onClick={() => setStatus(c, c.status === "active" ? "archived" : "active")}
                      >
                        {c.status === "active" ? (
                          <Archive className="h-4 w-4" />
                        ) : (
                          <ArchiveRestore className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-8 w-8"
                        title="Delete"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(1)}>
            « First
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Prev
          </Button>
          <span className="text-muted-foreground flex items-center gap-1.5 px-1 text-sm">
            Page
            <input
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= totalPages) setPage(n);
              }}
              className="border-input bg-background h-8 w-16 rounded-md border px-2 text-center text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
            />
            of {totalPages.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next ›
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(totalPages)}
          >
            Last »
          </Button>
        </div>
      )}
    </div>
  );
}

/** A sortable column header: click to sort, shows the active direction. */
function SortHeader({
  label,
  col,
  sort,
  dir,
  onSort,
  align,
  className,
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "right";
  className?: string;
}) {
  const active = sort === col;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-label={`Sort by ${label}${active ? (dir === "asc" ? " (ascending)" : " (descending)") : ""}`}
        className={`group hover:text-foreground -mx-1 flex w-full items-center gap-1 rounded px-1 ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-foreground font-medium" : ""}`}
      >
        <span>{label}</span>
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

/** Labelled field wrapper matching the invite form's grid styling. */
function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
