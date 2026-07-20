"use client";

// Student "My exams", split into Upcoming and Past tabs. Polls
// list_my_exam_sessions() every 5s so the Open button appears the moment the
// window opens (1 min before opens_at) without a manual reload. Each tab is the
// shared DataTable — sortable, searchable, status-filterable. Past exams show the
// student's score.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  upcomingColumns,
  pastColumns,
  UPCOMING_STATUSES,
  PAST_STATUSES,
  type ExamRow,
  type Session,
} from "./exam-columns";
import { decorate, isUpcoming } from "./exam-status";

const POLL_MS = 5_000;

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
  const upcoming = useMemo(() => rows.filter(isUpcoming), [rows]);
  const past = useMemo(() => rows.filter((r) => !isUpcoming(r)), [rows]);

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
    <Tabs defaultValue="upcoming" className="gap-4">
      <TabsList>
        <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
        <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming" className="min-w-0">
        <DataTable
          columns={upcomingColumns}
          data={upcoming}
          searchKey="exam_title"
          searchPlaceholder="Search exams…"
          filters={[
            {
              columnId: "statusLabel",
              title: "Status",
              options: UPCOMING_STATUSES.map((s) => ({ label: s, value: s })),
            },
          ]}
          // Soonest exam first — the next one to take.
          initialSorting={[{ id: "opens_at", desc: false }]}
        />
      </TabsContent>

      <TabsContent value="past" className="min-w-0">
        <DataTable
          columns={pastColumns}
          data={past}
          searchKey="exam_title"
          searchPlaceholder="Search exams…"
          filters={[
            {
              columnId: "statusLabel",
              title: "Status",
              options: PAST_STATUSES.map((s) => ({ label: s, value: s })),
            },
          ]}
          // Most recent first.
          initialSorting={[{ id: "opens_at", desc: true }]}
        />
      </TabsContent>
    </Tabs>
  );
}
