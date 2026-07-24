"use client";

// THE college picker for the whole app. One component, three shapes — replaces
// the six divergent copies (analytics/CollegePicker, students/college-picker,
// the private copies in registration-fields & mentor-fields, and the inline
// typeaheads in enrol-students & batch-editor).
//
//   • single (default) — value / onChange(College | null). Once picked, shows a
//     details panel (name + location, optionally the full record) with a
//     Change/Clear affordance instead of cramming the long name into the input.
//   • multiple         — `multiple` + values / onChange(College[]). Selected
//     colleges render as removable chips; the search list hides already-picked.
//   • filter (compact) — `variant="filter"`: a lighter single-select for toolbars
//     (no details card, an inline "clear" ✕), for college *filters* rather than a
//     form field.
//
// All shapes share ONE search (/api/colleges/search, word-AND ilike, 30 rows,
// 250ms debounce), outside-click-to-close, and theme tokens. Data/validation
// types live in lib/college.ts; this is purely the UI.
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Search rows carry the light columns; a selected college may carry the full
// record (for the details panel). Everything past name is optional so any
// caller's shape fits.
export type College = {
  id: string;
  name: string;
  place?: string | null;
  state?: string | null;
  district?: string | null;
  pincode?: string | null;
  address?: string | null;
  established_in?: number | null;
  ownership_type?: string | null;
  status?: string | null;
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function locationOf(c: College) {
  return [c.place, c.district, c.state].filter(Boolean).join(", ");
}

// ── shared search hook ─────────────────────────────────────────────────────
function useCollegeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query)}`);
      if (res.ok) setResults((await res.json()).results ?? []);
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return { query, setQuery, results, setResults };
}

// Close a dropdown when the user clicks outside its wrapper.
function useOutsideClose(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, onClose]);
}

// ── shared results list ────────────────────────────────────────────────────
function ResultsList({
  results,
  selectedIds,
  onChoose,
}: {
  results: College[];
  selectedIds: Set<string>;
  onChoose: (c: College) => void;
}) {
  if (results.length === 0) return null;
  return (
    <ul className="border-input bg-popover absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border text-sm shadow-md">
      {results.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left"
            onClick={() => onChoose(c)}
          >
            <Check className={cn("size-4 shrink-0", selectedIds.has(c.id) ? "opacity-100" : "opacity-0")} />
            <span>
              {c.name}
              {c.place ? (
                <span className="text-muted-foreground">
                  {" "}
                  — {c.place}
                  {c.state ? `, ${c.state}` : ""}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── details panel (single-select, selected state) ──────────────────────────
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

function CollegeDetails({
  college,
  details,
  onChange,
  onClear,
}: {
  college: College;
  details: boolean;
  onChange?: () => void;
  onClear?: () => void;
}) {
  const location = locationOf(college);
  return (
    <div className="border-input bg-muted/30 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-words">{college.name}</p>
          {location && <p className="text-muted-foreground mt-0.5 text-sm break-words">{location}</p>}
        </div>
        {(onChange || onClear) && (
          <div className="flex shrink-0 items-center gap-2">
            {onChange && (
              <Button type="button" size="sm" onClick={onChange}>
                Change
              </Button>
            )}
            {onClear && (
              <Button type="button" variant="outline" size="sm" onClick={onClear}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      {details && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <Detail label="District" value={college.district} />
          <Detail label="State" value={college.state} />
          <Detail label="PIN" value={college.pincode} />
          <Detail label="Ownership" value={college.ownership_type ? titleCase(college.ownership_type) : null} />
          <Detail label="Established" value={college.established_in} />
          <Detail label="Status" value={college.status ? titleCase(college.status) : null} />
          {college.address && (
            <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
              <dt className="text-muted-foreground text-xs">Address</dt>
              <dd className="text-sm break-words">{college.address}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

// A field label with an optional required marker (consistent across every use).
function FieldLabel({
  id,
  label,
  required,
}: {
  id: string;
  label: string | null;
  required?: boolean;
}) {
  if (label === null) return null;
  return (
    <Label htmlFor={id}>
      {label}
      {required && (
        <>
          {" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only">(required)</span>
        </>
      )}
    </Label>
  );
}

type CommonProps = {
  /** Field label. Pass `null` to render no label (e.g. inside a toolbar). */
  label?: string | null;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

type SingleProps = CommonProps & {
  multiple?: false;
  /** "field" (details card) or "filter" (compact, no details). */
  variant?: "field" | "filter";
  /** Show the full details grid when selected (field variant only). */
  details?: boolean;
  value: College | null;
  onChange: (c: College | null) => void;
};

type MultiProps = CommonProps & {
  multiple: true;
  values: College[];
  onChange: (cs: College[]) => void;
};

export function CollegePicker(props: SingleProps | MultiProps) {
  if (props.multiple) return <MultiCollegePicker {...props} />;
  return <SingleCollegePicker {...props} />;
}

// ── single select ──────────────────────────────────────────────────────────
function SingleCollegePicker({
  label = "College",
  required,
  disabled = false,
  placeholder = "Search colleges…",
  className,
  variant = "field",
  details = true,
  value,
  onChange,
}: SingleProps) {
  const id = useId();
  const { query, setQuery, results, setResults } = useCollegeSearch();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useOutsideClose(boxRef, () => setOpen(false));

  function choose(c: College) {
    setOpen(false);
    setEditing(false);
    setQuery("");
    setResults([]);
    onChange(c);
  }

  function clear() {
    setOpen(false);
    setEditing(false);
    setQuery("");
    setResults([]);
    onChange(null);
  }

  // Compact filter variant: name-in-panel with an inline ✕, no details grid.
  if (value && variant === "filter") {
    return (
      <div className={cn("grid gap-1.5", className)}>
        <FieldLabel id={id} label={label} required={required} />
        <div className="border-input bg-muted/30 flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="min-w-0 truncate text-sm">{value.name}</span>
          {!disabled && (
            <button
              type="button"
              aria-label="Clear college"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={clear}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Field variant, selected (or locked): show the details panel.
  if (value && (disabled || !editing)) {
    return (
      <div className={cn("grid gap-1.5", className)}>
        <FieldLabel id={id} label={label} required={required} />
        <CollegeDetails
          college={value}
          details={details}
          onChange={disabled ? undefined : () => setEditing(true)}
          onClear={disabled ? undefined : clear}
        />
      </div>
    );
  }

  return (
    <div ref={boxRef} className={cn("relative grid gap-1.5", className)}>
      <FieldLabel id={id} label={label} required={required} />
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          id={id}
          autoComplete="off"
          className="pr-8 pl-8"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => results.length && setOpen(true)}
        />
        <ChevronsUpDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
      </div>
      {value && (
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setQuery("");
          }}
          className="text-muted-foreground hover:text-foreground absolute top-0 right-0 text-xs"
        >
          Cancel
        </button>
      )}
      {open && <ResultsList results={results} selectedIds={new Set(value ? [value.id] : [])} onChoose={choose} />}
    </div>
  );
}

// ── multi select ───────────────────────────────────────────────────────────
function MultiCollegePicker({
  label = "Colleges",
  required,
  disabled = false,
  placeholder = "Search colleges…",
  className,
  values,
  onChange,
}: MultiProps) {
  const id = useId();
  const { query, setQuery, results, setResults } = useCollegeSearch();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useOutsideClose(boxRef, () => setOpen(false));

  const selectedIds = new Set(values.map((c) => c.id));

  function toggle(c: College) {
    if (selectedIds.has(c.id)) onChange(values.filter((v) => v.id !== c.id));
    else onChange([...values, c]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(cId: string) {
    onChange(values.filter((v) => v.id !== cId));
  }

  return (
    <div ref={boxRef} className={cn("relative grid gap-1.5", className)}>
      <FieldLabel id={id} label={label} required={required} />
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((c) => (
            <li
              key={c.id}
              className="border-input bg-muted/40 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-sm"
            >
              <span className="max-w-[16rem] truncate">{c.name}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                  onClick={() => remove(c.id)}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          id={id}
          autoComplete="off"
          className="pr-8 pl-8"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => results.length && setOpen(true)}
        />
        <ChevronsUpDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
      </div>
      {open && <ResultsList results={results} selectedIds={selectedIds} onChoose={toggle} />}
    </div>
  );
}
