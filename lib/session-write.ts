// Validates the class-scheduling payloads (issue #64) for the staff session
// routes, before Zoom/DB writes. Mirrors lib/batch-write.ts. A payload is either
// a one-off class (startsAt/endsAt) or a recurring series (recurrence).

export type DeliveryMode = "online" | "offline" | "hybrid";

export type Recurrence = {
  byWeekday: number[]; // 0=Sun … 6=Sat
  timeOfDay: string; // "HH:MM"
  durationMin: number;
  timezone: string;
  startsOn: string; // "YYYY-MM-DD"
  until: string | null; // "YYYY-MM-DD" | null
};

export type SessionPayload = {
  subjectId: string;
  title: string;
  description: string | null;
  deliveryMode: DeliveryMode;
  createZoomMeeting: boolean;
  meetingUrl: string | null;
  // exactly one of these is set
  oneOff: { startsAt: string; endsAt: string } | null;
  recurrence: Recurrence | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES: DeliveryMode[] = ["online", "offline", "hybrid"];

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type Ok = { ok: true; value: SessionPayload };
type Err = { ok: false; error: string };

export function parseSessionPayload(body: unknown, opts?: { partial?: boolean }): Ok | Err {
  const b = (body ?? {}) as Record<string, unknown>;

  const subjectId = str(b.subjectId) ?? "";
  if (!UUID_RE.test(subjectId)) return { ok: false, error: "Pick a subject for this class." };

  const title = str(b.title);
  if (!title) return { ok: false, error: "A class title is required." };
  if (title.length > 160) return { ok: false, error: "Title is too long (160 characters max)." };

  const deliveryMode = (str(b.deliveryMode) ?? "online") as DeliveryMode;
  if (!MODES.includes(deliveryMode))
    return { ok: false, error: "Delivery mode must be online, offline, or hybrid." };

  const meetingUrl = str(b.meetingUrl);
  if (meetingUrl && !/^https:\/\//i.test(meetingUrl))
    return { ok: false, error: "A meeting link must start with https://." };

  const hasRecurrence = b.recurrence != null && typeof b.recurrence === "object";
  const hasOneOff = str(b.startsAt) != null || str(b.endsAt) != null;
  if (hasRecurrence && hasOneOff)
    return { ok: false, error: "A class is either one-off or recurring, not both." };
  if (!hasRecurrence && !hasOneOff && !opts?.partial)
    return { ok: false, error: "Set a date/time or a weekly repeat." };

  let oneOff: SessionPayload["oneOff"] = null;
  let recurrence: SessionPayload["recurrence"] = null;

  if (hasOneOff) {
    const startsAt = str(b.startsAt);
    const endsAt = str(b.endsAt);
    if (!startsAt || !endsAt) return { ok: false, error: "Both start and end time are required." };
    const s = Date.parse(startsAt);
    const e = Date.parse(endsAt);
    if (Number.isNaN(s) || Number.isNaN(e))
      return { ok: false, error: "Start/end must be valid date-times." };
    if (e <= s) return { ok: false, error: "The class must end after it starts." };
    if (e - s > 600 * 60_000) return { ok: false, error: "A class can be at most 10 hours." };
    oneOff = { startsAt, endsAt };
  }

  if (hasRecurrence) {
    const r = b.recurrence as Record<string, unknown>;
    const byWeekday = Array.isArray(r.byWeekday)
      ? r.byWeekday.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    if (byWeekday.length === 0)
      return { ok: false, error: "Pick at least one weekday for the repeat." };
    const timeOfDay = str(r.timeOfDay) ?? "";
    if (!TIME_RE.test(timeOfDay)) return { ok: false, error: "Enter a valid class time (HH:MM)." };
    const durationMin = Number(r.durationMin);
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 600)
      return { ok: false, error: "Duration must be between 1 and 600 minutes." };
    const startsOn = str(r.startsOn) ?? "";
    if (!DATE_RE.test(startsOn)) return { ok: false, error: "Pick a start date for the repeat." };
    const until = str(r.until);
    if (until && !DATE_RE.test(until)) return { ok: false, error: "The end date is invalid." };
    if (until && until < startsOn)
      return { ok: false, error: "The repeat's end date can't be before its start." };
    recurrence = {
      byWeekday: [...new Set(byWeekday)].sort(),
      timeOfDay,
      durationMin,
      timezone: str(r.timezone) ?? "Asia/Kolkata",
      startsOn,
      until: until ?? null,
    };
  }

  return {
    ok: true,
    value: {
      subjectId,
      title,
      description: str(b.description),
      deliveryMode,
      createZoomMeeting: b.createZoomMeeting !== false && deliveryMode !== "offline",
      meetingUrl,
      oneOff,
      recurrence,
    },
  };
}
