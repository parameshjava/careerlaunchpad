"use client";

/**
 * Platform users grid: one row per member and per pending invite. Built on the
 * shared DataTable — search (name / email / college), faceted filters (role,
 * college, status), sortable headers and pagination. Columns: #, Full Name,
 * Email, Phone, Office Email, Role (badges + scoped college), Status, Actions.
 * Actions: Suspend/Reactivate, ✏️ Manage member, 🗑️ delete / revoke invite.
 * Guardrails are enforced in the server actions/RPCs.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, arrIncludes, type DataTableFilter } from "@/components/data-table";
import { SortHeader, StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { ManageMemberDialog } from "./manage-roles-dialog";
import { setUserStatus, resendInvite, revokeInvite, deleteMember } from "./actions";
import { enterImpersonation } from "@/app/impersonation/actions";

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
  canImpersonate: boolean; // owner / platform_admin — "View as user"
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

const STATUS_TONES: Record<string, StatusTone> = {
  active: "emerald",
  suspended: "amber",
  pending: "blue",
};

// Multi-field text search (name / email / scoped colleges) bound to the search box.
const searchFilter: FilterFn<MemberRow> = (row, _id, value) => {
  const t = String(value ?? "").trim().toLowerCase();
  if (!t) return true;
  const r = row.original;
  return (
    (r.fullName ?? "").toLowerCase().includes(t) ||
    r.email.toLowerCase().includes(t) ||
    r.collegeNames.some((c) => c.toLowerCase().includes(t))
  );
};

// Faceted filter over an array-valued cell (roleKeys / collegeNames): keep the row
// when nothing is selected, else when any of its values is selected.
const arrayOverlap: FilterFn<MemberRow> = (row, id, value) => {
  const selected = value as string[] | undefined;
  if (!selected || selected.length === 0) return true;
  const values = (row.getValue(id) as string[]) ?? [];
  return values.some((v) => selected.includes(v));
};

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
  // Distinct role keys + colleges present, for the filter dropdowns.
  const roleKeys = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.roleKeys))).sort(),
    [rows],
  );
  const colleges = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.collegeNames))).sort(),
    [rows],
  );

  const columns = useMemo<ColumnDef<MemberRow>[]>(() => {
    return [
      {
        id: "index",
        header: "#",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.index + 1}</span>,
      },
      {
        accessorKey: "fullName",
        meta: { label: "Full Name" },
        header: ({ column }) => <SortHeader column={column}>Full Name</SortHeader>,
        filterFn: searchFilter,
        cell: ({ row }) => row.original.fullName || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "email",
        meta: { label: "Email Id" },
        header: "Email Id",
        cell: ({ row }) => <span className="break-all">{row.original.email}</span>,
      },
      {
        accessorKey: "phone",
        meta: { label: "Phone No" },
        header: "Phone No",
        cell: ({ row }) => row.original.phone || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "officeEmail",
        meta: { label: "Office Email" },
        header: "Office Email",
        cell: ({ row }) =>
          row.original.officeEmail ? (
            <span className="break-all">{row.original.officeEmail}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "role",
        accessorFn: (r) => r.roleKeys,
        meta: { label: "Role" },
        header: ({ column }) => <SortHeader column={column}>Role</SortHeader>,
        filterFn: arrayOverlap,
        // Sort by the human role label, not the raw key array.
        sortingFn: (a, b) => a.original.roleLabel.localeCompare(b.original.roleLabel),
        cell: ({ row }) => {
          const r = row.original;
          if (!r.roleKeys.length) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap items-center gap-1">
              {r.roleKeys.map((k) => (
                <Badge key={k} variant="secondary">
                  {ROLE_LABELS[k] ?? k}
                </Badge>
              ))}
              {r.collegeNames.length > 0 && (
                <span className="text-muted-foreground text-xs">· {r.collegeNames.join(", ")}</span>
              )}
            </div>
          );
        },
      },
      // Hidden column that backs the College faceted filter (colleges are shown
      // inline in the Role cell, so there's no visible College column).
      {
        id: "college",
        accessorFn: (r) => r.collegeNames,
        enableHiding: false,
        enableSorting: false,
        filterFn: arrayOverlap,
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "status",
        header: "Status",
        filterFn: arrIncludes,
        cell: ({ row }) => (
          <StatusBadge tone={STATUS_TONES[row.original.status] ?? "slate"}>
            {row.original.status === "pending" ? "Pending" : row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <RowActions
            row={row.original}
            caps={caps}
            callerRank={callerRank}
            isOwner={isOwner}
            isSelf={row.original.id === currentUserId}
          />
        ),
      },
    ];
  }, [caps, callerRank, isOwner, currentUserId]);

  const filters = useMemo<DataTableFilter[]>(() => {
    const list: DataTableFilter[] = [
      {
        columnId: "role",
        title: "Role",
        options: roleKeys.map((k) => ({ label: ROLE_LABELS[k] ?? k, value: k })),
      },
    ];
    if (colleges.length > 0) {
      list.push({
        columnId: "college",
        title: "College",
        options: colleges.map((c) => ({ label: c, value: c })),
      });
    }
    list.push({
      columnId: "status",
      title: "Status",
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" },
      ],
    });
    return list;
  }, [roleKeys, colleges]);

  return (
    <DataTable
      columns={columns as ColumnDef<MemberRow, unknown>[]}
      data={rows}
      searchKey="fullName"
      searchPlaceholder="Search name, email or college…"
      filters={filters}
      // The College filter is backed by a hidden column; keep it out of the grid.
      initialColumnVisibility={{ college: false }}
    />
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

  // Provisioned user: view-as, suspend/reactivate, ✏️ manage, 🗑️ delete.
  const suspended = row.status === "suspended";
  // Can't act as an owner/platform admin (server enforces this too).
  const impersonable = !row.roleKeys.some((k) => k === "owner" || k === "platform_admin");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {caps.canImpersonate && !isSelf && impersonable && row.status === "active" && (
        <form action={enterImpersonation.bind(null, row.id)}>
          <Button type="submit" variant="outline" size="sm" title="Open the app as this user">
            View as
          </Button>
        </form>
      )}
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
