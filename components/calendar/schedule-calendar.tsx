"use client";

// Shared class calendar (issue #64) — a custom Outlook/Google-style calendar
// built to the approved mock: Day/Week/Month/Agenda, a 30-minute time grid with
// subject-coloured cards (left accent), a live-now pulse + red "now" line, and
// Join-Zoom actions. Mobile: the week view collapses to a single day with a
// day-chip strip. Themed through the app's shadcn tokens, so it follows
// light/dark.
//
// Used by BOTH surfaces:
//  • Student (/student/calendar) — uncontrolled: fetches /api/calendar/sessions
//    (RLS-scoped to the student's batches) as the visible window changes.
//  • Admin (batch schedule) — controlled: pass `sessions` and the grid renders
//    them read-only alongside the scheduling form; no internal fetch.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarSession } from "@/lib/calendar-query";
import "./schedule-calendar.css";

const TZ = "Asia/Kolkata";
const DAY = 86_400_000;
const START_HOUR = 7;
const END_HOUR = 21;
const ROW_MIN = 30;
const ROW_H = 44; // must equal --slc-rowh in schedule-calendar.css
const ROWS = ((END_HOUR - START_HOUR) * 60) / ROW_MIN;
const GRID_H = ROWS * ROW_H;

const PALETTE = ["#2563eb", "#7c3aed", "#0d9488", "#d97706", "#e11d48", "#059669", "#4f46e5", "#475569"];
const hueOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

type View = "week" | "day" | "month" | "agenda";

// ---- IST date helpers (dates are 'YYYY-MM-DD'; math via UTC-noon to dodge DST) ----
const partsOf = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).formatToParts(new Date(iso));
const istDate = (iso: string) => {
  const p = partsOf(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
};
const istMinutes = (iso: string) => {
  const p = partsOf(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return g("hour") * 60 + g("minute");
};
const todayIst = () => istDate(new Date().toISOString());
const nowMinutesIst = () => istMinutes(new Date().toISOString());

const noon = (d: string) => new Date(`${d}T12:00:00Z`);
const addDays = (d: string, n: number) => new Date(noon(d).getTime() + n * DAY).toISOString().slice(0, 10);
const dow = (d: string) => noon(d).getUTCDay(); // 0=Sun..6=Sat
const mondayOf = (d: string) => addDays(d, -((dow(d) + 6) % 7));
const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
const addMonths = (d: string, n: number) => {
  const [y, m] = d.split("-").map(Number);
  const nm = m - 1 + n;
  const yy = y + Math.floor(nm / 12);
  const mm = ((nm % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
};

const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts }).format(noon(d));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const hourLabel = (h: number) => {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 || 12;
  return `${hh} ${ap}`;
};

type Positioned = CalendarSession & { top: number; height: number; lane: number; lanes: number };

function packDay(evs: CalendarSession[]): Positioned[] {
  const items = evs
    .map((e) => ({ e, s: istMinutes(e.startsAt), en: istMinutes(e.endsAt) }))
    .sort((a, b) => a.s - b.s || a.en - b.en);
  const out: Positioned[] = [];
  let cluster: { e: CalendarSession; s: number; en: number; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.en);
      } else laneEnds[lane] = it.en;
      it.lane = lane;
    }
    const lanes = laneEnds.length;
    for (const it of cluster) {
      const startMin = Math.max(it.s, START_HOUR * 60);
      const endMin = Math.min(it.en, END_HOUR * 60);
      out.push({
        ...it.e,
        lane: it.lane,
        lanes,
        top: ((startMin - START_HOUR * 60) / ROW_MIN) * ROW_H,
        height: Math.max(((endMin - startMin) / ROW_MIN) * ROW_H - 3, 20),
      });
    }
    cluster = [];
    clusterEnd = -1;
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push({ ...it, lane: 0 });
    clusterEnd = Math.max(clusterEnd, it.en);
  }
  if (cluster.length) flush();
  return out;
}

export type ScheduleCalendarProps = {
  /** Controlled mode (admin): render these sessions and skip the internal fetch.
   *  Omit for uncontrolled mode (student): the grid fetches its own window from
   *  /api/calendar/sessions. */
  sessions?: CalendarSession[];
  /** Header title. `null` hides the header entirely (e.g. embedded in a page
   *  that already has its own heading). */
  title?: string | null;
  /** Header subtitle, shown under the title. */
  description?: string;
  /** Wrapper classes; defaults to a centered max-width column. */
  className?: string;
};

export function ScheduleCalendar({
  sessions: sessionsProp,
  title = "My calendar",
  description = "Your scheduled classes. Tap a class to join its Zoom room.",
  className = "mx-auto max-w-5xl",
}: ScheduleCalendarProps = {}) {
  const controlled = sessionsProp !== undefined;
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string>(todayIst());
  const [narrow, setNarrow] = useState(false);
  const [fetched, setFetched] = useState<CalendarSession[]>([]);
  const [loading, setLoading] = useState(!controlled);
  const [error, setError] = useState("");
  const [nowMin, setNowMin] = useState(nowMinutesIst());
  const today = todayIst();
  const sessions = controlled ? sessionsProp! : fetched;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowMin(nowMinutesIst()), 60_000);
    return () => clearInterval(t);
  }, []);

  const win = useMemo(() => {
    let fromD: string, toD: string;
    if (view === "day") [fromD, toD] = [anchor, addDays(anchor, 1)];
    else if (view === "week") [fromD, toD] = [mondayOf(anchor), addDays(mondayOf(anchor), 7)];
    else if (view === "month") {
      const gStart = mondayOf(firstOfMonth(anchor));
      [fromD, toD] = [gStart, addDays(gStart, 42)];
    } else [fromD, toD] = [today, addDays(today, 30)];
    return {
      from: new Date(`${fromD}T00:00:00+05:30`).toISOString(),
      to: new Date(`${toD}T00:00:00+05:30`).toISOString(),
    };
  }, [view, anchor, today]);

  useEffect(() => {
    if (controlled) return; // admin supplies sessions; no internal fetch
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/calendar/sessions?from=${encodeURIComponent(win.from)}&to=${encodeURIComponent(win.to)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load your calendar");
        if (!cancelled) setFetched(json.sessions ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [win, controlled]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)), [anchor]);
  const gridDays = view === "day" || (view === "week" && narrow) ? [anchor] : weekDays;
  const showChips = view === "week" && narrow;

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const d = istDate(s.startsAt);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [sessions]);

  const legend = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const s of sessions)
      if (s.subjectName && !seen.has(s.subjectId)) seen.set(s.subjectId, { name: s.subjectName, color: hueOf(s.subjectId) });
    return [...seen.values()];
  }, [sessions]);

  const step = useCallback(
    (dir: number) => {
      if (view === "day") setAnchor((a) => addDays(a, dir));
      else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
      else if (view === "month") setAnchor((a) => addMonths(a, dir));
      else setAnchor((a) => addDays(a, dir * 30));
    },
    [view]
  );

  const rangeLabel = useMemo(() => {
    if (view === "day") return fmt(anchor, { weekday: "long", day: "numeric", month: "short", year: "numeric" });
    if (view === "month") return fmt(anchor, { month: "long", year: "numeric" });
    if (view === "agenda") return "Next 30 days";
    const a = weekDays[0], b = weekDays[6];
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    return `${fmt(a, { month: "short", day: "numeric" })} – ${fmt(b, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}, ${a.slice(0, 4)}`;
  }, [view, anchor, weekDays]);

  const openZoom = (url?: string | null) => url && window.open(url, "_blank", "noopener");

  return (
    <div className={`slc ${className}`.trim()}>
      {title !== null && (
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </header>
      )}

      {/* Toolbar */}
      <div className="bg-card mb-3 flex flex-wrap items-center gap-2 rounded-xl border p-2.5 shadow-sm">
        <Button variant="outline" size="sm" onClick={() => setAnchor(todayIst())}>Today</Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="mr-auto text-sm font-semibold tracking-tight sm:text-base">{rangeLabel}</span>
        <div className="inline-flex overflow-hidden rounded-lg border">
          {(["day", "week", "month", "agenda"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`border-r px-3 py-1.5 text-xs font-semibold capitalize last:border-r-0 transition-colors ${
                view === v ? "text-white" : "text-muted-foreground hover:bg-muted"
              }`}
              style={view === v ? { backgroundImage: "var(--brand-gradient-135)" } : undefined}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      {legend.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {legend.map((l) => (
            <span key={l.name} className="text-muted-foreground inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading your classes…
        </div>
      )}
      {error && <p className="text-destructive py-6 text-sm">{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <div className="text-muted-foreground mb-3 flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm">
          <Video className="size-4" /> No classes scheduled in this range — they&apos;ll appear here as
          your batch adds them.
        </div>
      )}

      {!loading && !error && (
        <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
          {/* Mobile day-chip strip (week view) */}
          {showChips && (
            <div className="flex gap-1.5 overflow-x-auto border-b p-2">
              {weekDays.map((d) => {
                const active = d === anchor;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setAnchor(d)}
                    aria-pressed={active}
                    className={`flex min-w-[48px] flex-col items-center rounded-xl border px-2 py-1.5 ${
                      active ? "border-transparent text-white" : "text-muted-foreground"
                    }`}
                    style={active ? { backgroundImage: "var(--brand-gradient-135)" } : undefined}
                  >
                    <span className="text-[0.6rem] font-semibold uppercase">{fmt(d, { weekday: "short" })}</span>
                    <span className="text-base font-bold tabular-nums">{fmt(d, { day: "numeric" })}</span>
                  </button>
                );
              })}
            </div>
          )}

          {view === "agenda" ? (
            <AgendaView sessions={sessions} onJoin={openZoom} />
          ) : view === "month" ? (
            <MonthView
              anchor={anchor}
              today={today}
              byDay={byDay}
              onPickDay={(d) => {
                setAnchor(d);
                setView("day");
              }}
            />
          ) : (
            <GridView days={gridDays} today={today} nowMin={nowMin} byDay={byDay} onJoin={openZoom} />
          )}
        </div>
      )}
    </div>
  );
}

// ---- Week / Day time grid ----
function GridView({
  days,
  today,
  nowMin,
  byDay,
  onJoin,
}: {
  days: string[];
  today: string;
  nowMin: number;
  byDay: Map<string, CalendarSession[]>;
  onJoin: (url?: string | null) => void;
}) {
  const nowTop = ((nowMin - START_HOUR * 60) / ROW_MIN) * ROW_H;
  const showNow = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  return (
    <div style={{ ["--slc-cols" as string]: days.length }}>
      {/* Header + body share one scroll container so both reserve the scrollbar
          width identically — dates stay aligned with the grid columns. */}
      <div className="max-h-[560px] overflow-y-auto">
        {/* Sticky day-name header */}
        <div className="slc-daynames border-b">
          <div />
          {days.map((d) => {
            const isToday = d === today;
            return (
              <div key={d} className="border-l py-2 text-center">
                <div className={`text-[0.65rem] font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {fmt(d, { weekday: "short" })}
                </div>
                <div
                  className={`mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-base font-semibold tabular-nums ${isToday ? "text-white" : ""}`}
                  style={isToday ? { backgroundImage: "var(--brand-gradient-135)" } : undefined}
                >
                  {fmt(d, { day: "numeric" })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="slc-body">
          <div>
            {Array.from({ length: ROWS }, (_, r) => {
              const totalMin = START_HOUR * 60 + r * ROW_MIN;
              return (
                <div key={r} className="slc-tick">
                  {totalMin % 60 === 0 && <span>{hourLabel(totalMin / 60)}</span>}
                </div>
              );
            })}
          </div>
          {days.map((d) => {
            const positioned = packDay((byDay.get(d) ?? []).filter((s) => s.status !== "cancelled"));
            return (
              <div key={d} className={`slc-col ${d === today ? "slc-today" : ""}`} style={{ height: GRID_H }}>
                {d === today && showNow && <div className="slc-now" style={{ top: nowTop }} />}
                {positioned.map((e) => {
                  const gapPct = 2;
                  const widthPct = 100 / e.lanes;
                  return (
                    <div
                      key={e.id}
                      className={`slc-ev ${e.status === "live" ? "slc-live" : ""} ${e.status === "completed" ? "slc-completed" : ""}`}
                      style={{
                        top: e.top,
                        height: e.height,
                        left: `calc(${e.lane * widthPct}% + 4px)`,
                        width: `calc(${widthPct}% - ${gapPct + 4}px)`,
                        ["--slc-hue" as string]: hueOf(e.subjectId),
                      }}
                      onClick={() => onJoin(e.joinUrl)}
                      role="button"
                      tabIndex={0}
                    >
                      {e.status === "live" && (
                        <span className="flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-wide" style={{ color: "var(--slc-hue)" }}>
                          <span className="slc-live-dot" /> Live
                        </span>
                      )}
                      <span className="slc-ev-title">{e.title}</span>
                      <span className="slc-ev-meta">
                        {fmtTime(e.startsAt)} – {fmtTime(e.endsAt)}
                      </span>
                      {e.status !== "completed" && e.joinUrl && (
                        <button
                          className="slc-ev-join"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onJoin(e.joinUrl);
                          }}
                        >
                          <Video className="size-3" /> Join
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Month grid ----
function MonthView({
  anchor,
  today,
  byDay,
  onPickDay,
}: {
  anchor: string;
  today: string;
  byDay: Map<string, CalendarSession[]>;
  onPickDay: (d: string) => void;
}) {
  const gStart = mondayOf(firstOfMonth(anchor));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gStart, i));
  const month = anchor.slice(0, 7);
  return (
    <div>
      <div className="slc-month border-b">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-muted-foreground border-l py-2 text-center text-[0.65rem] font-semibold uppercase tracking-wider first:border-l-0">
            {d}
          </div>
        ))}
      </div>
      <div className="slc-month">
        {cells.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const evs = (byDay.get(d) ?? []).filter((s) => s.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          return (
            <div key={d} className={`slc-mcell ${inMonth ? "" : "opacity-40"}`}>
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className={`self-start rounded-full px-1.5 text-xs font-semibold tabular-nums ${d === today ? "text-white" : "text-muted-foreground"}`}
                style={d === today ? { backgroundImage: "var(--brand-gradient-135)" } : undefined}
              >
                {fmt(d, { day: "numeric" })}
              </button>
              {evs.slice(0, 3).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="slc-mchip"
                  style={{ ["--slc-hue" as string]: hueOf(e.subjectId) }}
                  onClick={() => onPickDay(d)}
                  title={e.title}
                >
                  {fmtTime(e.startsAt).replace(":00", "")} {e.subjectName ?? e.title}
                </button>
              ))}
              {evs.length > 3 && <span className="text-muted-foreground text-[0.62rem]">+{evs.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Agenda list ----
function AgendaView({ sessions, onJoin }: { sessions: CalendarSession[]; onJoin: (url?: string | null) => void }) {
  const active = sessions.filter((s) => s.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const groups = new Map<string, CalendarSession[]>();
  for (const s of active) {
    const d = istDate(s.startsAt);
    groups.set(d, [...(groups.get(d) ?? []), s]);
  }
  if (active.length === 0)
    return <p className="text-muted-foreground p-8 text-center text-sm">No classes in this range.</p>;
  return (
    <div className="divide-y">
      {[...groups.entries()].map(([d, evs]) => (
        <div key={d} className="p-3">
          <div className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
            {fmt(d, { weekday: "long", day: "numeric", month: "short" })}
          </div>
          <div className="grid gap-2">
            {evs.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <span className="h-8 w-1 rounded-full" style={{ background: hueOf(e.subjectId) }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{e.title}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {fmtTime(e.startsAt)} – {fmtTime(e.endsAt)}
                    {e.subjectName ? ` · ${e.subjectName}` : ""}
                    {e.mentors.length ? ` · ${e.mentors.join(", ")}` : ""}
                  </div>
                </div>
                {e.status !== "completed" && e.joinUrl && (
                  <Button variant="outline" size="sm" onClick={() => onJoin(e.joinUrl)}>
                    <Video /> Join
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
