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
import { Pencil } from "lucide-react";
import { updateMemberRoles, setMemberOfficeEmail } from "./actions";

// System staff roles + ladder rank (mirrors role.rank; the RPC enforces rules).
const STAFF = [
  { key: "owner", name: "Owner", rank: 3 },
  { key: "platform_admin", name: "Admin", rank: 2 },
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
  user: { id: string; email: string; roleKeys: string[]; officeEmail: string | null };
  callerRank: number;
  isOwner: boolean;
  canOffice: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [office, setOffice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setOffice(user.officeEmail ?? "");
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true); setError(null);
    const keys = STAFF.filter((r) => selected.has(r.key) && !redundant(r.rank)).map((r) => r.key);
    const roleRes = await updateMemberRoles(user.id, keys);
    if (roleRes.error) { setBusy(false); setError(roleRes.error); return; }
    if (canOffice && office.trim() !== (user.officeEmail ?? "")) {
      const offRes = await setMemberOfficeEmail(user.id, office);
      if (offRes.error) { setBusy(false); setError(offRes.error); return; }
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
              {scopedRoles.length > 0 && (
                <p className="text-muted-foreground text-xs">Also holds (via invite): {scopedRoles.join(", ")}</p>
              )}
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
