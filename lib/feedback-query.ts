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
};

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
  createdAt: string;
  completedAt: string | null;
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
  };
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
    createdAt: r.created_at as string,
    completedAt: str(r.completed_at),
  };
}

/** Action items published to the calling student, for the "what changed" card.
 *  Read directly under the student RLS policy — no RPC needed, because the policy
 *  (published_to_students AND enrolled) is the whole authorization rule.
 *
 *  Batch names come along because a student enrolled in two batches cannot tell
 *  which course an action belongs to from its title alone. `batch` is readable by
 *  any authenticated user, so this is one extra cheap round trip, not a new grant.
 *
 *  `batchId` narrows to one batch for the batch-scoped surfaces. It must be applied
 *  HERE rather than by filtering the result, because `limit` would otherwise be spent
 *  on other batches' actions first — a student with six published actions in one batch
 *  would see an empty "what changed" on every other batch. */
export async function fetchPublishedActions(
  supabase: SupabaseClient,
  limit = 6,
  batchId?: string | null,
): Promise<(ActionItem & { batchName: string | null })[]> {
  let q = supabase
    .from("feedback_action_item")
    .select(
      "id, batch_id, subject_id, chapter_id, request_id, dimension_key, title, detail, owner_user_id, priority, due_on, status, resolution_note, published_to_students, created_at, completed_at",
    )
    .eq("published_to_students", true);
  if (batchId) q = q.eq("batch_id", batchId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`feedback_action_item: ${error.message}`);

  const actions = (data ?? []).map(toActionItem);
  const batchIds = [...new Set(actions.map((a) => a.batchId))];
  const names = new Map<string, string>();
  if (batchIds.length > 0) {
    const { data: batches } = await supabase.from("batch").select("id, name").in("id", batchIds);
    for (const b of (batches ?? []) as { id: string; name: string }[]) names.set(b.id, b.name);
  }
  return actions.map((a) => ({ ...a, batchName: names.get(a.batchId) ?? null }));
}
