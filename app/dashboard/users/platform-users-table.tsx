"use client";

/**
 * Platform users grid: one row per member and per pending invite, with a toolbar
 * to search + filter (role, college, status) + sort. Columns: #, Full Name,
 * Email, Phone, Office Email, Role (badges + scoped college), Status, Actions.
 * Actions: Suspend/Reactivate, ✏️ Manage member, 🗑️ delete / revoke invite.
 * Guardrails are enforced in the server actions/RPCs.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /** Names of the colleges this member's roles are scoped to (college admins). */
  collegeNames: string[];
  /** Colleges this member is a College Admin of (id + name) — editable in Manage. */
  collegeAdmin: { id: string; name: string }[];
  status: "active" | "suspended" | "pending";
};

export type Caps = {
  canAssignRoles: boolean;
  canSuspend: boolean;
  canDelete: boolean; // user.manage
  canOffice: boolean; // user.manage
  canResend: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  platform_admin: "Platform Admin",
  college_admin: "College Admin",
  coordinator: "Coordinator",
  support: "Support",
  mentor: "Mentor",
  employer: "Employer",
  student: "Student",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

const cell = "border-border border px-3 py-2 align-middle";

type Sort = "default" | "name" | "role";

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
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [college, setCollege] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("default");

  // Distinct role keys + colleges present, for the filter dropdowns.
  const roleKeys = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.roleKeys))).sort(),
    [rows],
  );
  const colleges = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.collegeNames))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!t ||
          (r.fullName ?? "").toLowerCase().includes(t) ||
          r.email.toLowerCase().includes(t) ||
          r.collegeNames.some((c) => c.toLowerCase().includes(t))) &&
        (role === "all" || r.roleKeys.includes(role)) &&
        (college === "all" || r.collegeNames.includes(college)) &&
        (statusFilter === "all" || r.status === statusFilter),
    );
    if (sort === "name")
      return [...list].sort((a, b) =>
        (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
      );
    if (sort === "role")
      return [...list].sort((a, b) => a.roleLabel.localeCompare(b.roleLabel));
    return list; // default = incoming order (newest first)
  }, [rows, query, role, college, statusFilter, sort]);

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 p-1 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search name, email or college…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roleKeys.map((k) => (
              <SelectItem key={k} value={k}>
                {ROLE_LABELS[k] ?? k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {colleges.length > 0 && (
          <Select value={college} onValueChange={setCollege}>
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="College" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All colleges</SelectItem>
              {colleges.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Newest first</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="role">Role</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs sm:ml-auto">
          {filtered.length} of {rows.length}
        </span>
      </div>

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
            {filtered.length === 0 && (
              <tr>
                <td className={`${cell} text-muted-foreground text-center`} colSpan={8}>
                  No users match.
                </td>
              </tr>
            )}
            {filtered.map((r, i) => (
              <tr key={`${r.kind}-${r.id}`} className="hover:bg-muted/30">
                <td className={`${cell} text-muted-foreground tabular-nums`}>{i + 1}</td>
                <td className={cell}>{r.fullName || <span className="text-muted-foreground">—</span>}</td>
                <td className={`${cell} break-all`}>{r.email}</td>
                <td className={cell}>{r.phone || <span className="text-muted-foreground">—</span>}</td>
                <td className={`${cell} break-all`}>
                  {r.officeEmail || <span className="text-muted-foreground">—</span>}
                </td>
                <td className={cell}>
                  {r.roleKeys.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {r.roleKeys.map((k) => (
                        <Badge key={k} variant="secondary">
                          {ROLE_LABELS[k] ?? k}
                        </Badge>
                      ))}
                      {r.collegeNames.length > 0 && (
                        <span className="text-muted-foreground text-xs">
                          · {r.collegeNames.join(", ")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
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
          user={{ id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, roleKeys: row.roleKeys, officeEmail: row.officeEmail, collegeAdmin: row.collegeAdmin }}
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
