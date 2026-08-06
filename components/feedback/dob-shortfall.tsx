"use client";

// "These students can't be asked for feedback yet" (issue #84 O-11).
//
// WHY IT SITS ON THE TRIAGE PAGE
//   The age gate fails closed: a student with no date of birth is skipped, and is not
//   in eligible_count either — so their absence is invisible in every response rate on
//   the screen below. That is correct arithmetic and a terrible surprise, which is why
//   the count is shown here, next to the numbers it silently shapes.
//
// Date of birth is required at registration now, so this shrinks to zero as the
// existing cohort re-submits. When it IS zero the card renders nothing at all —
// permanent scaffolding for a temporary migration is its own kind of clutter.
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type MissingStudent = {
  studentId: string;
  fullName: string | null;
  email: string | null;
  /** Already has an unresolved note from the last 14 days — don't nudge again. */
  askedRecently: boolean;
};

export function DobShortfall({ canAsk }: { canAsk: boolean }) {
  const [students, setStudents] = useState<MissingStudent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/students/request-dob")
      .then((r) => r.json())
      .then((d) => {
        // A 403 here is not worth surfacing: the card is supplementary, and the
        // coordinator reading it may simply not hold student.review.
        if (!d.error) setStudents(d.students ?? []);
        else setStudents([]);
      })
      .catch(() => setStudents([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function ask() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/students/request-dob", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not send the request");
      setResult(
        [
          `Asked ${json.asked}`,
          json.skipped ? `${json.skipped} already asked in the last 14 days` : null,
          json.failed ? `${json.failed} failed` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (students === null || students.length === 0) return null;

  const pending = students.filter((s) => !s.askedRecently).length;

  return (
    <Card className="mb-4 border-l-4 border-l-amber-500">
      <CardContent className="grid gap-2 pt-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
          {students.length} enrolled student{students.length === 1 ? "" : "s"} can&apos;t be asked
          for feedback
        </h3>
        <p className="text-muted-foreground text-sm">
          They have no date of birth on file. Feedback is only collected from students aged 18 and
          over, so they are skipped — and they are left out of the response rates below rather than
          counted as silent. Date of birth is required for new registrations, so this list only
          covers students who registered earlier.
        </p>
        {canAsk && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={ask} disabled={busy || pending === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
              {pending === 0
                ? "All of them have been asked"
                : `Ask ${pending} student${pending === 1 ? "" : "s"} to add it`}
            </Button>
            {result && <span className="text-muted-foreground text-xs">{result}</span>}
          </div>
        )}
        {error && (
          <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
            {error}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Sends each of them a profile note and an email — the same channel used for registration
          corrections. It does not change their access, and nobody is asked twice within 14 days.
        </p>
      </CardContent>
    </Card>
  );
}
