"use client";

/**
 * "Manage member" (✏️) for a platform user: multi-select roles with the live
 * redundancy rule (a higher ladder role hides lower ones; Mentor orthogonal),
 * plus an optional office email. Roles save via updateMemberRoles →
 * set_member_roles() (escalation + last-owner guards); office email via
 * setMemberOfficeEmail (notification_email, user.manage).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, X } from "lucide-react";
import { CollegePicker } from "@/components/colleges/college-picker";
import {
  updateMemberRoles,
  setMemberOfficeEmail,
  updateMemberProfile,
  setCollegeAdmin,
} from "./actions";

// System staff roles + ladder rank (mirrors role.rank; the RPC enforces rules).
const STAFF = [
  { key: "owner", name: "Owner", rank: 3 },
  { key: "platform_admin", name: "Platform Admin", rank: 2 },
  { key: "coordinator", name: "Coordinator", rank: 1 },
  { key: "support", name: "Support Team", rank: 1 },
  { key: "mentor", name: "Mentor (Trainer)", rank: 0 },
] as const;
const STAFF_KEYS = STAFF.map((r) => r.key) as readonly string[];

export function ManageMemberDialog({
  user,
  callerRank,
  isOwner,
  canOffice,
}: {
  user: { id: string; email: string; fullName: string | null; phone: string | null; roleKeys: string[]; officeEmail: string | null; collegeAdmin: { id: string; name: string }[] };
  callerRank: number;
  isOwner: boolean;
  canOffice: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [office, setOffice] = useState("");
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // user.manage gates editing profile fields + office email; roles use their own guard.
  const canEditProfile = canOffice;

  const scopedRoles = user.roleKeys.filter((k) => !STAFF_KEYS.includes(k));
  const canAssign = (rank: number) => isOwner || rank < callerRank;
  const maxLadder = Math.max(0, ...STAFF.filter((r) => r.rank >= 1 && selected.has(r.key)).map((r) => r.rank));
  const redundant = (rank: number) => rank >= 1 && rank < maxLadder;

  function toggle(key: string, rank: number, on: boolean) {
    if (!canAssign(rank) || redundant(rank)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }

  function openDialog() {
    setSelected(new Set(user.roleKeys.filter((k) => STAFF_KEYS.includes(k))));
    setFullName(user.fullName ?? "");
    setPhone(user.phone ?? "");
    setOffice(user.officeEmail ?? "");
    setAdmins(user.collegeAdmin);
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true); setError(null);
    const fail = (msg: string) => { setBusy(false); setError(msg); };

    if (canEditProfile && (fullName.trim() !== (user.fullName ?? "") || phone.trim() !== (user.phone ?? ""))) {
      const res = await updateMemberProfile(user.id, fullName, phone);
      if (res.error) return fail(res.error);
    }

    const keys = STAFF.filter((r) => selected.has(r.key) && !redundant(r.rank)).map((r) => r.key);
    const roleRes = await updateMemberRoles(user.id, keys);
    if (roleRes.error) return fail(roleRes.error);

    // College Admin access: grant newly-added colleges, revoke removed ones.
    const origIds = new Set(user.collegeAdmin.map((a) => a.id));
    const nowIds = new Set(admins.map((a) => a.id));
    for (const a of admins) {
      if (!origIds.has(a.id)) {
        const r = await setCollegeAdmin(user.id, a.id, true);
        if (r.error) return fail(r.error);
      }
    }
    for (const a of user.collegeAdmin) {
      if (!nowIds.has(a.id)) {
        const r = await setCollegeAdmin(user.id, a.id, false);
        if (r.error) return fail(r.error);
      }
    }

    if (canOffice && office.trim() !== (user.officeEmail ?? "")) {
      const offRes = await setMemberOfficeEmail(user.id, office);
      if (offRes.error) return fail(offRes.error);
    }

    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} title="Manage member">
        <Pencil className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage member</DialogTitle>
            <DialogDescription className="break-words">{user.email}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            {canEditProfile && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="mm-name">Full name</Label>
                  <Input id="mm-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mm-phone">Phone</Label>
                  <Input id="mm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" />
                </div>
              </div>
            )}

            <div className="grid gap-2.5">
              <Label>Roles</Label>
              {STAFF.map((r) => {
                const checked = selected.has(r.key) && !redundant(r.rank);
                const disabled = !canAssign(r.rank) || redundant(r.rank);
                return (
                  <label key={r.key} className={`flex items-center gap-3 rounded-md border p-2.5 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted/50"}`}>
                    <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => toggle(r.key, r.rank, !!v)} />
                    <span className="text-sm font-medium">{r.name}</span>
                    {redundant(r.rank) && <span className="text-muted-foreground ml-auto text-xs">included in a higher role</span>}
                    {!canAssign(r.rank) && !redundant(r.rank) && <span className="text-muted-foreground ml-auto text-xs">owner only</span>}
                  </label>
                );
              })}
              {scopedRoles.filter((k) => k !== "college_admin").length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Also holds: {scopedRoles.filter((k) => k !== "college_admin").join(", ")}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>College Admin access</Label>
              {admins.length > 0 ? (
                <ul className="grid gap-1.5">
                  {admins.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{a.name}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setAdmins((prev) => prev.filter((x) => x.id !== a.id))}
                        title="Remove"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-xs">Not a College Admin of any college.</p>
              )}
              {/* Add a college → grants a scoped College Admin role on save. */}
              <CollegePicker
                value={null}
                label={null}
                onChange={(c) =>
                  c &&
                  setAdmins((prev) =>
                    prev.some((x) => x.id === c.id) ? prev : [...prev, { id: c.id, name: c.name }],
                  )
                }
              />
            </div>

            {canOffice && (
              <div className="grid gap-1.5">
                <Label htmlFor="office-email">Office email <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="office-email"
                  type="email"
                  placeholder="name@careerlaunchpad.ai"
                  value={office}
                  onChange={(e) => setOffice(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">Notifications also go here, in addition to their personal email.</p>
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
