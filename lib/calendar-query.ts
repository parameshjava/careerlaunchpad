// Typed reads for the class calendar (issue #64). Sessions are RLS-scoped: a
// student sees their enrolled batches' sessions; staff read a batch's sessions.
// Subject/mentor names come from the denormalised columns on batch_subject /
// batch_subject_mentor (readable to authenticated) so neither surface needs the
// RLS-locked subject/mentor tables. Mirrors lib/batch-query.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionStatus = "scheduled" | "live" | "completed" | "cancelled";

export type CalendarSession = {
  id: string;
  batchId: string;
  batchName: string | null;
  subjectId: string;
  subjectName: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  deliveryMode: string;
  status: SessionStatus;
  joinUrl: string | null;
  meetingStatus: string;
  mentors: string[];
};

const WINDOW_MAX_DAYS = 62;

/** Validate a [from,to) window; caps the span so a query can't scan forever. */
export function parseWindow(
  from: string | null,
  to: string | null
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (!from || !to) return { ok: false, error: "from and to are required." };
  const f = Date.parse(from);
  const t = Date.parse(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return { ok: false, error: "from/to must be ISO date-times." };
  if (t <= f) return { ok: false, error: "to must be after from." };
  if (t - f > WINDOW_MAX_DAYS * 86_400_000)
    return { ok: false, error: `Window too large (max ${WINDOW_MAX_DAYS} days).` };
  return { ok: true, from: new Date(f).toISOString(), to: new Date(t).toISOString() };
}

type SessionRow = {
  id: string;
  batch_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  delivery_mode: string;
  status: SessionStatus;
  join_url: string | null;
  meeting_status: string;
  batch: { name: string | null } | { name: string | null }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Sessions in [from,to) visible to the current user (RLS decides which). Joins
 * subject + mentor names from batch_subject(_mentor). */
export async function fetchCalendarSessions(
  supabase: SupabaseClient,
  window: { from: string; to: string },
  filter?: { batchId?: string }
): Promise<CalendarSession[]> {
  let q = supabase
    .from("batch_session")
    .select(
      "id, batch_id, subject_id, title, description, starts_at, ends_at, delivery_mode, status, join_url, meeting_status, batch:batch_id(name)"
    )
    .gte("starts_at", window.from)
    .lt("starts_at", window.to)
    .neq("status", "cancelled")
    .order("starts_at");
  if (filter?.batchId) q = q.eq("batch_id", filter.batchId);

  const { data, error } = await q;
  if (error) throw new Error(`batch_session: ${error.message}`);
  const rows = (data ?? []) as unknown as SessionRow[];
  if (rows.length === 0) return [];

  // Resolve subject + mentor names for the (batch,subject) pairs in the result.
  const batchIds = [...new Set(rows.map((r) => r.batch_id))];
  const [subjects, mentors] = await Promise.all([
    supabase.from("batch_subject").select("batch_id, subject_id, subject_name").in("batch_id", batchIds),
    supabase.from("batch_subject_mentor").select("batch_id, subject_id, mentor_name").in("batch_id", batchIds),
  ]);

  const subjectName = new Map<string, string | null>();
  for (const s of (subjects.data ?? []) as { batch_id: string; subject_id: string; subject_name: string | null }[])
    subjectName.set(`${s.batch_id}:${s.subject_id}`, s.subject_name);

  const mentorNames = new Map<string, string[]>();
  for (const m of (mentors.data ?? []) as { batch_id: string; subject_id: string; mentor_name: string | null }[]) {
    if (!m.mentor_name) continue;
    const k = `${m.batch_id}:${m.subject_id}`;
    mentorNames.set(k, [...(mentorNames.get(k) ?? []), m.mentor_name]);
  }

  return rows.map((r) => {
    const key = `${r.batch_id}:${r.subject_id}`;
    return {
      id: r.id,
      batchId: r.batch_id,
      batchName: one<{ name: string | null }>(r.batch)?.name ?? null,
      subjectId: r.subject_id,
      subjectName: subjectName.get(key) ?? null,
      title: r.title,
      description: r.description,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      deliveryMode: r.delivery_mode,
      status: r.status,
      joinUrl: r.join_url,
      meetingStatus: r.meeting_status,
      mentors: mentorNames.get(key) ?? [],
    };
  });
}
