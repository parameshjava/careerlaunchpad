"use client";

// College selector for the insights dashboard. Owner / platform admins search
// the ~10k-row college table (reusing /api/colleges/search) and picking one
// navigates to ?college=<id>, which re-renders the server page with that
// college's analytics. Once selected, we show the college's FULL details in a
// panel (like the import page) instead of cramming the long name into the
// search box. A College Admin is locked to their own college (no search, no
// Change) — preview-requirements rule 2/3.
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Search results carry only the light columns; a selected college (from the
// server) carries the full record for the details panel.
type College = {
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
  onChange,
  onClear,
}: {
  college: College;
  onChange?: () => void;
  onClear?: () => void;
}) {
  const location = [college.place, college.district, college.state].filter(Boolean).join(", ");
  return (
    <div className="grid gap-1.5">
      <Label>College</Label>
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
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <Detail label="District" value={college.district} />
          <Detail label="State" value={college.state} />
          <Detail label="PIN" value={college.pincode} />
          <Detail
            label="Ownership"
            value={college.ownership_type ? titleCase(college.ownership_type) : null}
          />
          <Detail label="Established" value={college.established_in} />
          <Detail label="Status" value={college.status ? titleCase(college.status) : null} />
          {college.address && (
            <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
              <dt className="text-muted-foreground text-xs">Address</dt>
              <dd className="text-sm break-words">{college.address}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function CollegePicker({
  selected,
  disabled = false,
}: {
  selected: College | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const { results } = await res.json();
        setResults(results);
        setOpen(true);
      }
    }, 250);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function choose(c: College) {
    setOpen(false);
    setEditing(false);
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("college", c.id);
    router.push(`?${params.toString()}`);
  }

  // Clear the selection → drop the ?college param and reset the page to the
  // empty (search) state.
  function clear() {
    setOpen(false);
    setEditing(false);
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("college");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Locked (College Admin) or selected-and-not-editing → show the details panel.
  if (selected && (disabled || !editing)) {
    return (
      <CollegeDetails
        college={selected}
        onChange={disabled ? undefined : () => setEditing(true)}
        onClear={disabled ? undefined : clear}
      />
    );
  }

  return (
    <div ref={boxRef} className="relative grid w-full max-w-md gap-1.5">
      <Label htmlFor="college_picker">College</Label>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          id="college_picker"
          autoComplete="off"
          className="pr-8 pl-8"
          placeholder="Search colleges…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
        />
        <ChevronsUpDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
      </div>
      {selected && (
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
      {open && results.length > 0 && (
        <ul className="border-input bg-popover absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left"
                onClick={() => choose(c)}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    selected?.id === c.id ? "opacity-100" : "opacity-0",
                  )}
                />
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
      )}
    </div>
  );
}
