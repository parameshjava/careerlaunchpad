// Server-only Zoom client (issue #64). Server-to-Server OAuth: exchanges the
// account credentials for a short-lived token, then creates/updates/deletes
// scheduled meetings. Mentors of the class subject are added as alternative
// hosts so they can start the class.
//
// Env (Vercel preview + prod, NEVER NEXT_PUBLIC_):
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
//
// Never import this from a client component. Callers treat ZoomNotConfigured /
// thrown errors as non-fatal: the class still saves with meeting_status='failed'
// or 'manual' so scheduling is never blocked by a Zoom outage.

// Guard against accidental browser bundling (matches lib/supabase/admin.ts;
// the repo doesn't vendor the `server-only` package).
if (typeof window !== "undefined") {
  throw new Error("lib/zoom must never run in the browser");
}

const ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

export class ZoomNotConfiguredError extends Error {
  constructor() {
    super("Zoom is not configured (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET).");
    this.name = "ZoomNotConfiguredError";
  }
}

export function zoomConfigured(): boolean {
  return Boolean(ACCOUNT_ID && CLIENT_ID && CLIENT_SECRET);
}

export type ZoomMeeting = { meetingId: string; joinUrl: string; startUrl: string };

export type CreateMeetingInput = {
  topic: string;
  agenda?: string | null;
  start: Date;
  durationMin: number;
  timezone: string;
  /** Alternative-host emails (subject mentors). */
  altHostEmails?: string[];
  /** Present ⇒ a weekly recurring meeting. */
  recurrence?: { byWeekday: number[]; until?: Date | null } | null;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (!zoomConfigured()) throw new ZoomNotConfiguredError();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.token;

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ACCOUNT_ID}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } }
  );
  if (!res.ok) throw new Error(`Zoom auth failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

// Zoom weekly_days uses 1=Sunday … 7=Saturday; Postgres dow is 0=Sun … 6=Sat.
function zoomWeeklyDays(byWeekday: number[]): string {
  return byWeekday.map((d) => d + 1).join(",");
}

function recurrencePayload(rec: NonNullable<CreateMeetingInput["recurrence"]>) {
  return {
    type: 2, // weekly
    repeat_interval: 1,
    weekly_days: zoomWeeklyDays(rec.byWeekday),
    ...(rec.until ? { end_date_time: rec.until.toISOString() } : { end_times: 12 }),
  };
}

function meetingSettings(altHostEmails?: string[]) {
  return {
    join_before_host: false,
    waiting_room: true,
    ...(altHostEmails && altHostEmails.length
      ? { alternative_hosts: altHostEmails.join(";"), alternative_hosts_email_notification: true }
      : {}),
  };
}

export async function createMeeting(input: CreateMeetingInput): Promise<ZoomMeeting> {
  const token = await getToken();
  const body = {
    topic: input.topic,
    type: input.recurrence ? 8 : 2, // 8 = recurring with fixed time, 2 = scheduled
    start_time: input.start.toISOString(),
    duration: input.durationMin,
    timezone: input.timezone,
    agenda: input.agenda ?? undefined,
    ...(input.recurrence ? { recurrence: recurrencePayload(input.recurrence) } : {}),
    settings: meetingSettings(input.altHostEmails),
  };
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Zoom create failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { id: number; join_url: string; start_url: string };
  return { meetingId: String(json.id), joinUrl: json.join_url, startUrl: json.start_url };
}

export type UpdateMeetingInput = {
  topic?: string;
  agenda?: string | null;
  start?: Date;
  durationMin?: number;
  timezone?: string;
  altHostEmails?: string[];
};

export async function updateMeeting(meetingId: string, patch: UpdateMeetingInput): Promise<void> {
  const token = await getToken();
  const body = {
    ...(patch.topic ? { topic: patch.topic } : {}),
    ...(patch.agenda !== undefined ? { agenda: patch.agenda ?? "" } : {}),
    ...(patch.start ? { start_time: patch.start.toISOString() } : {}),
    ...(patch.durationMin ? { duration: patch.durationMin } : {}),
    ...(patch.timezone ? { timezone: patch.timezone } : {}),
    ...(patch.altHostEmails ? { settings: meetingSettings(patch.altHostEmails) } : {}),
  };
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 204 = updated. 404 = already gone — treat as success (idempotent).
  if (!res.ok && res.status !== 404)
    throw new Error(`Zoom update failed (${res.status}): ${await res.text()}`);
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404)
    throw new Error(`Zoom delete failed (${res.status}): ${await res.text()}`);
}
