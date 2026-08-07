"use client";

/**
 * The College Staff roster — one screen, five folder tabs (Pending · Approved ·
 * Invited · Suspended · Not approved). Reused verbatim as the "College staff"
 * tab in the Team hub, so platform-side people management stays in one place
 * without a second table.
 *
 * Every action here is advisory UI: the real gate is
 * set_college_staff_status() / revoke_college_staff_invite(), both scoped in the
 * DB to the reviewer's own college.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { StaffRow, StaffInviteRow, StaffStatus, CollegeMemberRow } from "@/lib/college-staff-list";
import { revokeStaffInvite, removeCollegeMember } from "./actions";

const TAB_CLS =
  "-mb-px h-auto flex-none rounded-t-md rounded-b-none border border-border bg-muted! px-4 py-2 font-medium text-muted-foreground shadow-none transition-colors after:hidden hover:bg-muted/70 " +
  "data-active:border-primary! data-active:border-b-0 data-active:bg-primary! data-active:text-primary-foreground! data-active:font-semibold data-active:shadow-none";

const STATUS_BADGE: Record<StaffStatus, { label: string; cls: string }> = {
  pending_review:    { label: "Pending",      cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  changes_requested: { label: "Sent back",    cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  approved:          { label: "Approved",     cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  suspended:         { label: "Suspended",    cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  rejected:          { label: "Not approved", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export type StaffTab = "pending" | "approved" | "admins" | "invited" | "suspended" | "rejected";

type Action = { userId: string; name: string; status: StaffStatus } | null;

export function StaffConsole({
  rows, invites, admins, canReview, canInvite, showCollege, defaultTab,
}: {
  rows: StaffRow[];
  invites: StaffInviteRow[];
  /** The college's ADMINS (178). Visible, but a college admin cannot remove a
   *  peer — only the platform can, so no action is offered on these rows. */
  admins: CollegeMemberRow[];
  canReview: boolean;
  canInvite: boolean;
  /** Platform admins span colleges, so the grid needs the column; a college
   * admin sees one college and doesn't. */
  showCollege: boolean;
  defaultTab: StaffTab;
}) {
  const [action, setAction] = useState<Action>(null);

  // A sent-back registration is still awaiting the reviewer's attention once the
  // person resubmits, so it shares the Pending queue rather than hiding.
  const pending = rows.filter((r) => r.status === "pending_review" || r.status === "changes_requested");
  const approved = rows.filter((r) => r.status === "approved");
  const suspended = rows.filter((r) => r.status === "suspended");
  const rejected = rows.filter((r) => r.status === "rejected");

  const tabs: { value: StaffTab; label: string; count: number }[] = [
    { value: "pending", label: "Pending approval", count: pending.length },
    { value: "approved", label: "Approved", count: approved.length },
    { value: "admins", label: "Admins", count: admins.length },
    { value: "invited", label: "Invited", count: invites.length },
    { value: "suspended", label: "Suspended", count: suspended.length },
    { value: "rejected", label: "Not approved", count: rejected.length },
  ];

  return (
    <>
      <Tabs defaultValue={defaultTab}>
        <TabsList
          variant="line"
          className="group-data-horizontal/tabs:h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b p-0"
        >
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={TAB_CLS}>
              {t.label} ({t.count})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="pending" className="mt-4 min-w-0">
          <Panel
            note="Staff who registered themselves. Open one to check their claim against your own records — anyone can say they work here, so your approval is the only check. Invited staff never appear here; they're approved on arrival."
            empty="Nobody is waiting for approval." count={pending.length}
          >
            <StaffTable rows={pending} showCollege={showCollege} canReview={canReview} onAct={setAction} />
          </Panel>
        </TabsContent>

        <TabsContent value="approved" className="mt-4 min-w-0">
          <Panel empty="No approved staff yet." count={approved.length}>
            <StaffTable rows={approved} showCollege={showCollege} canReview={canReview} onAct={setAction} />
          </Panel>
        </TabsContent>

        <TabsContent value="admins" className="mt-4 min-w-0">
          <Panel
            note="College admins for this college — they can approve staff and invite others. Removing an admin is a CareerLaunchpad action, so there's no remove here."
            empty="No college admins yet."
            count={admins.length}
          >
            <AdminTable rows={admins} showCollege={showCollege} />
          </Panel>
        </TabsContent>

        <TabsContent value="invited" className="mt-4 min-w-0">
          <Panel
            note="Invited but not signed in yet. Their details are already filled in and they're approved the moment they sign in."
            empty="No pending invites." count={invites.length}
          >
            <InviteTable rows={invites} showCollege={showCollege} canInvite={canInvite} />
          </Panel>
        </TabsContent>

        <TabsContent value="suspended" className="mt-4 min-w-0">
          <Panel note="Access is revoked while suspended — they can sign in but see nothing." empty="Nobody is suspended." count={suspended.length}>
            <StaffTable rows={suspended} showCollege={showCollege} canReview={canReview} onAct={setAction} />
          </Panel>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4 min-w-0">
          <Panel empty="No rejected registrations." count={rejected.length}>
            <StaffTable rows={rejected} showCollege={showCollege} canReview={canReview} onAct={setAction} />
          </Panel>
        </TabsContent>
      </Tabs>

      {action && <ReviewDialog action={action} onClose={() => setAction(null)} />}
    </>
  );
}

function Panel({ note, empty, count, children }: {
  note?: string; empty: string; count: number; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
        {count > 0 ? children : (
          <div className="text-muted-foreground bg-muted/40 rounded-lg border px-4 py-10 text-center text-sm">
            {empty}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The roster grid. Hand-rolled rather than DataTable because the useful mobile
 * shape here is a stacked card, not a scrolling grid — a reviewer on a phone
 * needs the name, the claim and the two buttons, not fourteen columns.
 */
function StaffTable({
  rows, showCollege, canReview, onAct,
}: {
  rows: StaffRow[]; showCollege: boolean; canReview: boolean; onAct: (a: Action) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-3 [&>li]:min-w-0">
      {rows.map((r) => {
        const badge = STATUS_BADGE[r.status];
        return (
          <li key={r.userId} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/college-staff/${r.userId}`} className="font-semibold hover:underline">
                    {r.name || r.email || "Unnamed"}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ring-inset ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-[0.7rem] font-medium">
                    {r.source === "invited" ? "Invited" : "Self-registered"}
                  </span>
                  {!r.submitted && (
                    <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-[0.7rem] font-medium">
                      Form incomplete
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 truncate text-sm">{r.email}</p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {[r.designation, r.department].filter(Boolean).join(" · ") || "No designation given"}
                  {r.yearsTeaching != null && ` · ${r.yearsTeaching} yrs teaching`}
                </p>
                {showCollege && r.college && (
                  <p className="text-muted-foreground mt-0.5 text-xs">{r.college}</p>
                )}
                {r.teachingSubjects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.teachingSubjects.slice(0, 4).map((s) => (
                      <span key={s} className="bg-muted rounded-full px-2 py-0.5 text-xs">{s}</span>
                    ))}
                    {r.teachingSubjects.length > 4 && (
                      <span className="text-muted-foreground px-1 text-xs">+{r.teachingSubjects.length - 4}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/college-staff/${r.userId}`}>Open</Link>
                </Button>
                {canReview && r.status !== "approved" && (
                  <Button size="sm" onClick={() => onAct({ userId: r.userId, name: r.name || r.email, status: "approved" })}>
                    Approve
                  </Button>
                )}
                {canReview && (r.status === "pending_review" || r.status === "changes_requested") && (
                  <Button size="sm" variant="outline"
                    onClick={() => onAct({ userId: r.userId, name: r.name || r.email, status: "changes_requested" })}>
                    Send back
                  </Button>
                )}
                {canReview && r.status === "approved" && (
                  <Button size="sm" variant="outline"
                    onClick={() => onAct({ userId: r.userId, name: r.name || r.email, status: "suspended" })}>
                    Suspend
                  </Button>
                )}
                {canReview && r.status !== "rejected" && (
                  <RemoveButton row={r} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The college's admins. Read-only on purpose: a College Admin may invite a peer
 * (178) but not unseat one — remove_college_member refuses an admin target for a
 * college-scoped caller, so offering the button here would only produce an error.
 */
function AdminTable({ rows, showCollege }: { rows: CollegeMemberRow[]; showCollege: boolean }) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-2 [&>li]:min-w-0">
      {rows.map((a) => (
        <li key={a.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{a.name || a.email}</p>
            <p className="text-muted-foreground truncate text-xs">
              {a.email}
              {showCollege && a.college ? ` · ${a.college}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.7rem] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
              College Admin
            </span>
            {a.accountStatus === "suspended" && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.7rem] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                suspended
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Revoke a staff member's access. Confirms first — it is not reversible from here. */
function RemoveButton({ row }: { row: StaffRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    const res = await removeCollegeMember(row.userId, row.collegeId, note);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        Remove
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remove {row.name || row.email}</DialogTitle>
              <DialogDescription>
                Their access to this college is revoked immediately and their registration is
                closed. They keep their account, and can register again later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="remove-note">Reason (sent to them)</Label>
              <textarea
                id="remove-note"
                className="border-input bg-background min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. No longer with the college."
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !note.trim()}>
                {busy ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function InviteTable({
  rows, showCollege, canInvite,
}: {
  rows: StaffInviteRow[]; showCollege: boolean; canInvite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (rows.length === 0) return null;

  return (
    <>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <ul className="grid gap-3 [&>li]:min-w-0">
        {rows.map((r) => (
          <li key={r.inviteId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name || r.email}</p>
              {r.name && <p className="text-muted-foreground truncate text-sm">{r.email}</p>}
              <p className="text-muted-foreground mt-0.5 text-xs">
                {r.roleKey === "college_admin" ? "College Admin" : "College Staff"} · invited{" "}
                {r.createdAt}
                {showCollege && r.college && ` · ${r.college}`}
              </p>
            </div>
            {canInvite && (
              <div className="flex shrink-0 gap-2">
                {r.roleKey === "college_staff" && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/college-staff/new?invite=${r.inviteId}`}>Edit</Link>
                  </Button>
                )}
                <Button
                  variant="outline" size="sm" disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await revokeStaffInvite(r.inviteId);
                      if (res.error) setError(res.error);
                      else router.refresh();
                    })
                  }
                >
                  Revoke
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Confirm + capture the reason. A reason is REQUIRED for anything other than an
 * approval, and is emailed verbatim — the API enforces the same rule, because a
 * send-back with no explanation is exactly the thing that generates a support
 * email to us.
 */
function ReviewDialog({ action, onClose }: { action: NonNullable<Action>; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = {
    approved:          { title: "Approve", verb: "Approve", body: `${action.name} will get access to this college's students, batches and results, and will be emailed.` },
    changes_requested: { title: "Send back for a correction", verb: "Send back", body: "They'll be emailed your note and can fix it and resubmit." },
    suspended:         { title: "Suspend access", verb: "Suspend", body: "Their access is revoked immediately. They keep their account and can be approved again later." },
    rejected:          { title: "Reject", verb: "Reject", body: "They won't get access. They'll be emailed your reason." },
    pending_review:    { title: "Move back to pending", verb: "Update", body: "" },
  }[action.status];

  const noteRequired = action.status !== "approved" && action.status !== "pending_review";

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/college-staff/${action.userId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action.status, note }),
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
          <DialogTitle>{copy.title} — {action.name}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="review-note">
            {noteRequired ? "Reason (sent to them)" : "Note (optional)"}
            {noteRequired && <span className="text-primary"> *</span>}
          </Label>
          <textarea
            id="review-note"
            className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action.status === "changes_requested"
                ? "e.g. You've selected the wrong college — please pick Alpha Engineering College."
                : "A short reason."
            }
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (noteRequired && !note.trim())}>
            {busy ? "Saving…" : copy.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
