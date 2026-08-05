"use client";

// Combobox — a searchable, optionally GROUPED single-select. Same prop shape as
// RefSelect (value / onChange / options / placeholder / disabled / className), so
// it is a drop-in wherever a list has outgrown a bare scroll list.
//
// WHY THIS EXISTS (issue #99): the Branch dropdown became degree-dependent and
// 7–32 options long, and Degree grew to 20. RefSelect is a thin Radix <Select>
// with no filtering and no option groups — past ~15 options that is unusable on a
// 320px phone, and a B.Sc student cannot tell "Common combinations" from "Single
// major" without headings. There was no combobox in the repo and `cmdk` is not a
// dependency, so this is hand-rolled rather than adding one.
//
// SEARCH MATCHES HOW STUDENTS TYPE, not just the label: each option carries
// `searchTerms` (ref_branch.search_terms / ref_degree.search_terms, seeded in
// migration 161) so "csc", "computers", "comp sci", "E.C.E", "mpc" and "bcom
// computers" all land on the right row. Matching is punctuation- and
// diacritic-insensitive and token-order-independent (lib/degree-branch.ts).
//
// MOBILE IS THE PRIMARY SURFACE (CLAUDE.md): the panel is a near-full-height
// bottom sheet under `sm` and an anchored popover from `sm` up — ONE element,
// switched by responsive classes (`fixed … sm:absolute`) rather than a JS media
// query, so there is no hydration flash and no second code path to keep in sync.
// Rows are ≥44px, group headings stick while scrolling, and the search input
// inherits Input's `text-base md:text-sm` (16px on mobile, or iOS Safari zooms
// the whole page on focus).
//
// Filtering is IN MEMORY. These lists are ≤35 rows and already client-side, so
// unlike CollegePicker (1,258 colleges behind /api/colleges/search) there is no
// endpoint and no debounce — results are instant.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchesQuery } from "@/lib/degree-branch";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Option-group heading. Consecutive options sharing one group render under a
   * single sticky header; `null`/absent options render ungrouped. */
  group?: string | null;
  /** Aliases matched alongside the label — see the header note. */
  searchTerms?: string[] | null;
};

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyHint = "No matches.",
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when nothing matches. Should offer a way OUT — a dead end is what
   * pushes students onto "Other" without telling us what they actually study. */
  emptyHint?: React.ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);
  // Where to draw the desktop panel. null until measured (and on phones, where the
  // panel is a bottom sheet and needs no anchor).
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(
    () => options.filter((o) => matchesQuery({ label: o.label, slug: o.value, search_terms: o.searchTerms }, query)),
    [options, query],
  );

  // Clamp the highlight whenever the result set shrinks under it.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function openPanel() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    // Start on the current selection so the list opens where the user left it — and
    // at the TOP when there is no selection, rather than wherever a previous hover
    // left the highlight (which made a 30-option list open mid-way down).
    const i = options.findIndex((o) => o.value === value);
    setActive(i < 0 ? 0 : i);
    if (i < 0) requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }));
  }

  function choose(option: ComboboxOption) {
    onChange(option.value);
    close();
  }

  // Close on an outside click (desktop popover) — the mobile sheet also has a
  // tappable backdrop, which is the more discoverable affordance on a phone.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      // The panel lives in a portal, so it is NOT inside boxRef — check both, or
      // every click on an option would close the panel before it registered.
      if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /**
   * Position the desktop panel. It is PORTALLED to <body> and positioned `fixed`,
   * which fixes two things a plain `absolute` panel got wrong:
   *   • CLIPPING — an ancestor with `overflow-hidden` (a Card, a table wrapper)
   *     cuts an absolutely-positioned child off. The registration form's Branch
   *     dropdown was being sliced by its own card.
   *   • RUNNING PAST THE FOLD — anchored under a trigger low on the page, a
   *     fixed-height panel disappeared off the bottom of the window, so most of a
   *     30-branch list was simply unreachable.
   * So: measure the trigger, prefer opening downward, FLIP UP when there is more
   * room above, and cap the height to the space actually available (never more
   * than 60vh) so the list always ends on screen with room to scroll.
   */
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 4;
    const MARGIN = 8;                       // keep clear of the window edge
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const cap = Math.round(window.innerHeight * 0.6);
    const flip = below < Math.min(260, above) && above > below;
    const maxHeight = Math.max(160, Math.min(cap, flip ? above : below));
    setAnchor({
      top: flip ? r.top - GAP - maxHeight : r.bottom + GAP,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setAnchor(null); return; }
    place();
    // Re-measure while open: scrolling or resizing must move the panel with its
    // trigger, not leave it stranded mid-page.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Focus the search box on open, and keep the highlighted row visible.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { openPanel(); return; }
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(filtered.length - 1, next));
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!open) { openPanel(); return; }
      const option = filtered[active];
      if (option) choose(option);
    }
  }

  const activeId = filtered[active] ? `${listId}-${filtered[active].value}` : undefined;
  // Headings only earn their space when there is more than ONE group. B.Tech's 30
  // branches are all "Engineering", so a lone sticky heading pinned over a
  // scrolling list just read as a stray row appearing mid-list.
  const showGroups = new Set(filtered.map((o) => o.group ?? "")).size > 1;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onKeyDown}
        className={cn(
          "border-input flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-left text-base transition-colors outline-none select-none md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
          "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
          "dark:bg-input/30 dark:disabled:bg-input/80",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </button>

      {open && createPortal(
        <>
          {/* Backdrop, phones only — the popover form dismisses on an outside click. */}
          <div className="pointer-events-auto fixed inset-0 z-[59] bg-black/40 sm:hidden" onClick={close} aria-hidden />
          <div
            ref={panelRef}
            className={cn(
              // Two guards for living inside a Radix modal (the catalogue's "Preview
              // as student" dialog), since this panel portals to <body> and is
              // therefore a SIBLING of the dialog, not a descendant:
              //   • z-[60] to paint above the z-50 shared by Dialog/Sheet content,
              //     instead of leaving paint order to DOM order.
              //   • pointer-events-auto because an open Radix modal sets
              //     `pointer-events: none` on <body>, which this panel would
              //     otherwise inherit — rendering a fully visible option list that
              //     silently swallows every click.
              "bg-popover border-input pointer-events-auto z-[60] flex flex-col overflow-hidden rounded-xl border shadow-lg",
              // Phones: a bottom sheet that leaves the top of the screen visible, so
              // the field being edited stays in context. These insets are
              // unprefixed, so they win below `sm`.
              "fixed inset-x-2 bottom-2 top-24",
              // sm and up: the measured anchor takes over. Written as `var()`
              // arbitrary values rather than inline style so the phone insets above
              // aren't overridden by a style attribute at every width.
              "sm:inset-x-auto sm:bottom-auto sm:top-[var(--cb-top)] sm:left-[var(--cb-left)]",
              "sm:w-[var(--cb-width)] sm:max-h-[var(--cb-max-h)]",
            )}
            style={
              anchor
                ? ({
                    "--cb-top": `${anchor.top}px`,
                    "--cb-left": `${anchor.left}px`,
                    "--cb-width": `${anchor.width}px`,
                    "--cb-max-h": `${anchor.maxHeight}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <div className="bg-popover relative shrink-0 border-b p-2">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                aria-controls={listId}
                aria-activedescendant={activeId}
                className="pl-8"
              />
            </div>

            <ul ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
              {filtered.flatMap((option, i) => {
                // Headings are SIBLINGS of the option rows, not nested inside the
                // first one — a sticky element only sticks within its containing
                // block, so a header inside its option's <li> would unstick after
                // a single row. At list level it holds until the next header
                // pushes it out, which is the behaviour a 32-option B.Sc list needs.
                const group = option.group ?? null;
                const newGroup = showGroups && group && group !== (filtered[i - 1]?.group ?? null);
                const on = option.value === value;
                const isActive = i === active;
                return [
                  newGroup ? (
                    <li
                      key={`g-${group}`}
                      role="presentation"
                      className="bg-popover text-muted-foreground sticky top-0 z-10 px-3 pt-2 pb-1 text-[0.7rem] font-bold tracking-[0.06em] uppercase"
                    >
                      {group}
                    </li>
                  ) : null,
                  <li key={option.value} ref={isActive ? activeRef : undefined}>
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${option.value}`}
                      aria-selected={on}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(option)}
                      // ≥44px rows: thumb-sized on a phone (min-h-11 = 2.75rem).
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm sm:min-h-9",
                        isActive && "bg-accent",
                      )}
                    >
                      <Check className={cn("size-4 shrink-0", on ? "opacity-100" : "opacity-0")} aria-hidden />
                      <span className="min-w-0 flex-1">{option.label}</span>
                    </button>
                  </li>,
                ];
              })}
              {filtered.length === 0 && (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">{emptyHint}</li>
              )}
            </ul>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
