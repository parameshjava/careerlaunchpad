"use client";

// The trainer's feedback board on /mentor (issue #84).
//
// ANONYMITY IS THE POINT OF THIS SCREEN
//   Nothing here identifies a student, and it cannot: the endpoint behind it
//   (mentor_chapter_feedback) returns aggregates and remark text only, with remarks
//   in random order and no timestamps. There is no drill-down, no per-response list
//   and no student column to add later — identity lives in a different function that
//   requires a permission mentors do not hold.
//
// Two deliberate choices worth keeping:
//   • Results appear once the window CLOSES. While it is open the trainer sees the
//     response count (so they can chase participation) but no score — a live score
//     invites watching the number instead of teaching.
//   • A single response is shown in FULL, labelled "Low confidence". Standard
//     practice hides results below ~5; the owner's call is that one student's
//     feedback still needs addressing (O-2).
import { useEffect, useState } from "react";
import { Clock, Loader2, MessageSquareQuote, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format-date";
import type { MentorFeedback } from "@/lib/feedback-query";
import {
  AttendanceMix,
  GroupScores,
  LowConfidenceBadge,
  ReactionVsLearning,
  ResponseBadge,
} from "@/components/feedback/score-bars";
import { ChapterTrend } from "@/components/feedback/chapter-trend";

export function MentorFeedbackBoard() {
  const [chapters, setChapters] = useState<MentorFeedback[] | null>(null);
  const [error, setError] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mentor/feedback")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setChapters(d.chapters ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveNote(requestId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/mentor/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, note: noteText }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save the note");
      setChapters((prev) =>
        (prev ?? []).map((c) =>
          c.requestId === requestId ? { ...c, mentorNote: noteText.trim() || null } : c,
        ),
      );
      setNoteFor(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error)
    return (
      <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
        {error}
      </p>
    );
  if (chapters === null)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  if (chapters.length === 0)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-8 text-center text-sm">
        No feedback yet. Students are asked to rate a chapter once you mark it completed, and the
        results appear here when the window closes.
      </p>
    );

  return (
    <div className="grid gap-4">
      <div className="text-muted-foreground flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
        <MessageSquareQuote className="text-primary mt-0.5 size-4 shrink-0" />
        <span>
          Names are never shown here, and remarks appear in random order without times. This is for
          improving your teaching — it is not used in any review.
        </span>
      </div>

      {/* Trend before the cards: "am I getting better at this?" is the question a
          trainer opens this screen with, and it is answerable only across chapters. */}
      <ChapterTrend chapters={chapters} />

      {chapters.map((c) => {
        const ready = c.itemScores?.confidence ?? null;
        const editing = noteFor === c.requestId;
        return (
          <Card key={c.requestId}>
            <CardContent className="grid gap-4 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-semibold break-words">{c.chapterName ?? "—"}</h4>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {[c.batchName, c.subjectName].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.isOpen ? (
                    <Badge variant="secondary">
                      <Clock className="mr-1 size-3" /> Open till {formatDate(c.closesAt)}
                    </Badge>
                  ) : c.lowConfidence ? (
                    <LowConfidenceBadge n={c.responseCount} eligible={c.eligibleCount} />
                  ) : (
                    <ResponseBadge n={c.responseCount} eligible={c.eligibleCount} />
                  )}
                </div>
              </div>

              {c.isOpen ? (
                <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-4 text-sm">
                  {c.responseCount} of {c.eligibleCount} students have responded so far. Results
                  appear here once the window closes on {formatDate(c.closesAt)}.
                </p>
              ) : c.responseCount === 0 ? (
                <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-4 text-sm">
                  Nobody responded before the window closed. A quiet chapter isn&apos;t a good
                  chapter — it&apos;s an unmeasured one.
                </p>
              ) : (
                <>
                  {c.lowConfidence && (
                    <p className="text-muted-foreground text-xs">
                      {c.responseCount === 1
                        ? "One student responded. It is shown in full rather than held back for a bigger sample — read it as one voice, not as the batch."
                        : `${c.responseCount} students responded. Read these as individual voices rather than as the batch.`}
                    </p>
                  )}
                  <ReactionVsLearning
                    readyPct={ready?.pct ?? null}
                    readyTop2={ready?.top2}
                    readyRated={ready?.rated}
                    passPct={c.quizPassPct}
                    attempted={c.quizAttempted}
                    eligible={c.eligibleCount}
                  />
                  <GroupScores scores={c.groupScores} />
                  {/* Who was in the room, next to what they scored (§G1). */}
                  <AttendanceMix mix={c.attendedMix} />

                  {c.remarks && c.remarks.length > 0 && (
                    <div className="grid gap-2">
                      <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                        In their words ({c.remarks.length})
                      </p>
                      {c.remarks.map((r, i) => (
                        <p
                          key={i}
                          className="bg-muted/40 border-l-muted-foreground/40 rounded-md border border-l-2 px-3 py-2 text-sm break-words"
                        >
                          {r}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Right of reply (§G7): context, so the numbers are read against what
                  actually happened in the room. */}
              {editing ? (
                <div className="grid gap-2">
                  <Textarea
                    value={noteText}
                    rows={2}
                    maxLength={1000}
                    placeholder="e.g. two classes were lost to holidays"
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveNote(c.requestId)} disabled={saving}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : "Save note"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNoteFor(null)} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : c.mentorNote ? (
                <div className="grid gap-1">
                  <p className="text-muted-foreground text-xs">Your context</p>
                  <p className="border-l-primary rounded-md border border-l-2 bg-primary/5 px-3 py-2 text-sm break-words">
                    {c.mentorNote}
                  </p>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
                    onClick={() => {
                      setNoteFor(c.requestId);
                      setNoteText(c.mentorNote ?? "");
                    }}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => {
                    setNoteFor(c.requestId);
                    setNoteText("");
                  }}
                >
                  <PencilLine className="size-4" /> Add context
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
