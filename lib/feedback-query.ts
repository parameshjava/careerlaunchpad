// Shared types + shaping for chapter feedback (issue #84, migration 159).
// Spec: docs/CHAPTER_FEEDBACK_ANALYSIS.md
//
// Every read here comes from a SECURITY DEFINER RPC, so authorization is the
// database's job and these helpers only rename snake_case → camelCase for the UI.
// The three read shapes are deliberately different objects, matching the three
// RPCs: a student sees a form, a mentor sees aggregates, staff see identity. There
// is no single "feedback" type that could accidentally carry a name into the
// mentor's screen.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Fewer than this many responses ⇒ label it, never hide it (owner decision, O-2). */
export const LOW_CONFIDENCE_BELOW = 5;

export type ItemGroup = "teaching" | "content" | "logistics" | "screening";

export const GROUP_LABELS: Record<ItemGroup, string> = {
  teaching: "Teaching",
  content: "Content & material",
  logistics: "Logistics",
  screening: "Attendance",
};

/** How much of the chapter a respondent says they attended (screening item). */
export const ATTENDED_LABELS: Record<string, string> = {
  none: "None",
  some: "Some",
  most: "Most",
  all: "All",
};

export type FormItem = {
  itemId: string;
  key: string;
  prompt: string;
  /** 1-2 words for the compact one-row-per-question layout. `prompt` stays the
   *  accessible name, so nothing is lost to a screen reader. */
  shortLabel?: string | null;
  group: ItemGroup;
  type: "rating5" | "choice";
  choices: string[] | null;
  required: boolean;
  allowNa: boolean;
};

/** One open request as the student sees it — the form, plus their own answers if
 *  they already submitted and are still inside the 24h edit window. */
export type PendingFeedback = {
  requestId: string;
  batchId: string;
  batchName: string | null;
  subjectId: string;
  subjectName: string | null;
  chapterId: string;
  chapterName: string | null;
  closesAt: string;
  submittedAt: string | null;
  editableUntil: string | null;
  items: FormItem[];
  answers: Record<string, { rating: number | null; choice: string | null }>;
  remark: string | null;
  contactOk: boolean;
};

/** Top-2-box for one group or one item. `pct` is null until someone has rated it —
 *  the raw counts travel with it so a percentage is never shown bare (§G9). */
export type Score = {
  top2: number;
  rated: number;
  pct: number | null;
  mean: number | null;
  prompt?: string;
  group?: ItemGroup;
  dist?: Record<string, number>;
};

/** The mentor's view of one chapter. No identity, no timestamps, no ordering. */
export type MentorFeedback = {
  requestId: string;
  batchId: string;
  batchName: string | null;
  subjectId: string;
  subjectName: string | null;
  chapterId: string;
  chapterName: string | null;
  openedAt: string;
  closesAt: string;
  isOpen: boolean;
  eligibleCount: number;
  responseCount: number;
  lowConfidence: boolean;
  groupScores: Record<string, Score> | null;
  itemScores: Record<string, Score> | null;
  remarks: string[] | null;
  quizAttempted: number;
  quizPassPct: number | null;
  mentorNote: string | null;
  /** How much of the chapter the respondents say they attended (§G1, migration 169).
   *  Counts per bucket, never percentages — four buckets over a handful of responses
   *  cannot carry a percentage honestly. Null while the window is open, like the
   *  scores. Staff surfaces compute their own from the per-response rows. */
  attendedMix: AttendedMix | null;
};

export type AttendedMix = { all: number; most: number; some: number; none: number };

/** Why a chapter is on the triage list (§4.8 trip rule). n-independent by design. */
export type Trip = "low_rating" | "low_mean" | "has_remark" | "low_turnout";

export const TRIP_LABELS: Record<Trip, string> = {
  low_rating: "Rating of 1–2",
  low_mean: "Item below 3.0",
  has_remark: "Remark to answer",
  low_turnout: "Low turnout",
};

export type StaffFeedbackRow = MentorFeedback & {
  responsePct: number | null;
  remarkCount: number;
  flaggedCount: number;
  trips: Trip[];
  mentorSnapshot: string[];
};

/** One tripped request on the cross-batch triage inbox (migration 165). Same row as
 *  the batch tab plus the two things only a cross-batch screen needs: which batch it
 *  belongs to, and whether someone is already on it. */
export type TriageRow = StaffFeedbackRow & {
  /** Open or in-progress action items against this request, proposals included. */
  openActionCount: number;
  /** …of which a human has actually taken on: typed by staff, owned, or moved to
   *  in_progress. An untouched auto-proposal counts here as zero, so "the system
   *  noticed" never reads as "someone is dealing with it" (migration 166). */
  openClaimedCount: number;
};

export type IdentifiedResponse = {
  responseId: string | null;
  studentId: string;
  studentName: string | null;
  rollNumber: string | null;
  studentEmail: string | null;
  submittedAt: string | null;
  answers: Record<string, { rating: number | null; choice: string | null; group: ItemGroup; prompt: string }> | null;
  remark: string | null;
  contactOk: boolean;
  qualityFlag: string | null;
  moderation: string;
  attended: string | null;
  /** The staff outreach log (migration 167) — set once someone has actually spoken
   *  to this student. Only ever populated for `contactOk` rows, and never returned
   *  to a mentor or to the student. */
  contactedAt: string | null;
  contactedByName: string | null;
  outreachNote: string | null;
};

export type ActionItem = {
  id: string;
  batchId: string;
  subjectId: string | null;
  chapterId: string | null;
  requestId: string | null;
  dimensionKey: string | null;
  title: string;
  detail: string | null;
  ownerUserId: string | null;
  priority: "low" | "normal" | "high";
  dueOn: string | null;
  status: "open" | "in_progress" | "done" | "dropped";
  resolutionNote: string | null;
  publishedToStudents: boolean;
  /** Non-null ⇒ the system proposed this from a trip rule; nobody has committed to
   *  it yet (migration 166). Staff items are always null here. */
  autoSource: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Only populated on cross-batch reads (the triage inbox, the student's "what
   *  changed" card). A batch-scoped caller already knows which batch it asked for,
   *  so paying for the extra name lookup there would be waste. */
  batchName?: string | null;
};

type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function toPending(r: Row): PendingFeedback {
  return {
    requestId: r.request_id as string,
    batchId: r.batch_id as string,
    batchName: str(r.batch_name),
    subjectId: r.subject_id as string,
    subjectName: str(r.subject_name),
    chapterId: r.chapter_id as string,
    chapterName: str(r.chapter_name),
    closesAt: r.closes_at as string,
    submittedAt: str(r.submitted_at),
    editableUntil: str(r.editable_until),
    items: ((r.items as FormItem[] | null) ?? []).map((i) => ({ ...i })),
    answers: (r.answers as PendingFeedback["answers"] | null) ?? {},
    remark: str(r.remark),
    contactOk: r.contact_ok === true,
  };
}

export function toMentorFeedback(r: Row): MentorFeedback {
  return {
    requestId: r.request_id as string,
    batchId: r.batch_id as string,
    batchName: str(r.batch_name),
    subjectId: r.subject_id as string,
    subjectName: str(r.subject_name),
    chapterId: r.chapter_id as string,
    chapterName: str(r.chapter_name),
    openedAt: r.opened_at as string,
    closesAt: r.closes_at as string,
    isOpen: r.is_open === true,
    eligibleCount: num(r.eligible_count),
    responseCount: num(r.response_count),
    lowConfidence: r.low_confidence === true,
    groupScores: (r.group_scores as Record<string, Score> | null) ?? null,
    itemScores: (r.item_scores as Record<string, Score> | null) ?? null,
    remarks: (r.remarks as string[] | null) ?? null,
    quizAttempted: num(r.quiz_attempted),
    quizPassPct: numOrNull(r.quiz_pass_pct),
    mentorNote: str(r.mentor_note),
    attendedMix: toAttendedMix(r.attended_mix),
  };
}

/** Normalizes the RPC's jsonb (and the staff-side client tally) into four numbers. */
export function toAttendedMix(v: unknown): AttendedMix | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  return { all: num(m.all), most: num(m.most), some: num(m.some), none: num(m.none) };
}

/** Tally the screener from identified rows — the staff panel already has them, so
 *  its mix comes from the same data the rows show rather than a second query. */
export function tallyAttended(rows: { attended: string | null }[]): AttendedMix | null {
  const mix: AttendedMix = { all: 0, most: 0, some: 0, none: 0 };
  let any = false;
  for (const r of rows) {
    if (r.attended && r.attended in mix) {
      mix[r.attended as keyof AttendedMix] += 1;
      any = true;
    }
  }
  return any ? mix : null;
}

export function toStaffRow(r: Row): StaffFeedbackRow {
  return {
    ...toMentorFeedback({ ...r, batch_name: null }),
    responsePct: numOrNull(r.response_pct),
    remarkCount: num(r.remark_count),
    flaggedCount: num(r.flagged_count),
    trips: ((r.trips as string[] | null) ?? []) as Trip[],
    mentorSnapshot: (r.mentor_snapshot as string[] | null) ?? [],
  };
}

/** feedback_triage_overview() rows. Unlike toStaffRow this KEEPS batch_name — the
 *  batch tab already knows which batch it is showing; the inbox does not. */
export function toTriageRow(r: Row): TriageRow {
  return {
    ...toStaffRow(r),
    batchName: str(r.batch_name),
    openActionCount: num(r.open_action_count),
    openClaimedCount: num(r.open_claimed_count),
  };
}

export function toIdentified(r: Row): IdentifiedResponse {
  return {
    responseId: str(r.response_id),
    studentId: r.student_id as string,
    studentName: str(r.student_name),
    rollNumber: str(r.roll_number),
    studentEmail: str(r.student_email),
    submittedAt: str(r.submitted_at),
    answers: (r.answers as IdentifiedResponse["answers"] | null) ?? null,
    contactOk: r.contact_ok === true,
    remark: str(r.remark),
    qualityFlag: str(r.quality_flag),
    moderation: (str(r.moderation) ?? "ok") as string,
    attended: str(r.attended),
    contactedAt: str(r.contacted_at),
    contactedByName: str(r.contacted_by_name),
    outreachNote: str(r.outreach_note),
  };
}

export function toActionItem(r: Row): ActionItem {
  return {
    id: r.id as string,
    batchId: r.batch_id as string,
    subjectId: str(r.subject_id),
    chapterId: str(r.chapter_id),
    requestId: str(r.request_id),
    dimensionKey: str(r.dimension_key),
    title: r.title as string,
    detail: str(r.detail),
    ownerUserId: str(r.owner_user_id),
    priority: (str(r.priority) ?? "normal") as ActionItem["priority"],
    dueOn: str(r.due_on),
    status: (str(r.status) ?? "open") as ActionItem["status"],
    resolutionNote: str(r.resolution_note),
    publishedToStudents: r.published_to_students === true,
    autoSource: str(r.auto_source),
    createdAt: r.created_at as string,
    completedAt: str(r.completed_at),
  };
}

/** Attach batch names to action items read across batches. Split out of
 *  fetchPublishedActions so the staff triage inbox and the student card resolve
 *  names the same way: one extra query over `batch` (readable by any authenticated
 *  user), never a join that would need a new grant. */
export async function withBatchNames<T extends { batchId: string }>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<(T & { batchName: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.batchId))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("batch").select("id, name").in("id", ids);
    for (const b of (data ?? []) as { id: string; name: string }[]) names.set(b.id, b.name);
  }
  return rows.map((r) => ({ ...r, batchName: names.get(r.batchId) ?? null }));
}

/** Action items published to the calling student, for the "what changed" card.
 *  Read directly under the student RLS policy — no RPC needed, because the policy
 *  (published_to_students AND enrolled) is the whole authorization rule.
 *
 *  `batchId` narrows to one batch for the batch-scoped surfaces. It must be applied
 *  HERE rather than by filtering the result, because `limit` would otherwise be spent
 *  on other batches' actions first — a student with six published actions in one batch
 *  would see an empty "what changed" on every other batch.
 *
 *  Batch names come along because a student enrolled in two batches cannot tell which
 *  course an action belongs to from its title alone. */
export async function fetchPublishedActions(
  supabase: SupabaseClient,
  limit = 6,
  batchId?: string | null,
): Promise<(ActionItem & { batchName: string | null })[]> {
  let q = supabase
    .from("feedback_action_item")
    .select(
      "id, batch_id, subject_id, chapter_id, request_id, dimension_key, title, detail, owner_user_id, priority, due_on, status, resolution_note, published_to_students, auto_source, created_at, completed_at",
    )
    .eq("published_to_students", true);
  if (batchId) q = q.eq("batch_id", batchId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`feedback_action_item: ${error.message}`);

  return withBatchNames(supabase, (data ?? []).map(toActionItem));
}
