"use client";

// Mentor review grid: filter by vetting status, then approve / suspend each
// mentor. Cards (not a wide table) so it reflows cleanly on mobile — the
// console must never scroll sideways. Actions call the server action, which
// goes through set_mentor_status() (RLS-enforced).
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { MentorRow, MentorStatus } from "@/lib/mentors-query";
import { setMentorStatus } from "@/app/dashboard/mentors/actions";

const KIND_LABEL: Record<string, string> = {
  student_alumni: "Alumnus / placed student",
  professional: "External professional",
  staff: "Staff",
};

const STATUS_META: Record<MentorStatus, { label: string; cls: string }> = {
  pending_review: { label: "Pending review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  suspended: { label: "Suspended", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const TABS: { key: MentorStatus | "all"; label: string }[] = [
  { key: "pending_review", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "suspended", label: "Suspended" },
  { key: "all", label: "All" },
];

export function MentorReviewTable({ mentors, canReview }: { mentors: MentorRow[]; canReview: boolean }) {
  const [tab, setTab] = useState<MentorStatus | "all">("pending_review");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const counts = mentors.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  const rows = tab === "all" ? mentors : mentors.filter((m) => m.status === tab);

  function act(userId: string, status: "approved" | "suspended" | "pending_review") {
    setBusy(userId);
    startTransition(async () => {
      try {
        await setMentorStatus(userId, status);
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.key === "all" ? mentors.length : (counts[t.key] ?? 0);
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                active ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:border-primary/50"
              }`}
            >
              {t.label} <span className={active ? "opacity-80" : "text-muted-foreground"}>({n})</span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="bg-muted/40 text-muted-foreground rounded-lg border px-4 py-10 text-center text-sm">
          No mentors here yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((m) => {
            const meta = STATUS_META[m.status];
            const isBusy = pending && busy === m.userId;
            return (
              <div key={m.userId} className="bg-card rounded-2xl border p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{m.name || "Unnamed mentor"}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {!m.registered && (
                        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[0.7rem]">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate text-sm">{m.email}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {KIND_LABEL[m.kind] ?? m.kind}
                      {m.college ? ` · ${m.college}` : ""}
                      {m.graduationYear ? ` · ${m.graduationYear}` : ""}
                    </p>
                  </div>

                  {canReview && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {m.status !== "approved" && (
                        <Button size="sm" disabled={isBusy} onClick={() => act(m.userId, "approved")}>
                          Approve
                        </Button>
                      )}
                      {m.status !== "suspended" && (
                        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => act(m.userId, "suspended")}>
                          Suspend
                        </Button>
                      )}
                      {m.status !== "pending_review" && (
                        <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => act(m.userId, "pending_review")}>
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 border-t pt-3 text-sm sm:grid-cols-2">
                  {m.currentRole && <Detail label="Current role" value={m.currentRole} />}
                  {m.industry && <Detail label="Industry" value={m.industry} />}
                  {m.experience != null && <Detail label="Experience" value={`${m.experience} yrs`} />}
                  {m.mode && <Detail label="Mode" value={m.mode} />}
                  {m.contribution && <Detail label="Contribution" value={m.contribution} />}
                </dl>

                {(m.mentoringAreas.length > 0 || m.skills.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {m.mentoringAreas.length > 0 && <ChipRow label="Mentoring" items={m.mentoringAreas} />}
                    {m.skills.length > 0 && <ChipRow label="Skills" items={m.skills} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</span>
      {items.map((it) => (
        <span key={it} className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">{it}</span>
      ))}
    </div>
  );
}
