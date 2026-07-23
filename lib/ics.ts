// Build RFC 5545 calendar invites (.ics) for class sessions (issue #64). Sent to
// subject mentors so a class lands in their Outlook/Google/Apple calendar.
//
// Times are emitted as LOCAL wall-clock with a TZID + a VTIMEZONE, not as a UTC
// instant, so a weekly RRULE's BYDAY is computed in the class's own timezone
// (a 05:00 IST Monday class stays on Monday, not the UTC weekday it maps to).
//
// A stable `uid` means an edit sends METHOD:REQUEST (an update) and a cancel
// sends METHOD:CANCEL. For a single occurrence of a recurring series, pass
// `recurrenceId` (the occurrence's original start): the invite then targets just
// that instance (an exception), instead of the whole recurring master.
//
// Server-only (used by the scheduling API). No external deps — a VEVENT is text.

export type IcsMethod = "REQUEST" | "CANCEL";

export type IcsPerson = { name?: string | null; email: string };

export type BuildIcsInput = {
  uid: string;
  sequence: number;
  method: IcsMethod;
  title: string;
  description?: string | null;
  /** Join link — used as both LOCATION and URL. */
  joinUrl?: string | null;
  start: Date;
  end: Date;
  /** IANA timezone the class is scheduled in, e.g. "Asia/Kolkata". */
  timezone: string;
  /** RRULE body WITHOUT the "RRULE:" prefix, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260930T000000Z". */
  rrule?: string | null;
  /** For a single occurrence of a series: its original start (targets one instance). */
  recurrenceId?: Date | null;
  organizer: IcsPerson;
  attendee: IcsPerson;
};

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** UTC stamp: 20260720T043000Z (for DTSTAMP and RRULE UNTIL). */
function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Local wall-clock in a timezone: 20260720T100000 (no Z). */
function local(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}${g("month")}${g("day")}T${g("hour")}${g("minute")}${g("second")}`;
}

/** UTC offset of a timezone at instant d, formatted "+0530" / "-0400". */
function tzOffset(d: Date, tz: string): string {
  const asTz = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const asUtc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const min = Math.round((asTz.getTime() - asUtc.getTime()) / 60000);
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}${String(a % 60).padStart(2, "0")}`;
}

export function buildClassIcs(input: BuildIcsInput): string {
  const cancelled = input.method === "CANCEL";
  const tz = input.timezone;
  const off = tzOffset(input.start, tz);
  const orgName = input.organizer.name ?? "CareerLaunchpad";
  const attName = input.attendee.name ?? input.attendee.email;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareerLaunchpad//Class Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    // Minimal fixed-offset VTIMEZONE (Asia/Kolkata has no DST; the offset is
    // computed at the event start for other zones).
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:STANDARD",
    `TZOFFSETFROM:${off}`,
    `TZOFFSETTO:${off}`,
    `TZNAME:${esc(tz)}`,
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utc(new Date())}`,
    ...(input.recurrenceId ? [`RECURRENCE-ID;TZID=${tz}:${local(input.recurrenceId, tz)}`] : []),
    `DTSTART;TZID=${tz}:${local(input.start, tz)}`,
    `DTEND;TZID=${tz}:${local(input.end, tz)}`,
    ...(input.rrule && !cancelled ? [`RRULE:${input.rrule}`] : []),
    `SUMMARY:${esc(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${esc(input.description)}`] : []),
    ...(input.joinUrl ? [`LOCATION:${esc(input.joinUrl)}`, `URL:${esc(input.joinUrl)}`] : []),
    `ORGANIZER;CN=${esc(orgName)}:mailto:${input.organizer.email}`,
    `ATTENDEE;CN=${esc(attName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendee.email}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    ...(cancelled ? [] : ["BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Map Postgres dow (0=Sun…6=Sat) to iCalendar BYDAY tokens. */
const ICAL_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export function weeklyRrule(byWeekday: number[], until?: Date | null): string {
  const days = byWeekday.map((d) => ICAL_DAYS[d]).filter(Boolean).join(",");
  const parts = ["FREQ=WEEKLY", `BYDAY=${days}`];
  // RFC 5545: with a TZID DTSTART, UNTIL must be a UTC date-time.
  if (until) parts.push(`UNTIL=${utc(until)}`);
  return parts.join(";");
}
