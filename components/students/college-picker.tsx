"use client";

/**
 * Typeahead college picker (shared by the Excel import flow and the single
 * "+ Student" dialog). Searches /api/colleges/search; once a college is picked
 * it shows the full details with a "Change" action rather than truncating the
 * long name into the input.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type College = { id: string; name: string; place: string | null; state?: string | null };

export function CollegePicker({
  college,
  onPick,
}: {
  college: College | null;
  onPick: (c: College | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (college || query.trim().length < 2) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query)}`);
      if (res.ok) { setResults((await res.json()).results); setOpen(true); }
    }, 250);
  }, [query, college]);

  if (college) {
    const location = [college.place, college.state].filter(Boolean).join(", ");
    return (
      <div className="grid gap-1.5">
        <Label>College</Label>
        <div className="border-input bg-muted/30 flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <p className="font-medium break-words">{college.name}</p>
            {location && (
              <p className="text-muted-foreground mt-0.5 text-sm break-words">{location}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => { onPick(null); setQuery(""); setResults([]); setOpen(false); }}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid gap-1.5">
      <Label>College</Label>
      <Input
        autoComplete="off"
        placeholder="Search colleges…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="border-input bg-background absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="hover:bg-muted w-full px-3 py-2 text-left"
                onClick={() => { onPick(c); setOpen(false); }}
              >
                {c.name}
                {c.place ? <span className="text-muted-foreground"> — {c.place}{c.state ? `, ${c.state}` : ""}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
