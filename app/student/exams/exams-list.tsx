"use client";

// Student "My exams" grid. Polls list_my_exam_sessions() every 5s so the Open
// button appears the moment the window opens (1 min before opens_at) without a
// manual reload. Rendered via the shared DataTable — sortable, searchable, and
// filterable by status; defaults to newest-scheduled first.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable } from "@/components/data-table";
import {
  examColumns,
  EXAM_STATUSES,
  type ExamRow,
  type ExamStatus,
  type ExamAction,
  type Session,
} from "./exam-columns";

const GRACE_MS = 60_000; // fetch from opens_at-1min; submit until closes_at+1min
const POLL_MS = 5_000;

// Derive the single status + primary action for a session, given the clock.
function decorate(s: Session, now: number): ExamRow {
  const done = s.roster_status === "submitted";
  const opens = s.opens_at ? new Date(s.opens_at).getTime() : null;
  const closes = s.closes_at ? new Date(s.closes_at).getTime() : null;
  const beforeWindow = opens == null || now < opens - GRACE_MS;
  const afterWindow = closes != null && now > closes + GRACE_MS;

  let statusLabel: ExamStatus;
  let action: ExamAction = null;
  if (done) {
    if (s.results_published) {
      statusLabel = "Result ready";
      action = "result";
    } else {
      statusLabel = "Submitted";
    }
  } else if (afterWindow) {
    statusLabel = "Closed";
  } else if (opens != null && !beforeWindow) {
    statusLabel = "Open";
    action = s.roster_status === "started" ? "resume" : "open";
  } else {
    // Scheduled: students may enter the waiting room early (the attempt page
    // polls and the server releases questions at opens-1min).
    statusLabel = "Scheduled";
    if (opens != null) action = "open";
  }
  return { ...s, statusLabel, action };
}

export function ExamsList() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data, error: rpcErr } = await supabase.rpc("list_my_exam_sessions");
      if (cancelled) return;
      if (rpcErr) {
        // Keep showing the last good list on transient poll failures.
        setSessions((prev) => {
          if (prev == null) setError(rpcErr.message);
          return prev;
        });
        return;
      }
      setError("");
      setSessions((data ?? []) as Session[]);
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Recompute status/action each render (poll drives re-render, so the clock is
  // fresh enough); Date.now() is fine here (client component, not SSR).
  const rows = useMemo<ExamRow[]>(
    () => (sessions ?? []).map((s) => decorate(s, Date.now())),
    [sessions],
  );

  if (error) return <p className="text-destructive px-1 text-sm">{error}</p>;
  if (sessions == null)
    return <p className="text-muted-foreground px-1 text-sm">Loading exams…</p>;
  if (sessions.length === 0)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No exams assigned yet.
      </p>
    );

  return (
    <DataTable
      columns={examColumns}
      data={rows}
      searchKey="exam_title"
      searchPlaceholder="Search exams…"
      filters={[
        {
          columnId: "statusLabel",
          title: "Status",
          options: EXAM_STATUSES.map((s) => ({ label: s, value: s })),
        },
      ]}
      // Newest scheduled exam first (undated rows sort last).
      initialSorting={[{ id: "opens_at", desc: true }]}
    />
  );
}
