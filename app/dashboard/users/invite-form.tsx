"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createInvite, type InviteState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type College = { id: string; name: string; place: string | null; state?: string | null };
type Employer = { id: string; name: string };

const ROLES = [
  { key: "student", label: "Student" },
  { key: "college_admin", label: "College Admin" },
  { key: "employer", label: "Employer" },
  { key: "support", label: "Support Team" },
];

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

export function InviteForm({ employers }: { employers: Employer[] }) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(createInvite, {});
  const [role, setRole] = useState("");

  const needsCollege = role === "student" || role === "college_admin";
  const needsEmployer = role === "employer";

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="person@example.com" required />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          className={selectClass}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
        >
          <option value="" disabled>Select a role…</option>
          {ROLES.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </div>

      {needsCollege && <CollegePicker />}

      {needsEmployer && (
        <div className="grid gap-1.5">
          <Label htmlFor="employer_id">Employer</Label>
          <select id="employer_id" name="employer_id" className={selectClass} required>
            <option value="" disabled selected>Select an employer…</option>
            {employers.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-end gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending invite…" : "Send invite"}
        </Button>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-green-600">{state.message}</p>}
      </div>
    </form>
  );
}

/** Typeahead for picking a college (the table has ~10k rows). Submits the
 * chosen college's id via a hidden `college_id` input. */
function CollegePicker() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [chosen, setChosen] = useState<College | null>(null);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (chosen || query.trim().length < 2) {
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
  }, [query, chosen]);

  return (
    <div className="relative grid gap-1.5">
      <Label htmlFor="college_search">College</Label>
      <input type="hidden" name="college_id" value={chosen?.id ?? ""} required />
      <Input
        id="college_search"
        autoComplete="off"
        placeholder="Search colleges…"
        value={chosen ? `${chosen.name}${chosen.place ? ` — ${chosen.place}` : ""}` : query}
        onChange={(e) => {
          setChosen(null);
          setQuery(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && !chosen && results.length > 0 && (
        <ul className="border-input bg-background absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="hover:bg-muted w-full px-3 py-2 text-left"
                onClick={() => {
                  setChosen(c);
                  setOpen(false);
                }}
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
