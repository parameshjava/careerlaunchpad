"use client";

/**
 * Owner/Admin "Manage roles" for a member. Multi-select over the unscoped staff
 * roles with the live redundancy rule (a higher ladder role hides lower ones;
 * Mentor is orthogonal). Saves via updateMemberRoles → set_member_roles(), which
 * re-enforces the escalation + last-owner guardrails in the DB.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { updateMemberRoles } from "./actions";

// System staff roles + ladder rank (source of truth is role.rank in the DB;
// mirrored here for the UI — the RPC enforces the real rules regardless).
const STAFF = [
  { key: "owner", name: "Owner", rank: 3 },
  { key: "platform_admin", name: "Admin", rank: 2 },
  { key: "coordinator", name: "Coordinator", rank: 1 },
  { key: "support", name: "Support Team", rank: 1 },
  { key: "mentor", name: "Mentor (Trainer)", rank: 0 },
] as const;
const STAFF_KEYS = STAFF.map((r) => r.key) as readonly string[];

export function ManageRolesDialog({
  user,
  callerRank,
  isOwner,
}: {
  user: { id: string; email: string; roleKeys: string[] };
  callerRank: number;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(user.roleKeys.filter((k) => STAFF_KEYS.includes(k))),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-staff (scoped) roles the member holds — shown read-only for context.
  const scopedRoles = user.roleKeys.filter((k) => !STAFF_KEYS.includes(k));

  const canAssign = (rank: number) => isOwner || rank < callerRank;

  // Redundancy: the highest selected ladder rank (>=1) hides strictly-lower ones.
  const maxLadder = Math.max(
    0,
    ...STAFF.filter((r) => r.rank >= 1 && selected.has(r.key)).map((r) => r.rank),
  );
  const redundant = (rank: number) => rank >= 1 && rank < maxLadder;

  function toggle(key: string, rank: number, on: boolean) {
    if (!canAssign(rank) || redundant(rank)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save() {
    setBusy(true); setError(null);
    // Drop redundant lower-ladder roles before sending (RPC also normalizes).
    const keys = STAFF.filter((r) => selected.has(r.key) && !redundant(r.rank)).map((r) => r.key);
    const res = await updateMemberRoles(user.id, keys);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setOpen(false);
    router.refresh();
  }

  function openDialog() {
    setSelected(new Set(user.roleKeys.filter((k) => STAFF_KEYS.includes(k))));
    setError(null);
    setOpen(true);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>Manage roles</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage roles</DialogTitle>
            <DialogDescription className="break-words">{user.email}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2.5 py-1">
            {STAFF.map((r) => {
              const checked = selected.has(r.key) && !redundant(r.rank);
              const disabled = !canAssign(r.rank) || redundant(r.rank);
              return (
                <label
                  key={r.key}
                  className={`flex items-center gap-3 rounded-md border p-2.5 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted/50"}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => toggle(r.key, r.rank, !!v)}
                  />
                  <span className="text-sm font-medium">{r.name}</span>
                  {redundant(r.rank) && (
                    <span className="text-muted-foreground ml-auto text-xs">included in a higher role</span>
                  )}
                  {!canAssign(r.rank) && !redundant(r.rank) && (
                    <span className="text-muted-foreground ml-auto text-xs">owner only</span>
                  )}
                </label>
              );
            })}

            {scopedRoles.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Also holds (managed via invite): {scopedRoles.join(", ")}
              </p>
            )}
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save roles"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
