"use client";

// Staff Feedback tab on /dashboard/batches/[id] (issue #84).
//
// This is the only surface in the feature that shows who said what. The chapter
// table summarises; expanding a chapter loads the identified rows, INCLUDING the
// students who didn't respond — non-response is half the signal, and the frozen
// eligible_count is what makes that list possible.
//
// Two rules the UI must not soften:
//   • Contact is offered ONLY where the student ticked the opt-in. Without it there
//     is no contactable path, which is what keeps the promise on the form true.
//   • Nothing is hidden for a low response count (O-2). A single response gets the
//     same triage panel as fourteen, and the trip flags fire on one.
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageSquarePlus,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  ATTENDED_LABELS,
  TRIP_LABELS,
  tallyAttended,
  type IdentifiedResponse,
  type StaffFeedbackRow,
} from "@/lib/feedback-query";
import {
  AttendanceMix,
  GroupScores,
  LowConfidenceBadge,
  ReactionVsLearning,
  TRIP_TONE,
} from "@/components/feedback/score-bars";

export function BatchFeedback({
  batchId,
  onCreateAction,
}: {
  batchId: string;
  /** Opens the Actions tab with this chapter's source pre-filled (§V10). */
  onCreateAction?: (seed: {
    requestId: string;
    subjectId: string;
    chapterId: string;
    chapterName: string | null;
    dimensionKey?: string;
  }) => void;
}) {
  const [rows, setRows] = useState<StaffFeedbackRow[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, IdentifiedResponse[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/batches/${batchId}/feedback`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setRows(d.chapters ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const expand = useCallback(
    async (requestId: string) => {
      if (open === requestId) {
        setOpen(null);
        return;
      }
      setOpen(requestId);
      if (detail[requestId]) return;
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/admin/feedback/requests/${requestId}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setDetail((prev) => ({ ...prev, [requestId]: json.responses ?? [] }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingDetail(false);
      }
    },
    [open, detail],
  );

  // Both response-level writes go through here: same endpoint, same optimistic
  // patch of the expanded list, so a failure can never leave the row showing a state
  // the database rejected.
  const patchResponse = useCallback(
    async (
      responseId: string,
      requestId: string,
      body: Record<string, unknown>,
      applied: Partial<IdentifiedResponse>,
    ) => {
      try {
        const res = await fetch(`/api/admin/feedback/responses/${responseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Could not update");
        setDetail((prev) => ({
          ...prev,
          [requestId]: (prev[requestId] ?? []).map((r) =>
            r.responseId === responseId ? { ...r, ...applied } : r,
          ),
        }));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [],
  );

  if (error && !rows)
    return (
      <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
        {error}
      </p>
    );
  if (rows === null)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  if (rows.length === 0)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
        No feedback windows yet. One opens automatically whenever a chapter is marked completed.
      </p>
    );

  const totalResponses = rows.reduce((n, r) => n + r.responseCount, 0);
  const totalEligible = rows.reduce((n, r) => n + r.eligibleCount, 0);
  const needAttention = rows.filter((r) => r.trips.length > 0).length;

  return (
    <div className="grid gap-4">
      {error && (
        <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Response rate" v={totalEligible > 0 ? `${Math.round((100 * totalResponses) / totalEligible)}%` : "—"} n={`${totalResponses} of ${totalEligible} asked`} />
        <Stat k="Needs attention" v={String(needAttention)} n="chapters tripped a rule" tone={needAttention > 0 ? "bad" : undefined} />
        <Stat k="Windows" v={String(rows.length)} n={`${rows.filter((r) => r.isOpen).length} still open`} />
        <Stat k="Remarks" v={String(rows.reduce((n, r) => n + r.remarkCount, 0))} n="to read and answer" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-[10px] font-bold tracking-wider uppercase">
                  <th className="py-2 pr-3 text-left">Chapter</th>
                  <th className="py-2 pr-3 text-right">Responded</th>
                  <th className="py-2 pr-3 text-right">Teaching</th>
                  <th className="py-2 pr-3 text-right">Content</th>
                  <th className="py-2 pr-3 text-right">Logistics</th>
                  <th className="py-2 pr-3 text-right">Quiz pass</th>
                  <th className="py-2 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.requestId}
                    className="hover:bg-muted/40 cursor-pointer border-b last:border-0"
                    onClick={() => expand(r.requestId)}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-start gap-1.5">
                        {open === r.requestId ? (
                          <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                        ) : (
                          <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="font-medium break-words">{r.chapterName ?? "—"}</span>
                          <span className="text-muted-foreground block text-xs">{r.subjectName}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.responseCount} / {r.eligibleCount}
                      <span className="text-muted-foreground block text-xs">
                        {r.responsePct != null ? `${r.responsePct}%` : "—"}
                      </span>
                    </td>
                    <Pct s={r.groupScores?.teaching?.pct ?? null} />
                    <Pct s={r.groupScores?.content?.pct ?? null} />
                    <Pct s={r.groupScores?.logistics?.pct ?? null} />
                    <Pct s={r.quizPassPct} />
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.isOpen && <Badge variant="secondary">Open</Badge>}
                        {r.trips.map((t) => (
                          <Badge key={t} variant="secondary" className={TRIP_TONE[t]}>
                            {TRIP_LABELS[t]}
                          </Badge>
                        ))}
                        {!r.isOpen && r.trips.length === 0 && r.responseCount > 0 && (
                          <Badge variant="secondary">Healthy</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {open && (
        <ChapterDetail
          row={rows.find((r) => r.requestId === open)!}
          responses={detail[open]}
          loading={loadingDetail}
          onModerate={(rid, m) => patchResponse(rid, open, { moderation: m }, { moderation: m })}
          onLogOutreach={(rid, note) =>
            patchResponse(
              rid,
              open,
              { contacted: true, outreach_note: note },
              // The server stamps the real time; this is close enough to show now and
              // is replaced by the server's value on the next expand.
              { contactedAt: new Date().toISOString(), outreachNote: note || null },
            )
          }
          onClearOutreach={(rid) =>
            patchResponse(
              rid,
              open,
              { contacted: false },
              { contactedAt: null, contactedByName: null, outreachNote: null },
            )
          }
          onCreateAction={onCreateAction}
        />
      )}
    </div>
  );
}

/** Log what came of contacting a student about their feedback (#84 V9, migration
 *  167). The note is the point: "spoken to" with no substance tells the next person
 *  nothing, and the pain point behind a 2-star rating is exactly what #84 asks staff
 *  to go and find out. */
function OutreachEditor({
  responseId,
  contactedAt,
  note,
  onSave,
  onClear,
}: {
  responseId: string;
  contactedAt: string | null;
  note: string | null;
  onSave: (note: string) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");

  if (!editing)
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <MessageSquarePlus className="size-3.5" />
          {contactedAt ? "Edit follow-up" : "Log follow-up"}
        </Button>
        {contactedAt && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Undo
          </Button>
        )}
      </div>
    );

  return (
    <div className="grid w-full gap-2">
      <Textarea
        id={`outreach-${responseId}`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What they said, and what you agreed to do about it"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(text.trim());
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Pct({ s }: { s: number | null }) {
  const tone =
    s == null ? "text-muted-foreground" : s < 50 ? "font-semibold text-rose-600 dark:text-rose-400" : s < 70 ? "font-semibold text-amber-700 dark:text-amber-400" : "";
  return <td className={`py-2.5 pr-3 text-right tabular-nums ${tone}`}>{s != null ? `${s}%` : "—"}</td>;
}

function Stat({ k, v, n, tone }: { k: string; v: string; n: string; tone?: "bad" }) {
  return (
    <div className="bg-card grid gap-0.5 rounded-lg border p-3">
      <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">{k}</span>
      <span className={`text-xl font-bold tabular-nums ${tone === "bad" ? "text-rose-600 dark:text-rose-400" : ""}`}>
        {v}
      </span>
      <span className="text-muted-foreground text-xs">{n}</span>
    </div>
  );
}

function ChapterDetail({
  row,
  responses,
  loading,
  onModerate,
  onLogOutreach,
  onClearOutreach,
  onCreateAction,
}: {
  row: StaffFeedbackRow;
  responses: IdentifiedResponse[] | undefined;
  loading: boolean;
  onModerate: (responseId: string, moderation: "ok" | "hidden") => void;
  onLogOutreach: (responseId: string, note: string) => void;
  onClearOutreach: (responseId: string) => void;
  onCreateAction?: (seed: {
    requestId: string;
    subjectId: string;
    chapterId: string;
    chapterName: string | null;
    dimensionKey?: string;
  }) => void;
}) {
  const ready = row.itemScores?.confidence ?? null;
  const answered = (responses ?? []).filter((r) => r.responseId);
  const silent = (responses ?? []).filter((r) => !r.responseId);

  return (
    <Card className={row.trips.length > 0 ? "border-l-4 border-l-rose-500" : undefined}>
      <CardContent className="grid gap-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-semibold break-words">{row.chapterName ?? "—"}</h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {row.subjectName} · opened {formatDate(row.openedAt)} ·{" "}
              {row.isOpen ? `closes ${formatDate(row.closesAt)}` : `closed ${formatDate(row.closesAt)}`}
              {row.mentorSnapshot.length > 0 && ` · taught by ${row.mentorSnapshot.join(", ")}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {/* Suppressed at zero: a window whose whole class is age-ineligible has
                eligible_count 0, and "Low confidence · 0 of 0 responded" describes a
                collection problem rather than the eligibility one it actually is. */}
            {row.lowConfidence && row.responseCount > 0 && (
              <LowConfidenceBadge n={row.responseCount} eligible={row.eligibleCount} />
            )}
            {onCreateAction && (
              <Button
                size="sm"
                onClick={() =>
                  onCreateAction({
                    requestId: row.requestId,
                    subjectId: row.subjectId,
                    chapterId: row.chapterId,
                    chapterName: row.chapterName,
                    dimensionKey: row.trips.includes("low_rating") ? "clarity" : undefined,
                  })
                }
              >
                <Plus className="size-4" /> Create action
              </Button>
            )}
          </div>
        </div>

        {row.responseCount > 0 && (
          <>
            <ReactionVsLearning
              readyPct={ready?.pct ?? null}
              readyTop2={ready?.top2}
              readyRated={ready?.rated}
              passPct={row.quizPassPct}
              attempted={row.quizAttempted}
              eligible={row.eligibleCount}
            />
            <GroupScores scores={row.groupScores} />
            {/* Tallied from the rows below rather than fetched (§G1): the same data
                the panel is already showing, so the two cannot disagree. Absent
                until the responses load. */}
            <AttendanceMix mix={tallyAttended(answered)} />
          </>
        )}

        {row.mentorNote && (
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs">Trainer&apos;s context</p>
            <p className="border-l-primary rounded-md border border-l-2 bg-primary/5 px-3 py-2 text-sm break-words">
              {row.mentorNote}
            </p>
          </div>
        )}

        {loading && !responses ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading responses…
          </p>
        ) : (
          <>
            {answered.length > 0 && (
              <div className="grid gap-2">
                <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                  Responses ({answered.length})
                </p>
                {answered.map((r) => (
                  <div key={r.responseId} className="bg-muted/30 grid gap-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 text-sm font-medium break-words">
                        {r.studentName ?? "—"}
                        {r.rollNumber && (
                          <span className="text-muted-foreground font-normal"> · {r.rollNumber}</span>
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.attended && (
                          <Badge variant="secondary">
                            Attended {ATTENDED_LABELS[r.attended] ?? r.attended}
                          </Badge>
                        )}
                        {r.qualityFlag && <Badge variant="secondary">{r.qualityFlag}</Badge>}
                        {r.contactOk ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Opted in to contact</Badge>
                        ) : (
                          <Badge variant="secondary">Not contactable</Badge>
                        )}
                      </div>
                    </div>

                    {r.answers && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(r.answers)
                          .filter(([, a]) => a.rating != null)
                          .map(([k, a]) => (
                            <span
                              key={k}
                              className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                                (a.rating ?? 5) <= 2
                                  ? "border-rose-300 bg-rose-50 font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {k} {a.rating}
                            </span>
                          ))}
                      </div>
                    )}

                    {r.remark && (
                      <p
                        className={`rounded-md border border-l-2 px-3 py-2 text-sm break-words ${
                          r.moderation === "hidden"
                            ? "border-l-muted-foreground/40 bg-muted/50 text-muted-foreground line-through"
                            : "border-l-primary bg-card"
                        }`}
                      >
                        {r.remark}
                      </p>
                    )}

                    {/* What came of the follow-up. Shown before the buttons because
                        once a conversation has happened, that is the freshest fact
                        about this response — and it stops a second cold email. */}
                    {r.contactedAt && (
                      <p className="rounded-md border border-l-2 border-l-emerald-600 bg-emerald-50/60 px-3 py-2 text-xs break-words dark:bg-emerald-950/30">
                        <span className="font-medium">
                          Spoken to {formatDate(r.contactedAt)}
                          {r.contactedByName ? ` by ${r.contactedByName}` : ""}
                        </span>
                        {r.outreachNote && <span className="block">{r.outreachNote}</span>}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {r.submittedAt ? formatDateTime(r.submittedAt) : ""}
                      </span>
                      {r.contactOk && r.studentEmail && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={`mailto:${r.studentEmail}`}>
                            <Mail className="size-3.5" /> Contact
                          </a>
                        </Button>
                      )}
                      {/* Logging is offered only where the student opted in — the RPC
                          refuses otherwise, so an ever-present button would just be a
                          button that fails. */}
                      {r.contactOk && r.responseId && (
                        <OutreachEditor
                          responseId={r.responseId}
                          contactedAt={r.contactedAt}
                          note={r.outreachNote}
                          onSave={(note) => onLogOutreach(r.responseId!, note)}
                          onClear={() => onClearOutreach(r.responseId!)}
                        />
                      )}
                      {r.remark && r.responseId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onModerate(r.responseId!, r.moderation === "hidden" ? "ok" : "hidden")}
                        >
                          {r.moderation === "hidden" ? (
                            <>
                              <Eye className="size-3.5" /> Show to trainer
                            </>
                          ) : (
                            <>
                              <EyeOff className="size-3.5" /> Hide from trainer
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Non-response is data. Naming who stayed silent is what turns a low
                response rate into something a coordinator can act on. */}
            {silent.length > 0 && (
              <details className="rounded-lg border">
                <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-sm">
                  {silent.length} student{silent.length === 1 ? "" : "s"} didn&apos;t respond
                </summary>
                <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                  {silent.map((s) => (
                    <Badge key={s.studentId} variant="secondary">
                      {s.studentName ?? s.studentEmail ?? "—"}
                    </Badge>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
