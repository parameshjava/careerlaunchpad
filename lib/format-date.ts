// One place for date/time display across the whole app. Everything renders in
// the India locale (en-IN) and IST (Asia/Kolkata) so the SAME instant shows
// identically on every screen — no more per-file Intl.DateTimeFormat /
// toLocaleDateString calls that drift on day-style (2-digit vs numeric), locale
// (en-IN vs default), or timezone (UTC vs IST vs none).
//
// Inputs accept an ISO string ("2026-07-24" or "2026-07-24T09:30"), an epoch
// number, or a Date. Invalid / empty inputs render as an em-dash so callers
// don't have to guard.

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const TIME = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const WEEKDAY_LONG = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  timeZone: "Asia/Kolkata",
});

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: "Asia/Kolkata",
});

// For date-ONLY calendar values ("YYYY-MM-DD") we must NOT apply a timezone —
// the date has no instant, so shifting it by IST (or any zone) would move it a
// day for viewers in other zones. Parse + format at UTC so the calendar date
// reads identically everywhere.
const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export type DateInput = string | number | Date | null | undefined;

/** Coerce any accepted input to a valid Date, or null. */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "24 Jul 2026" (IST). */
export function formatDate(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? DATE.format(d) : fallback;
}

/** "24 Jul 2026, 09:30 AM" (IST). */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? DATE_TIME.format(d) : fallback;
}

/** "09:30 AM" (IST). */
export function formatTime(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? TIME.format(d) : fallback;
}

/** "Friday" (IST). */
export function formatWeekday(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? WEEKDAY_LONG.format(d) : fallback;
}

/** "Fri" (IST). */
export function formatWeekdayShort(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? WEEKDAY_SHORT.format(d) : fallback;
}

/**
 * Format a date-ONLY string ("YYYY-MM-DD") by its calendar components with NO
 * timezone shift — "15 May 2000" reads the same for every viewer. Use for stored
 * calendar dates (DOB, issue dates); use formatDate() for real instants.
 */
export function formatISODate(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : DATE_ONLY.format(d);
}
