"use client";

// A lightweight searchable single-select (combobox). Used where a plain <select>
// gets unwieldy — e.g. picking a chapter out of a long shared syllabus. The
// dropdown renders in a PORTAL anchored to the trigger, so it's never clipped by
// an ancestor's `overflow-hidden` (e.g. a short Card) and floats above content.
// Returns the chosen option's value (its id) — a drop-in for a controlled select.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  placeholder?: string;
  emptyOption?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  function toggle() {
    if (!open) place();
    setOpen((o) => !o);
    setQuery("");
  }

  // While open: reposition on scroll/resize; close on outside click (checking
  // BOTH the trigger and the portaled popover, since the popover isn't a DOM
  // descendant of the trigger).
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  const itemClass =
    "hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left";

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="border-input bg-background flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.label : (emptyOption ?? placeholder)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: rect.top, left: rect.left, minWidth: rect.width }}
            className="bg-popover text-popover-foreground z-[60] max-w-[min(22rem,90vw)] rounded-md border shadow-md"
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
