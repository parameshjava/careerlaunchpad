"use client";

/**
 * Excel-style Platform users grid: one row per member and per pending invite.
 * Columns: #, Full Name, Email, Phone, Office Email, Role, Status, Actions.
 * Actions: Suspend/Reactivate, ✏️ Manage member (roles + office email), 🗑️ delete
 * (revoke for pending invites). Guardrails are enforced in the server actions/RPCs.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ManageMemberDialog } from "./manage-roles-dialog";
import { setUserStatus, resendInvite, revokeInvite, deleteMember } from "./actions";

export type MemberRow = {
  kind: "user" | "invite";
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  officeEmail: string | null;
  roleKeys: string[];
  roleLabel: string;
  status: "active" | "suspended" | "pending";
};

export type Caps = {
  canAssignRoles: boolean;
  canSuspend: boolean;
  canDelete: boolean; // user.manage
  canOffice: boolean; // user.manage
  canResend: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

const cell = "border-border border px-3 py-2 align-middle";

export function PlatformUsersTable({
  rows,
  caps,
  callerRank,
  isOwner,
  currentUserId,
}: {
  rows: MemberRow[];
  caps: Caps;
  callerRank: number;
  isOwner: boolean;
  currentUserId: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60 text-left">
            <th className={`${cell} w-12 font-semibold`}>#</th>
            <th className={`${cell} font-semibold`}>Full Name</th>
            <th className={`${cell} font-semibold`}>Email Id</th>
            <th className={`${cell} font-semibold`}>Phone No</th>
            <th className={`${cell} font-semibold`}>Office Email</th>
            <th className={`${cell} font-semibold`}>Role</th>
            <th className={`${cell} font-semibold`}>Status</th>
            <th className={`${cell} font-semibold`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className={`${cell} text-muted-foreground text-center`} colSpan={8}>No platform users yet.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={`${r.kind}-${r.id}`} className="hover:bg-muted/30">
              <td className={`${cell} text-muted-foreground tabular-nums`}>{i + 1}</td>
              <td className={cell}>{r.fullName || <span className="text-muted-foreground">—</span>}</td>
              <td className={`${cell} break-all`}>{r.email}</td>
              <td className={cell}>{r.phone || <span className="text-muted-foreground">—</span>}</td>
              <td className={`${cell} break-all`}>{r.officeEmail || <span className="text-muted-foreground">—</span>}</td>
              <td className={cell}>{r.roleLabel || <span className="text-muted-foreground">—</span>}</td>
              <td className={cell}>
                <Badge variant="secondary" className={STATUS_STYLES[r.status] ?? ""}>
                  {r.status === "pending" ? "Pending" : r.status}
                </Badge>
              </td>
              <td className={cell}>
                <RowActions row={r} caps={caps} callerRank={callerRank} isOwner={isOwner} isSelf={r.id === currentUserId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  row, caps, callerRank, isOwner, isSelf,
}: {
  row: MemberRow; caps: Caps; callerRank: number; isOwner: boolean; isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const what = row.kind === "invite" ? "Revoke this invite?" : `Delete ${row.fullName || row.email}? They'll lose access (reversible by an owner).`;
    if (!confirm(what)) return;
    setBusy(true);
    const res = await deleteMember(row.id); // users only; invites use the form below
    setBusy(false);
    if (res.error) { alert(res.error); return; }
    router.refresh();
  }

  // Pending invite: resend + revoke.
  if (row.kind === "invite") {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {caps.canResend && (
          <form action={resendInvite}>
            <input type="hidden" name="id" value={row.id} />
            <Button type="submit" variant="outline" size="sm">Resend</Button>
          </form>
        )}
        {caps.canResend && (
          <form action={revokeInvite}>
            <input type="hidden" name="id" value={row.id} />
            <Button type="submit" variant="ghost" size="sm" title="Revoke invite">
              <Trash2 className="size-3.5" />
            </Button>
          </form>
        )}
      </div>
    );
  }

  // Provisioned user: suspend/reactivate, ✏️ manage, 🗑️ delete.
  const suspended = row.status === "suspended";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {caps.canSuspend && !isSelf && (
        <form action={setUserStatus}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
          <Button type="submit" variant="outline" size="sm">{suspended ? "Reactivate" : "Suspend"}</Button>
        </form>
      )}
      {caps.canAssignRoles && (
        <ManageMemberDialog
          user={{ id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, roleKeys: row.roleKeys, officeEmail: row.officeEmail }}
          callerRank={callerRank}
          isOwner={isOwner}
          canOffice={caps.canOffice}
        />
      )}
      {caps.canDelete && !isSelf && (
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy} title="Delete member" className="text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
