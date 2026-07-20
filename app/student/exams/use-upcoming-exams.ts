"use client";

// Ambient poll of the student's exam sessions, reduced to the ones that still
// need attention (Open now or Scheduled). Backs the sidebar count badge and the
// home banner so a newly-scheduled exam surfaces platform-wide without the
// student having to open the My Exams page. Polls slower than the exams list
// itself (that page is for actively waiting) — this is a background indicator.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ExamRow, Session } from "./exam-columns";
import { decorate, isUpcoming } from "./exam-status";

const POLL_MS = 30_000;

export function useUpcomingExams(): { upcoming: ExamRow[]; loading: boolean } {
  const [upcoming, setUpcoming] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("list_my_exam_sessions");
      if (cancelled || error) {
        if (!cancelled) setLoading(false);
        return;
      }
      const rows = ((data ?? []) as Session[])
        .map((s) => decorate(s, Date.now()))
        .filter(isUpcoming)
        // Soonest first — the nearest exam is what the student acts on next.
        .sort((a, b) => {
          const at = a.opens_at ? new Date(a.opens_at).getTime() : Infinity;
          const bt = b.opens_at ? new Date(b.opens_at).getTime() : Infinity;
          return at - bt;
        });
      setUpcoming(rows);
      setLoading(false);
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return { upcoming, loading };
}
