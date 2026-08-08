"use client";

/**
 * Staff detail — read-only summary first, Edit re-mounts the SAME wizard against
 * the admin endpoints. Exactly the `reviewFirst` pattern in
 * app/mentor/register/mentor-form.tsx:26-32: staff review the record, then click
 * Edit to open the form, rather than landing in an editable form by accident.
 *
 * The verification panel at the top exists because of decision #107 §7.7: we do
 * NOT verify that an email domain belongs to the college, so anyone can *claim*
 * to be faculty anywhere and the reviewer's judgement is the only check. This
 * screen therefore leads with what they need to judge it — the claim, the
 * employee ID, and whether the email looks like it belongs to that college —
 * instead of burying them in the summary.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StaffForm } from "@/app/college-staff/register/staff-form";
import type { StaffStatus } from "@/lib/college-staff-list";

const STATUS_BADGE: Record<StaffStatus, { label: string; cls: string }> = {
  pending_review:    { label: "⏳ Pending approval", cls: "bg-amber-50 text-amber-700" },
  changes_requested: { label: "✏️ Sent back",        cls: "bg-amber-50 text-amber-700" },
  approved:          { label: "✓ Approved",          cls: "bg-emerald-50 text-emerald-700" },
  suspended:         { label: "⛔ Suspended",         cls: "bg-rose-50 text-rose-700" },
  rejected:          { label: "⛔ Not approved",      cls: "bg-rose-50 text-rose-700" },
};

type Outcome = Exclude<StaffStatus, "pending_review">;

export function StaffDetail({
  userId, name, email, status, source, collegeName, employeeCode, designation, canReview, notes,
}: {
  userId: string;
  name: string | null;
  email: string | null;
  status: StaffStatus;
  source: "self" | "invited";
  collegeName: string | null;
  employeeCode: string | null;
  designation: string | null;
  canReview: boolean;
  notes: { body: string; kind: string; created_at: string; resolved_at: string | null }[];
}) {
  const [action, setAction] = useState<Outcome | null>(null);
  const badge = STATUS_BADGE[status];

  const endpoints = {
    profile: `/api/admin/college-staff/${userId}/profile`,
    submit: `/api/admin/college-staff/${userId}/profile/submit`,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/dashboard/college-staff" className="text-muted-foreground text-sm hover:underline">
            ← All staff
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">{name || email || "Staff member"}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold ${badge.cls}`}>
              {badge.label}
            </span>
            <span className="text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium">
              {source === "invited" ? "Invited by staff" : "Self-registered"}
            </span>
          </div>
        </div>

        {canReview && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {status !== "approved" && <Button onClick={() => setAction("approved")}>Approve</Button>}
            {(status === "pending_review" || status === "changes_requested") && (
              <>
                <Button variant="outline" onClick={() => setAction("changes_requested")}>Send back</Button>
                <Button variant="outline" onClick={() => setAction("rejected")}>Reject</Button>
              </>
            )}
            {status === "approved" && (
              <Button variant="outline" onClick={() => setAction("suspended")}>Suspend</Button>
            )}
          </div>
        )}
      </div>

      {/* The judgement panel — only for a claim that hasn't been accepted yet. */}
      {source === "self" && (status === "pending_review" || status === "changes_requested") && (
        <VerificationPanel
          email={email}
          collegeName={collegeName}
          employeeCode={employeeCode}
          designation={designation}
        />
      )}

      {notes.length > 0 && (
        <section className="bg-card rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">Review history</h2>
          <ul className="mt-3 space-y-3">
            {notes.map((n, i) => (
              <li key={i} className="border-l-2 pl-3 text-sm">
                <p className="text-muted-foreground text-xs">
                  {n.created_at.slice(0, 10)} · {n.kind.replace(/_/g, " ")}
                  {n.resolved_at && " · resolved"}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* reviewFirst opens on the read-only summary; the form's own "Edit my
          details" button drops into the wizard from there. */}
      {/* enforceMandatory={false}: an admin correcting someone else's record may
          not know their years of experience, and being stranded on step 1 over it
          would make the record uneditable. The submit API still refuses without
          them. Same reasoning as the student console editor. */}
      <StaffForm endpoints={endpoints} reviewFirst enforceMandatory={false} />

      {canReview && (
        <p className="text-muted-foreground text-center text-xs">
          Use <b>Edit my details</b> in the panel above to correct anything on their behalf.
        </p>
      )}

      {action && (
        <ReviewDialog
          userId={userId}
          name={name || email || "this person"}
          outcome={action}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

/**
 * What a reviewer needs in order to decide, surfaced rather than buried. The
 * email-domain line is a HINT, not a check — we do not store college domains, so
 * it compares the address against the college name and says what it sees.
 */
function VerificationPanel({
  email, collegeName, employeeCode, designation,
}: {
  email: string | null; collegeName: string | null; employeeCode: string | null; designation: string | null;
}) {
  const domain = email?.split("@")[1] ?? null;
  // A crude but honest signal: does any significant word of the college name
  // appear in the domain? Never presented as proof either way.
  const words = (collegeName ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !["college", "institute", "engineering", "university", "technology", "school"].includes(w));
  const looksRelated = !!domain && words.some((w) => domain.toLowerCase().includes(w));

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <h2 className="text-sm font-semibold">Before you approve</h2>
      <p className="mt-1 text-sm">
        Anyone can register claiming to work at a college — we don&rsquo;t verify email domains.
        Check this against your own staff records.
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Claim label="Claims to work at" value={collegeName} />
        <Claim label="As" value={designation} />
        <Claim label="Employee ID" value={employeeCode || "not given"} />
        <Claim
          label="Email domain"
          value={
            domain
              ? looksRelated
                ? `${domain} — looks related to the college name`
                : `${domain} — not obviously the college's domain`
              : "unknown"
          }
        />
      </dl>
    </section>
  );
}

function Claim({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="font-medium break-words">{value || "—"}</dd>
    </div>
  );
}

function ReviewDialog({
  userId, name, outcome, onClose,
}: {
  userId: string; name: string; outcome: Outcome; onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy: Record<Outcome, { title: string; verb: string; body: string }> = {
    approved: {
      title: "Approve", verb: "Approve",
      body: `${name} will get access to this college's students, batches and results, and will be emailed.`,
    },
    changes_requested: {
      title: "Send back for a correction", verb: "Send back",
      body: "They'll be emailed your note and can fix it and resubmit.",
    },
    suspended: {
      title: "Suspend access", verb: "Suspend",
      body: "Their access is revoked immediately. They keep their account and can be approved again later.",
    },
    rejected: {
      title: "Reject", verb: "Reject",
      body: "They won't get access. They'll be emailed your reason.",
    },
  };

  const noteRequired = outcome !== "approved";

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/college-staff/${userId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: outcome, note }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy[outcome].title} — {name}</DialogTitle>
          <DialogDescription>{copy[outcome].body}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="detail-note">
            {noteRequired ? "Reason (sent to them)" : "Note (optional)"}
            {noteRequired && <span className="text-primary"> *</span>}
          </Label>
          <textarea
            id="detail-note"
            className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (noteRequired && !note.trim())}>
            {busy ? "Saving…" : copy[outcome].verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
