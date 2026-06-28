"use client";

// A lightweight searchable single-select (combobox). Used where a plain <select>
// gets unwieldy — e.g. picking a chapter out of a long shared syllabus. Built
// from primitives (no extra shadcn deps): a trigger button + a popover holding a
// search Input and a filtered list. Returns the chosen option's value (its id),
// so it's a drop-in for a controlled <select value onChange>.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";

export type SelectOption = { value: string; label: string };

export function SearchableSelect({
  options,
  value,
  onChange,
  id,
  placeholder = "Select…",
  emptyOption,
  searchPlaceholder = "Search…",
  disabled,
  className,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Shown on the trigger when nothing is selected (and there's no emptyOption). */
  placeholder?: string;
  /** Label for an explicit "clear"/all choice mapping to value "" (e.g. "All chapters"). */
  emptyOption?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  // Close on outside click while open.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  const itemClass =
    "hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left";

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="border-input bg-background flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.label : (emptyOption ?? placeholder)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full rounded-md border shadow-md">
          <div className="border-b p-1.5">
            <Input
              autoFocus
              className="h-8"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-60 overflow-auto p-1 text-sm">
            {emptyOption && (
              <li>
                <button type="button" className={itemClass} onClick={() => choose("")}>
                  <span className="truncate">{emptyOption}</span>
                  {value === "" && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button type="button" className={itemClass} onClick={() => choose(o.value)}>
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-muted-foreground px-2 py-3 text-center">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
