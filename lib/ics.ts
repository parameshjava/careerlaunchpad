// Build RFC 5545 calendar invites (.ics) for class sessions (issue #64). Sent to
// subject mentors so a class lands in their Outlook/Google/Apple calendar. A
// stable `uid` means an edit sends METHOD:REQUEST with a bumped SEQUENCE (an
// update, not a duplicate) and a cancel sends METHOD:CANCEL.
//
// Server-only (used by the scheduling API). No external deps — a VEVENT is just
// text.

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
  /** RRULE body WITHOUT the "RRULE:" prefix, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260930T000000Z". */
  rrule?: string | null;
  organizer: IcsPerson;
  attendee: IcsPerson;
};

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** UTC stamp: 20260720T043000Z. */
function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildClassIcs(input: BuildIcsInput): string {
  const cancelled = input.method === "CANCEL";
  const orgName = input.organizer.name ?? "CareerLaunchpad";
  const attName = input.attendee.name ?? input.attendee.email;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CareerLaunchpad//Class Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(input.start)}`,
    `DTEND:${utc(input.end)}`,
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
  if (until) parts.push(`UNTIL=${utc(until)}`);
  return parts.join(";");
}
