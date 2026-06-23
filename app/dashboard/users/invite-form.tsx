"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
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
  { key: "platform_admin", label: "CareerLaunchpad Admin" },
  { key: "support", label: "Support Team" },
];

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteForm({ employers }: { employers: Employer[] }) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(createInvite, {});
  // All field values live here so we can tell when the form is complete and only
  // then reveal the submit button (which required fields apply depends on role).
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [college, setCollege] = useState<College | null>(null);
  const [employerId, setEmployerId] = useState("");

  const needsCollege = role === "student" || role === "college_admin";
  const needsEmployer = role === "employer";

  const complete =
    EMAIL_RE.test(email.trim()) &&
    role !== "" &&
    (!needsCollege || college !== null) &&
    (!needsEmployer || employerId !== "");

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="person@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
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

      {needsCollege && <CollegePicker value={college} onPick={setCollege} />}

      {needsEmployer && (
        <div className="grid gap-1.5">
          <Label htmlFor="employer_id">Employer</Label>
          <select
            id="employer_id"
            name="employer_id"
            className={selectClass}
            value={employerId}
            onChange={(e) => setEmployerId(e.target.value)}
            required
          >
            <option value="" disabled>Select an employer…</option>
            {employers.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        {complete ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Sending invite…" : "Send invite"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">Enter all fields to send the invite.</p>
        )}
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-green-600">{state.message}</p>}
      </div>
    </form>
  );
}

/** Typeahead for picking a college (the table has ~10k rows). Controlled by the
 * parent so it can tell when a college has been chosen; submits the chosen id
 * via a hidden `college_id` input. */
function CollegePicker({
  value,
  onPick,
}: {
  value: College | null;
  onPick: (c: College | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value || query.trim().length < 2) {
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
  }, [query, value]);

  return (
    <div className="relative grid gap-1.5">
      <Label htmlFor="college_search">College</Label>
      <input type="hidden" name="college_id" value={value?.id ?? ""} required />
      <Input
        id="college_search"
        autoComplete="off"
        placeholder="Search colleges…"
        value={value ? `${value.name}${value.place ? ` — ${value.place}` : ""}` : query}
        onChange={(e) => {
          onPick(null);
          setQuery(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && !value && results.length > 0 && (
        <ul className="border-input bg-background absolute top-full z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border text-sm shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="hover:bg-muted w-full px-3 py-2 text-left"
                onClick={() => {
                  onPick(c);
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
