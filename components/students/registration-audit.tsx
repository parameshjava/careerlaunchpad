// Registration audit panel (issue #83) — the staff-only "how did this profile come
// to be" card on /dashboard/students/[id]. Server-rendered: nothing here is
// interactive, and the data is PII we don't want shipped to a client bundle.
//
// Two halves, matching what the audit actually knows:
//   • Facts   — the current state, read off student_profile's audit columns.
//   • History — the append-only student_registration_event timeline.
//
// Anything the platform genuinely does not know prints "Not recorded" rather than
// a zero or a guess. Rows created before migration 160 have no IP and no actor,
// and an audit trail that quietly implies otherwise is worse than a blank.
import { History } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { formatDateTime } from "@/lib/format-date";

export type RegistrationSource = "self" | "admin" | "import" | "invite" | "unknown";

export type RegistrationEvent = {
  id: string;
  event: "created" | "submitted" | "reregistered";
  revision: number | null;
  actorKind: "self" | "staff" | "system" | "unknown";
  actorName: string | null;
  onBehalf: boolean;
  ip: string | null;
  createdAt: string;
};

export type RegistrationAudit = {
  createdVia: RegistrationSource | null;
  createdByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reopenedAt: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  lastIp: string | null;
  revision: number;
  events: RegistrationEvent[];
};

// How the record came into being. The wording matters — "Imported by college" and
// "Added by staff" answer #83's actual question (self vs admin) at a glance.
const SOURCE_LABEL: Record<RegistrationSource, string> = {
  self: "Self-registered",
  admin: "Added by staff",
  import: "Imported by college",
  invite: "Invited by staff",
  unknown: "Not recorded",
};

const SOURCE_TONE: Record<RegistrationSource, StatusTone> = {
  self: "emerald",
  admin: "blue",
  import: "violet",
  invite: "blue",
  unknown: "slate",
};

const EVENT_LABEL: Record<RegistrationEvent["event"], string> = {
  created: "Profile created",
  submitted: "Submitted",
  reregistered: "Re-registered",
};

const NOT_RECORDED = "Not recorded";

/**
 * Human-readable gap between two instants ("18 min", "2 d 3 hr").
 *
 * This is WALL-CLOCK elapsed time from the first save to the first submit, not
 * time spent filling the form — a student can open Step 1, abandon it for a
 * fortnight, then finish in ten minutes. Hence the label says "elapsed" and never
 * "took": phrasing it as effort turns a funnel signal into a false claim about
 * the student. Coarse on purpose for the same reason.
 */
function duration(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;

  const mins = Math.round(ms / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const rem = mins % 60;
    return rem ? `${hrs} hr ${rem} min` : `${hrs} hr`;
  }
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? `${days} d ${remHrs} hr` : `${days} d`;
}

/** One label/value pair. Stacks on phones, two columns from `sm`. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-3">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Muted "Not recorded" so a blank never reads as a real value. */
function Unknown() {
  return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
}

export function RegistrationAuditPanel({ audit }: { audit: RegistrationAudit }) {
  const source = audit.createdVia ?? "unknown";

  // A start that postdates the completion is impossible, so it's a bad value, not
  // a fact — suppress it instead of rendering "started 04 Aug, completed 26 Jul".
  // Migration 160 repairs the rows that caused this; the guard stays because the
  // panel should never present an incoherent timeline whatever wrote the row.
  const startedAt =
    audit.startedAt && audit.completedAt && new Date(audit.startedAt) > new Date(audit.completedAt)
      ? null
      : audit.startedAt;

  // A re-registration restarts the clock, so measure the CURRENT attempt. Elapsed
  // is shown ONLY when both ends were actually measured — a registration that
  // pre-dates auditing has no start, and inventing one produces a duration nobody
  // observed.
  const attemptStart = audit.reopenedAt ?? startedAt;
  const elapsed = duration(attemptStart, audit.completedAt);

  return (
    <section className="mt-6 rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <History className="text-muted-foreground size-4" />
        <h2 className="text-sm font-semibold">Registration audit</h2>
      </div>

      <dl className="grid gap-3">
        <Fact label="Created by">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={SOURCE_TONE[source]}>{SOURCE_LABEL[source]}</StatusBadge>
            {audit.createdByName && <span>{audit.createdByName}</span>}
          </span>
        </Fact>

        <Fact label="Started">
          {startedAt ? formatDateTime(startedAt) : <Unknown />}
        </Fact>

        <Fact label="Completed">
          {audit.completedAt ? (
            <>
              {formatDateTime(audit.completedAt)}
              {elapsed && <span className="text-muted-foreground"> · {elapsed} elapsed</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Not submitted yet</span>
          )}
        </Fact>

        {/* Only meaningful for a returning student, so it's hidden otherwise. */}
        {audit.reopenedAt && (
          <Fact label="Re-registered">{formatDateTime(audit.reopenedAt)}</Fact>
        )}

        <Fact label="Revisions">
          {audit.revision > 0 ? (
            <>
              {audit.revision}
              <span className="text-muted-foreground">
                {audit.revision === 1 ? " (first submit)" : ` submits, ${audit.revision - 1} after the first`}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Never submitted</span>
          )}
        </Fact>

        <Fact label="Last updated">
          {audit.updatedAt ? (
            <>
              {formatDateTime(audit.updatedAt)}
              {audit.updatedByName && (
                <span className="text-muted-foreground"> · by {audit.updatedByName}</span>
              )}
            </>
          ) : (
            <Unknown />
          )}
        </Fact>

        <Fact label="Last IP">
          {audit.lastIp ? <span className="font-mono text-xs">{audit.lastIp}</span> : <Unknown />}
        </Fact>
      </dl>

      {/* The three clocks are easy to conflate, and conflating them produces wrong
          conclusions about a student — so the panel says what each one measures. */}
      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        <strong className="font-medium">Completed</strong> is the first submit, so elapsed is
        wall-clock from the first save — a form left idle for days reads as days, not as time spent
        filling it in. <strong className="font-medium">Last updated</strong> tracks any later change
        to the profile, including staff edits, so it moves independently of Completed.
      </p>

      {audit.events.length > 0 && (
        <div className="mt-5 space-y-2 border-t pt-4">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">History</p>
          {audit.events.map((e) => (
            <div key={e.id} className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <StatusBadge tone={e.event === "reregistered" ? "amber" : "slate"}>
                  {EVENT_LABEL[e.event]}
                  {e.revision ? ` #${e.revision}` : ""}
                </StatusBadge>
                <span className="text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                {/* An admin acting inside a "View as" session — the case a naive
                    audit would have credited to the student. */}
                {e.onBehalf && <StatusBadge tone="rose">Viewed as</StatusBadge>}
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {e.actorKind === "unknown"
                  ? "Actor not recorded (predates auditing)"
                  : e.actorKind === "system"
                    ? "Recorded by the system"
                    : `${e.actorName ?? (e.actorKind === "self" ? "The student" : "Staff")}${
                        e.actorKind === "staff" ? " (staff)" : ""
                      }`}
                {e.ip && <span className="font-mono"> · {e.ip}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
