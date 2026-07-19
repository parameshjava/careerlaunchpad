"use client";

// Student "My exams" list. Polls list_my_exam_sessions() every 5s so the
// Open button appears the moment the window opens (1 min before opens_at)
// without a manual reload.
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const GRACE_MS = 60_000; // fetch from opens_at-1min; submit until closes_at+1min
const POLL_MS = 5_000;

type Section = { subject: string; num_questions: number; marks_per_question: number };
type Session = {
  session_id: string;
  label: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  results_published: boolean;
  roster_status: "invited" | "started" | "submitted";
  exam_title: string;
  duration_minutes: number;
  negative_mark_per_wrong: number;
  total_questions: number;
  total_marks: number;
  sections: Section[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

  if (error) return <p className="text-destructive px-1 text-sm">{error}</p>;
  if (sessions == null)
    return <p className="text-muted-foreground px-1 text-sm">Loading exams…</p>;
  if (sessions.length === 0)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No exams assigned yet.
      </p>
    );

  const now = Date.now();
  return (
    <ul className="grid gap-2">
      {sessions.map((s) => {
        const done = s.roster_status === "submitted";
        const opens = s.opens_at ? new Date(s.opens_at).getTime() : null;
        const closes = s.closes_at ? new Date(s.closes_at).getTime() : null;
        const beforeWindow = opens == null || now < opens - GRACE_MS;
        const afterWindow = closes != null && now > closes + GRACE_MS;
        // Students may enter the waiting room any time before the window; the
        // attempt page polls and the server releases questions at opens-1min.
        const canOpen = !done && !afterWindow && opens != null;

        return (
          <li key={s.session_id}>
            <Card size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                {/* Left: title + a single wrapping meta line + section chips */}
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate font-semibold">{s.exam_title}</span>
                    {s.label !== s.exam_title && (
                      <span className="text-muted-foreground truncate text-xs">{s.label}</span>
                    )}
                  </div>

                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    {s.opens_at && (
                      <span className="text-foreground font-medium">
                        {fmtDate(s.opens_at)} · {fmtTime(s.opens_at)}
                        {s.closes_at ? `–${fmtTime(s.closes_at)}` : ""}
                      </span>
                    )}
                    <span>⏱ {s.duration_minutes} min</span>
                    <span>{s.total_questions} questions</span>
                    <span>{s.total_marks} marks</span>
                    {Number(s.negative_mark_per_wrong) > 0 && (
                      <span>−{s.negative_mark_per_wrong}/wrong</span>
                    )}
                  </div>

                  {s.sections.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.sections.map((sec, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="px-1.5 py-0 text-[11px] font-normal"
                        >
                          {sec.subject}: {sec.num_questions} × {sec.marks_per_question}m
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: the one relevant action / status, stacked */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {canOpen && (
                    <Button size="sm" asChild>
                      <Link href={`/student/exams/${s.session_id}`}>
                        {s.roster_status === "started" ? "Resume" : "Open exam"}
                      </Link>
                    </Button>
                  )}
                  {done && s.results_published && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/student/exams/${s.session_id}/result`}>View result</Link>
                    </Button>
                  )}
                  {done && !s.results_published && <Badge variant="secondary">Submitted</Badge>}
                  {!done && beforeWindow && <Badge variant="outline">Scheduled</Badge>}
                  {!done && afterWindow && <Badge variant="outline">Closed</Badge>}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
