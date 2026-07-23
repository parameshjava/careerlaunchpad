// Orchestrates scheduling a class (issue #64): create the Zoom meeting, persist
// the one-off session or recurring series, and invite the subject's mentors
// (Zoom alternative host + .ics email). Server-only — imports lib/zoom. Zoom and
// email failures are non-fatal: the class always saves, with meeting_status
// flagging what needs attention. Used by the staff POST /sessions route.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionPayload } from "@/lib/session-write";
import { buildClassIcs, weeklyRrule, type IcsMethod } from "@/lib/ics";
import { sendClassInviteEmail } from "@/lib/mailer";
import * as zoom from "@/lib/zoom";

const ORGANIZER = {
  name: process.env.MAIL_FROM_NAME ?? "CareerLaunchpad",
  email: process.env.MAIL_FROM_ADDRESS ?? process.env.SMTP_USER ?? "noreply@careerlaunchpad.ai",
};

type MentorContact = { mentor_id: string; full_name: string | null; email: string };

export type ScheduleResult = {
  seriesId: string | null;
  sessionIds: string[];
  invitedMentorIds: string[];
  meetingWarning: string | null;
};

/** Wall-clock time in a timezone → the correct UTC instant (offset trick; works
 * for fixed-offset zones like Asia/Kolkata and DST zones alike). */
function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const asTz = new Date(naive.toLocaleString("en-US", { timeZone: tz }));
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(naive.getTime() - (asTz.getTime() - asUtc.getTime()));
}

/** First date on/after startsOn whose weekday is in byWeekday (0=Sun…6=Sat). */
function firstOccurrenceDate(startsOn: string, byWeekday: number[]): string {
  const base = new Date(`${startsOn}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    if (byWeekday.includes(d.getUTCDay())) return d.toISOString().slice(0, 10);
  }
  return startsOn;
}

/** Local calendar date (YYYY-MM-DD) of an instant in a timezone. */
function localDate(iso: string, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Add n days to a YYYY-MM-DD string (via UTC-noon to dodge DST edges). */
function addDaysStr(d: string, n: number): string {
  return new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

function whenLabel(start: Date, end: Date, tz: string): string {
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: tz, weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(start);
  const t = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date}, ${t(start)}–${t(end)}`;
}

export async function createClassSchedule(
  supabase: SupabaseClient,
  args: { batchId: string; batchName: string; subjectName: string; payload: SessionPayload; userId: string }
): Promise<ScheduleResult> {
  const { batchId, batchName, subjectName, payload, userId } = args;

  // 1) Mentors of this (batch, subject).
  const { data: mentorData } = await supabase.rpc("batch_subject_mentor_contacts", {
    p_batch_id: batchId,
    p_subject_id: payload.subjectId,
  });
  const mentors = (mentorData ?? []) as MentorContact[];
  const altHostEmails = mentors.map((m) => m.email).filter(Boolean);

  // 2) Timing.
  const tz = payload.recurrence?.timezone ?? "Asia/Kolkata";
  let start: Date;
  let end: Date;
  if (payload.recurrence) {
    const firstDate = firstOccurrenceDate(payload.recurrence.startsOn, payload.recurrence.byWeekday);
    start = zonedToUtc(firstDate, payload.recurrence.timeOfDay, tz);
    end = new Date(start.getTime() + payload.recurrence.durationMin * 60_000);
  } else {
    start = new Date(payload.oneOff!.startsAt);
    end = new Date(payload.oneOff!.endsAt);
  }
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);

  // 3) Zoom meeting (best-effort).
  let zoomMeetingId: string | null = null;
  let joinUrl: string | null = payload.meetingUrl;
  let startUrl: string | null = null;
  let meetingStatus: "pending" | "created" | "failed" | "manual" | "not_required";
  let meetingWarning: string | null = null;

  if (payload.deliveryMode === "offline") {
    meetingStatus = "not_required";
  } else if (payload.createZoomMeeting) {
    if (!zoom.zoomConfigured()) {
      meetingStatus = payload.meetingUrl ? "manual" : "failed";
      meetingWarning = "Zoom isn't configured — no meeting was created.";
    } else {
      try {
        const m = await zoom.createMeeting({
          topic: `${subjectName}: ${payload.title}`,
          agenda: payload.description,
          start,
          durationMin,
          timezone: tz,
          altHostEmails,
          recurrence: payload.recurrence
            ? { byWeekday: payload.recurrence.byWeekday, until: payload.recurrence.until ? new Date(`${payload.recurrence.until}T23:59:59Z`) : null }
            : null,
        });
        zoomMeetingId = m.meetingId;
        joinUrl = m.joinUrl;
        startUrl = m.startUrl;
        meetingStatus = "created";
      } catch (e) {
        meetingStatus = payload.meetingUrl ? "manual" : "failed";
        meetingWarning = `Zoom meeting couldn't be created: ${(e as Error).message}`;
      }
    }
  } else {
    meetingStatus = payload.meetingUrl ? "manual" : "pending";
  }

  // 4) Persist.
  let seriesId: string | null = null;
  let sessionIds: string[] = [];

  if (payload.recurrence) {
    const { data: series, error } = await supabase
      .from("batch_session_series")
      .insert({
        batch_id: batchId,
        subject_id: payload.subjectId,
        title: payload.title,
        description: payload.description,
        delivery_mode: payload.deliveryMode,
        by_weekday: payload.recurrence.byWeekday,
        time_of_day: payload.recurrence.timeOfDay,
        duration_min: payload.recurrence.durationMin,
        timezone: tz,
        starts_on: payload.recurrence.startsOn,
        until: payload.recurrence.until,
        zoom_meeting_id: zoomMeetingId,
        join_url: joinUrl,
        start_url: startUrl,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    seriesId = series.id;

    await supabase.rpc("expand_batch_session_series", { p_series_id: seriesId });
    // expand derives each occurrence's meeting_status from join_url only, so a
    // failed/manual Zoom outcome would silently show as "pending". Stamp the real
    // status onto the generated occurrences so the "No Zoom" badge appears.
    if (meetingStatus === "failed" || meetingStatus === "manual") {
      await supabase.from("batch_session").update({ meeting_status: meetingStatus }).eq("series_id", seriesId);
    }
    const { data: occ } = await supabase
      .from("batch_session")
      .select("id")
      .eq("series_id", seriesId)
      .order("starts_at");
    sessionIds = (occ ?? []).map((r) => (r as { id: string }).id);
  } else {
    const { data: session, error } = await supabase
      .from("batch_session")
      .insert({
        batch_id: batchId,
        subject_id: payload.subjectId,
        title: payload.title,
        description: payload.description,
        starts_at: payload.oneOff!.startsAt,
        ends_at: payload.oneOff!.endsAt,
        delivery_mode: payload.deliveryMode,
        zoom_meeting_id: zoomMeetingId,
        join_url: joinUrl,
        start_url: startUrl,
        meeting_status: meetingStatus,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sessionIds = [session.id];
  }

  // 5) Invite mentors — one .ics per mentor (recurring carries an RRULE), logged
  //    against every created occurrence with a shared uid. Non-fatal.
  const invitedMentorIds: string[] = [];
  if (mentors.length && sessionIds.length) {
    const uid = `${seriesId ? `series-${seriesId}` : `session-${sessionIds[0]}`}@careerlaunchpad.ai`;
    const rrule = payload.recurrence
      ? weeklyRrule(payload.recurrence.byWeekday, payload.recurrence.until ? new Date(`${payload.recurrence.until}T23:59:59Z`) : null)
      : null;
    const label = whenLabel(start, end, tz) + (rrule ? " (weekly)" : "");

    for (const m of mentors) {
      if (!m.email) continue;
      const ics = buildClassIcs({
        uid, sequence: 0, method: "REQUEST" as IcsMethod,
        title: `${subjectName}: ${payload.title}`,
        description: payload.description,
        joinUrl, start, end, rrule, timezone: tz,
        organizer: ORGANIZER,
        attendee: { name: m.full_name, email: m.email },
      });
      const res = await sendClassInviteEmail({
        to: m.email, mentorName: m.full_name, batchName, subjectName,
        title: payload.title, whenLabel: label, joinUrl, ics, method: "REQUEST",
      });
      invitedMentorIds.push(m.mentor_id);
      const invites = sessionIds.map((sid) => ({
        session_id: sid,
        mentor_id: m.mentor_id,
        ics_uid: uid,
        status: res.sent ? "sent" : "failed",
        zoom_alt_host: meetingStatus === "created",
        email_sent_at: res.sent ? new Date().toISOString() : null,
        last_error: res.error ?? null,
      }));
      await supabase.from("batch_session_invite").upsert(invites, { onConflict: "session_id,mentor_id" });
    }
  }

  return { seriesId, sessionIds, invitedMentorIds, meetingWarning };
}

type SeriesRow = {
  id: string;
  batch_id: string;
  subject_id: string;
  zoom_meeting_id: string | null;
  join_url: string | null;
  start_url: string | null;
};

/** Edit a whole recurring series: persist the new spec, update (or create) the
 * recurring Zoom meeting, re-expand FUTURE non-overridden occurrences, and
 * re-send the recurring invite (METHOD:REQUEST) to the subject's mentors. Past
 * and hand-edited occurrences are left untouched (applyTo = "future"). */
export async function updateClassSeries(
  supabase: SupabaseClient,
  args: { seriesId: string; batchName: string; subjectName: string; payload: SessionPayload; userId: string }
): Promise<ScheduleResult> {
  const { seriesId, batchName, subjectName, payload } = args;
  const rec = payload.recurrence;
  if (!rec) throw new Error("A series edit needs a weekly repeat.");

  const { data: existing } = await supabase
    .from("batch_session_series")
    .select("id, batch_id, subject_id, zoom_meeting_id, join_url, start_url")
    .eq("id", seriesId)
    .maybeSingle();
  if (!existing) throw new Error("Series not found");
  const series = existing as SeriesRow;

  const tz = rec.timezone;
  const firstDate = firstOccurrenceDate(rec.startsOn, rec.byWeekday);
  const start = zonedToUtc(firstDate, rec.timeOfDay, tz);
  const end = new Date(start.getTime() + rec.durationMin * 60_000);
  const untilDate = rec.until ? new Date(`${rec.until}T23:59:59Z`) : null;
  const mentors = await mentorsOf(supabase, series.batch_id, series.subject_id);
  const altHostEmails = mentors.map((m) => m.email).filter(Boolean);

  // Update (or create) the recurring Zoom meeting.
  let zoomMeetingId = series.zoom_meeting_id;
  let joinUrl = payload.meetingUrl ?? series.join_url;
  let startUrl = series.start_url;
  let meetingWarning: string | null = null;

  if (payload.deliveryMode !== "offline" && payload.createZoomMeeting && zoom.zoomConfigured()) {
    try {
      if (zoomMeetingId) {
        await zoom.updateMeeting(zoomMeetingId, {
          topic: `${subjectName}: ${payload.title}`,
          agenda: payload.description,
          start,
          durationMin: rec.durationMin,
          timezone: tz,
          altHostEmails,
          recurrence: { byWeekday: rec.byWeekday, until: untilDate },
        });
      } else {
        const m = await zoom.createMeeting({
          topic: `${subjectName}: ${payload.title}`,
          agenda: payload.description,
          start,
          durationMin: rec.durationMin,
          timezone: tz,
          altHostEmails,
          recurrence: { byWeekday: rec.byWeekday, until: untilDate },
        });
        zoomMeetingId = m.meetingId;
        joinUrl = m.joinUrl;
        startUrl = m.startUrl;
      }
    } catch (e) {
      meetingWarning = `Zoom update failed: ${(e as Error).message}`;
    }
  }

  const { error: uerr } = await supabase
    .from("batch_session_series")
    .update({
      title: payload.title,
      description: payload.description,
      delivery_mode: payload.deliveryMode,
      by_weekday: rec.byWeekday,
      time_of_day: rec.timeOfDay,
      duration_min: rec.durationMin,
      timezone: tz,
      starts_on: rec.startsOn,
      until: rec.until,
      zoom_meeting_id: zoomMeetingId,
      join_url: joinUrl,
      start_url: startUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId);
  if (uerr) throw new Error(uerr.message);

  // Regenerate future, non-overridden occurrences from the new spec.
  await supabase.rpc("expand_batch_session_series", { p_series_id: seriesId });
  const { data: occ } = await supabase
    .from("batch_session")
    .select("id")
    .eq("series_id", seriesId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  const sessionIds = (occ ?? []).map((r) => (r as { id: string }).id);

  // Re-send the recurring invite (UPDATE) to the subject's mentors.
  const invitedMentorIds: string[] = [];
  const uid = `series-${seriesId}@careerlaunchpad.ai`;
  const rrule = weeklyRrule(rec.byWeekday, untilDate);
  const label = whenLabel(start, end, tz) + " (weekly)";
  const seq = nextSequence();

  for (const m of mentors) {
    if (!m.email) continue;
    const ics = buildClassIcs({
      uid, sequence: seq, method: "REQUEST" as IcsMethod,
      title: `${subjectName}: ${payload.title}`, description: payload.description,
      joinUrl, start, end, rrule, timezone: tz, organizer: ORGANIZER, attendee: { name: m.full_name, email: m.email },
    });
    const res = await sendClassInviteEmail({
      to: m.email, mentorName: m.full_name, batchName, subjectName,
      title: payload.title, whenLabel: label, joinUrl, ics, method: "REQUEST",
    });
    invitedMentorIds.push(m.mentor_id);
    if (sessionIds.length) {
      await supabase.from("batch_session_invite").upsert(
        sessionIds.map((sid) => ({
          session_id: sid, mentor_id: m.mentor_id, ics_uid: uid,
          status: res.sent ? "sent" : "failed",
          zoom_alt_host: Boolean(zoomMeetingId),
          email_sent_at: res.sent ? new Date().toISOString() : null, last_error: res.error ?? null,
        })),
        { onConflict: "session_id,mentor_id" }
      );
    }
  }

  return { seriesId, sessionIds, invitedMentorIds, meetingWarning };
}

type SessionRow = {
  id: string;
  batch_id: string;
  subject_id: string;
  series_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  delivery_mode: string;
  status: string;
  zoom_meeting_id: string | null;
  join_url: string | null;
};

async function loadSession(supabase: SupabaseClient, sessionId: string): Promise<SessionRow | null> {
  const { data } = await supabase
    .from("batch_session")
    .select(
      "id, batch_id, subject_id, series_id, title, description, starts_at, ends_at, delivery_mode, status, zoom_meeting_id, join_url"
    )
    .eq("id", sessionId)
    .maybeSingle();
  return (data as SessionRow | null) ?? null;
}

/** The timezone a session should be shown in: its series' tz, else IST default. */
async function sessionTimezone(supabase: SupabaseClient, seriesId: string | null): Promise<string> {
  if (!seriesId) return "Asia/Kolkata";
  const { data } = await supabase
    .from("batch_session_series")
    .select("timezone")
    .eq("id", seriesId)
    .maybeSingle();
  return (data as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
}

async function mentorsOf(supabase: SupabaseClient, batchId: string, subjectId: string): Promise<MentorContact[]> {
  const { data } = await supabase.rpc("batch_subject_mentor_contacts", {
    p_batch_id: batchId,
    p_subject_id: subjectId,
  });
  return (data ?? []) as MentorContact[];
}

// A monotonically increasing SEQUENCE for calendar updates.
function nextSequence(): number {
  return Math.floor(Date.now() / 1000) - 1_760_000_000;
}

/** Edit one occurrence: persist, mark overridden, best-effort Zoom update, and
 * re-send the invite (METHOD:REQUEST, bumped SEQUENCE) to the subject's mentors. */
export async function updateClassSession(
  supabase: SupabaseClient,
  args: {
    sessionId: string;
    batchName: string;
    subjectName: string;
    patch: { title?: string; description?: string | null; startsAt?: string; endsAt?: string; meetingUrl?: string | null };
  }
): Promise<{ meetingWarning: string | null }> {
  const s = await loadSession(supabase, args.sessionId);
  if (!s) throw new Error("Session not found");

  const startsAt = args.patch.startsAt ?? s.starts_at;
  const endsAt = args.patch.endsAt ?? s.ends_at;
  const title = args.patch.title ?? s.title;
  const description = args.patch.description !== undefined ? args.patch.description : s.description;
  const joinUrl = args.patch.meetingUrl !== undefined ? args.patch.meetingUrl : s.join_url;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const tz = await sessionTimezone(supabase, s.series_id);
  // For a series occurrence, target just this instance (its original start) so
  // the mentor's whole recurring series isn't rewritten.
  const recurrenceId = s.series_id ? new Date(s.starts_at) : null;
  const mentors = await mentorsOf(supabase, s.batch_id, s.subject_id);

  let meetingWarning: string | null = null;
  // Only patch Zoom for a one-off. A series shares ONE recurring meeting, so
  // moving a single occurrence must NOT rewrite the whole meeting's time — the
  // recurring join link still works, and the .ics exception (RECURRENCE-ID)
  // moves just this instance on the mentor's calendar.
  if (!s.series_id && s.zoom_meeting_id && zoom.zoomConfigured()) {
    try {
      await zoom.updateMeeting(s.zoom_meeting_id, {
        topic: `${args.subjectName}: ${title}`,
        agenda: description,
        start,
        durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
        timezone: tz,
        altHostEmails: mentors.map((m) => m.email).filter(Boolean),
      });
    } catch (e) {
      meetingWarning = `Zoom update failed: ${(e as Error).message}`;
    }
  }

  const { error } = await supabase
    .from("batch_session")
    .update({
      title,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
      join_url: joinUrl,
      overridden: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.sessionId);
  if (error) throw new Error(error.message);

  // Re-send the invite as an UPDATE, reusing the stored uid so it isn't a dupe.
  const { data: invites } = await supabase
    .from("batch_session_invite")
    .select("mentor_id, ics_uid")
    .eq("session_id", args.sessionId);
  const uidByMentor = new Map(
    ((invites ?? []) as { mentor_id: string; ics_uid: string }[]).map((i) => [i.mentor_id, i.ics_uid])
  );
  const seq = nextSequence();
  const label = whenLabel(start, end, tz);

  for (const m of mentors) {
    if (!m.email) continue;
    const uid = uidByMentor.get(m.mentor_id) ?? `session-${args.sessionId}@careerlaunchpad.ai`;
    const ics = buildClassIcs({
      uid, sequence: seq, method: "REQUEST" as IcsMethod,
      title: `${args.subjectName}: ${title}`, description, joinUrl, start, end, rrule: null,
      timezone: tz, recurrenceId,
      organizer: ORGANIZER, attendee: { name: m.full_name, email: m.email },
    });
    const res = await sendClassInviteEmail({
      to: m.email, mentorName: m.full_name, batchName: args.batchName, subjectName: args.subjectName,
      title, whenLabel: label, joinUrl, ics, method: "REQUEST",
    });
    await supabase.from("batch_session_invite").upsert(
      {
        session_id: args.sessionId, mentor_id: m.mentor_id, ics_uid: uid,
        status: res.sent ? "sent" : "failed",
        email_sent_at: res.sent ? new Date().toISOString() : null, last_error: res.error ?? null,
      },
      { onConflict: "session_id,mentor_id" }
    );
  }
  return { meetingWarning };
}

/** Cancel one occurrence: mark cancelled, delete the Zoom meeting, and send a
 * METHOD:CANCEL to invited mentors so it drops off their calendars. */
export async function cancelClassSession(
  supabase: SupabaseClient,
  args: { sessionId: string; batchName: string; subjectName: string }
): Promise<void> {
  const s = await loadSession(supabase, args.sessionId);
  if (!s || s.status === "cancelled") return;

  // Only delete the Zoom meeting for a one-off. A series shares ONE meeting
  // across all occurrences, so deleting it here would break the others — the
  // CANCEL invite (with RECURRENCE-ID) removes just this instance.
  if (!s.series_id && s.zoom_meeting_id && zoom.zoomConfigured()) {
    try {
      await zoom.deleteMeeting(s.zoom_meeting_id);
    } catch {
      /* non-fatal — the class is still cancelled in-app */
    }
  }

  await supabase
    .from("batch_session")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", args.sessionId);

  const start = new Date(s.starts_at);
  const end = new Date(s.ends_at);
  const tz = await sessionTimezone(supabase, s.series_id);
  const recurrenceId = s.series_id ? new Date(s.starts_at) : null;
  const mentors = await mentorsOf(supabase, s.batch_id, s.subject_id);
  const { data: invites } = await supabase
    .from("batch_session_invite")
    .select("mentor_id, ics_uid")
    .eq("session_id", args.sessionId);
  const uidByMentor = new Map(
    ((invites ?? []) as { mentor_id: string; ics_uid: string }[]).map((i) => [i.mentor_id, i.ics_uid])
  );
  const seq = nextSequence();

  for (const m of mentors) {
    if (!m.email) continue;
    const uid = uidByMentor.get(m.mentor_id) ?? `session-${args.sessionId}@careerlaunchpad.ai`;
    const ics = buildClassIcs({
      uid, sequence: seq, method: "CANCEL" as IcsMethod,
      title: `${args.subjectName}: ${s.title}`, description: s.description, joinUrl: null, start, end, rrule: null,
      timezone: tz, recurrenceId,
      organizer: ORGANIZER, attendee: { name: m.full_name, email: m.email },
    });
    await sendClassInviteEmail({
      to: m.email, mentorName: m.full_name, batchName: args.batchName, subjectName: args.subjectName,
      title: s.title, whenLabel: whenLabel(start, end, tz), joinUrl: null, ics, method: "CANCEL",
    });
  }
  await supabase
    .from("batch_session_invite")
    .update({ status: "cancelled" })
    .eq("session_id", args.sessionId);
}

/** Cancel a whole recurring series in one shot: delete the (shared) Zoom
 * meeting once, mark all future occurrences cancelled, and send ONE
 * METHOD:CANCEL per mentor for the series master (no RECURRENCE-ID → the whole
 * recurring event is removed from their calendar). Avoids per-occurrence email
 * and Zoom-delete fan-out. */
export async function cancelClassSeries(
  supabase: SupabaseClient,
  args: { seriesId: string; batchName: string; subjectName: string }
): Promise<void> {
  const { data: series } = await supabase
    .from("batch_session_series")
    .select("id, batch_id, subject_id, title, description, timezone, zoom_meeting_id, join_url")
    .eq("id", args.seriesId)
    .maybeSingle();
  if (!series) return;
  const s = series as {
    batch_id: string; subject_id: string; title: string; description: string | null;
    timezone: string; zoom_meeting_id: string | null;
  };

  if (s.zoom_meeting_id && zoom.zoomConfigured()) {
    try {
      await zoom.deleteMeeting(s.zoom_meeting_id);
    } catch {
      /* non-fatal */
    }
  }

  const nowIso = new Date().toISOString();
  const { data: future } = await supabase
    .from("batch_session")
    .select("id, starts_at, ends_at")
    .eq("series_id", args.seriesId)
    .neq("status", "cancelled")
    .gte("starts_at", nowIso)
    .order("starts_at");
  const occ = (future ?? []) as { id: string; starts_at: string; ends_at: string }[];
  if (occ.length === 0) return;

  await supabase
    .from("batch_session")
    .update({ status: "cancelled", updated_at: nowIso })
    .in("id", occ.map((o) => o.id));

  const uid = `series-${args.seriesId}@careerlaunchpad.ai`;
  const start = new Date(occ[0].starts_at);
  const end = new Date(occ[0].ends_at);
  const tz = s.timezone ?? "Asia/Kolkata";
  const mentors = await mentorsOf(supabase, s.batch_id, s.subject_id);
  const seq = nextSequence();

  for (const m of mentors) {
    if (!m.email) continue;
    const ics = buildClassIcs({
      uid, sequence: seq, method: "CANCEL" as IcsMethod,
      title: `${args.subjectName}: ${s.title}`, description: s.description, joinUrl: null, start, end, rrule: null,
      timezone: tz,
      organizer: ORGANIZER, attendee: { name: m.full_name, email: m.email },
    });
    await sendClassInviteEmail({
      to: m.email, mentorName: m.full_name, batchName: args.batchName, subjectName: args.subjectName,
      title: s.title, whenLabel: whenLabel(start, end, tz) + " (weekly)", joinUrl: null, ics, method: "CANCEL",
    });
  }
  await supabase
    .from("batch_session_invite")
    .update({ status: "cancelled" })
    .in("session_id", occ.map((o) => o.id));
}

/** Truncate a series from a given occurrence onward: cancel that occurrence and
 * every later one, shorten the series' `until` (so expansion won't recreate
 * them) and the recurring Zoom meeting, and send mentors ONE update that
 * shortens their recurring event (or a CANCEL if nothing remains). Earlier
 * occurrences are kept. Falls back to a single-occurrence cancel for a one-off. */
export async function truncateClassSeries(
  supabase: SupabaseClient,
  args: { fromSessionId: string; batchName: string; subjectName: string }
): Promise<void> {
  const s = await loadSession(supabase, args.fromSessionId);
  if (!s) return;
  if (!s.series_id) {
    await cancelClassSession(supabase, {
      sessionId: args.fromSessionId,
      batchName: args.batchName,
      subjectName: args.subjectName,
    });
    return;
  }

  const { data: seriesRow } = await supabase
    .from("batch_session_series")
    .select("id, batch_id, subject_id, title, description, by_weekday, time_of_day, duration_min, timezone, starts_on, zoom_meeting_id, join_url")
    .eq("id", s.series_id)
    .maybeSingle();
  if (!seriesRow) return;
  const ser = seriesRow as {
    id: string; batch_id: string; subject_id: string; title: string; description: string | null;
    by_weekday: number[]; time_of_day: string; duration_min: number; timezone: string;
    starts_on: string; zoom_meeting_id: string | null; join_url: string | null;
  };
  const tz = ser.timezone ?? "Asia/Kolkata";
  const cutoff = s.starts_at;
  const nowIso = new Date().toISOString();

  // Keep everything before this occurrence; series now ends the day before it.
  const newUntil = addDaysStr(localDate(cutoff, tz), -1);

  // 1) Stop future expansion beyond the new end.
  await supabase
    .from("batch_session_series")
    .update({ until: newUntil, updated_at: nowIso })
    .eq("id", ser.id);

  // 2) Cancel this occurrence + all later ones.
  const { data: toCancel } = await supabase
    .from("batch_session")
    .select("id")
    .eq("series_id", ser.id)
    .neq("status", "cancelled")
    .gte("starts_at", cutoff);
  const cancelledIds = (toCancel ?? []).map((r) => (r as { id: string }).id);
  if (cancelledIds.length) {
    await supabase
      .from("batch_session")
      .update({ status: "cancelled", updated_at: nowIso })
      .in("id", cancelledIds);
  }

  // Anything still upcoming after the truncation?
  const { count } = await supabase
    .from("batch_session")
    .select("id", { count: "exact", head: true })
    .eq("series_id", ser.id)
    .neq("status", "cancelled")
    .gte("starts_at", nowIso);
  const nothingLeft = (count ?? 0) === 0;

  // 3) Zoom: shorten (or delete) the shared recurring meeting.
  if (ser.zoom_meeting_id && zoom.zoomConfigured()) {
    try {
      if (nothingLeft) await zoom.deleteMeeting(ser.zoom_meeting_id);
      else
        await zoom.updateMeeting(ser.zoom_meeting_id, {
          recurrence: { byWeekday: ser.by_weekday, until: new Date(`${newUntil}T23:59:59Z`) },
        });
    } catch {
      /* non-fatal */
    }
  }

  // 4) Notify mentors: a shortened recurring event (REQUEST) or a full CANCEL.
  const firstDate = firstOccurrenceDate(ser.starts_on, ser.by_weekday);
  const start = zonedToUtc(firstDate, ser.time_of_day.slice(0, 5), tz);
  const end = new Date(start.getTime() + ser.duration_min * 60_000);
  const uid = `series-${ser.id}@careerlaunchpad.ai`;
  const method: IcsMethod = nothingLeft ? "CANCEL" : "REQUEST";
  const rrule = nothingLeft ? null : weeklyRrule(ser.by_weekday, new Date(`${newUntil}T23:59:59Z`));
  const seq = nextSequence();
  const mentors = await mentorsOf(supabase, ser.batch_id, ser.subject_id);

  for (const m of mentors) {
    if (!m.email) continue;
    const ics = buildClassIcs({
      uid, sequence: seq, method,
      title: `${args.subjectName}: ${ser.title}`, description: ser.description,
      joinUrl: nothingLeft ? null : ser.join_url, start, end, rrule, timezone: tz,
      organizer: ORGANIZER, attendee: { name: m.full_name, email: m.email },
    });
    await sendClassInviteEmail({
      to: m.email, mentorName: m.full_name, batchName: args.batchName, subjectName: args.subjectName,
      title: ser.title, whenLabel: whenLabel(start, end, tz) + " (weekly)",
      joinUrl: nothingLeft ? null : ser.join_url, ics, method,
    });
  }

  if (cancelledIds.length) {
    await supabase
      .from("batch_session_invite")
      .update({ status: "cancelled" })
      .in("session_id", cancelledIds);
  }
}
