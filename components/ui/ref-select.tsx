"use client";

// RefSelect — a thin shadcn/Radix <Select> wrapper for the common "pick one from
// a list of options" dropdown, so forms stop hand-rolling native <select>. Use
// this (or the Select primitives directly) instead of a raw <select> on app
// surfaces (docs/STYLE_GUIDE.md → "Label + Input/Select").
//
// Radix forbids an empty-string value on a <SelectItem>, but forms routinely
// need an empty value for "not chosen" / "All" / "None". This wrapper handles
// both cleanly:
//   • no `emptyLabel`  → an empty value ("") just shows the `placeholder`.
//   • with `emptyLabel` → renders a selectable clear item (e.g. "All states")
//     that maps to "" via an internal sentinel.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix rejects "" as a SelectItem value, so the clear item uses this sentinel.
const EMPTY = "__empty__";

export type SelectOption = { value: string; label: string };

export function RefSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyLabel,
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** When set, renders a selectable clear item (e.g. "All", "None") that maps to "". */
  emptyLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value === "" && emptyLabel ? EMPTY : value}
      onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
