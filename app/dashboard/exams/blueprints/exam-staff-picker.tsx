"use client";

// Assign evaluators (employers / mentors / staff) to an exam. Add/remove are
// saved immediately (their own endpoints) — independent of the blueprint's "Save
// changes" — so the list always reflects what's persisted. Search is debounced
// against /api/exam/staff/search; results render inline (never clipped by the card).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type Staff = { user_id: string; email: string };
type Candidate = { user_id: string; email: string; roles: string[] };

export function ExamStaffPicker({ examId }: { examId: string }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const loadStaff = useCallback(async () => {
    const res = await fetch(`/api/exam/blueprints/${examId}/staff`);
    const data = await res.json();
    if (res.ok) setStaff(data.staff ?? []);
    else setError(data.error ?? "Failed to load staff");
  }, [examId]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/exam/staff/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        setResults((await res.json()).candidates ?? []);
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

  async function add(c: Candidate) {
    setError("");
    setOpen(false);
    setQuery("");
    const res = await fetch(`/api/exam/blueprints/${examId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: c.user_id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error ?? "Could not add staff");
    }
    loadStaff();
  }

  async function remove(userId: string) {
    setError("");
    const res = await fetch(`/api/exam/blueprints/${examId}/staff?user_id=${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error ?? "Could not remove staff");
    }
    loadStaff();
  }

  const assignedIds = new Set(staff.map((s) => s.user_id));

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <div>
          <h2 className="text-sm font-semibold">Exam staff / evaluators</h2>
          <p className="text-muted-foreground text-xs">
            Assigned staff can view this exam&apos;s blueprint, answer key and all results, and
            enter/adjust marks. Added or removed staff are saved immediately.
          </p>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {staff.length > 0 && (
          <ul className="grid gap-2">
            {staff.map((s) => (
              <li
                key={s.user_id}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <span className="min-w-0 truncate">{s.email}</span>
                <Button variant="ghost" size="sm" onClick={() => remove(s.user_id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div ref={boxRef} className="grid max-w-md gap-1.5">
          <Label htmlFor="staff-search">Add staff</Label>
          <Input
            id="staff-search"
            autoComplete="off"
            placeholder="Search by email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
          />
          {open && results.length > 0 && (
            <ul className="border-input bg-background mt-1 max-h-64 w-full overflow-auto rounded-md border text-sm shadow-sm">
              {results.map((c) => {
                const already = assignedIds.has(c.user_id);
                return (
                  <li key={c.user_id}>
                    <button
                      type="button"
                      disabled={already}
                      className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left disabled:opacity-50"
                      onClick={() => add(c)}
                    >
                      <span className="min-w-0 truncate">{c.email}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {already ? "added" : c.roles.join(", ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
