"use client";

/**
 * Platform users grid: one row per member and per pending invite. Built on the
 * shared DataTable — search (name / email / college), faceted filters (role,
 * college, status), sortable headers and pagination. Columns: #, Full Name,
 * Email, Phone, Office Email, Role (badges + scoped college), Status, Actions.
 * Actions collapse into a single ⋯ menu (Manage roles & profile, View as,
 * Suspend/Reactivate, Remove — or Resend/Revoke for invites) so the column
 * stays one line. Guardrails are enforced in the server actions/RPCs.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, arrIncludes, type DataTableFilter } from "@/components/data-table";
import { SortHeader, StatusBadge, type StatusTone } from "@/components/data-table-parts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ManageMemberDialog } from "./manage-roles-dialog";
import { setUserStatus, resendInvite, revokeInvite, deleteMember, activateInvite } from "./actions";
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
  canInvite: boolean; // user.invite — also gates editing a pending invite
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Run a FormData server action (suspend / resend / revoke), then refresh.
  const submit = (action: (fd: FormData) => Promise<void>, fields: Record<string, string>) =>
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      await action(fd);
      router.refresh();
    });

  // The ConfirmDialog owns busy/error for delete.
  async function onDelete() {
    const res = await deleteMember(row.id);
    if (res.error) throw new Error(res.error);
    router.refresh();
  }

  // Activate a pending invite now (provision the account without first sign-in).
  async function onActivate() {
    const res = await activateInvite(row.id);
    if (res.error) throw new Error(res.error);
    router.refresh();
  }

  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" className="size-8 p-0">
        <span className="sr-only">Open menu</span>
        <MoreHorizontal className="size-4" />
      </Button>
    </DropdownMenuTrigger>
  );

  // Pending invite: activate / resend / revoke.
  if (row.kind === "invite") {
    if (!caps.canResend) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex justify-end">
        <DropdownMenu>
          {trigger}
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Invite</DropdownMenuLabel>
            {/* Provision the account now instead of waiting for first sign-in. */}
            {caps.canInvite && (
              <DropdownMenuItem onClick={() => setActivateOpen(true)}>
                Activate now
              </DropdownMenuItem>
            )}
            {/* Mentor invites carry an editable staged profile — let admins fix
                details before the mentor signs in. */}
            {caps.canInvite && row.roleKeys.includes("mentor") && (
              <DropdownMenuItem onClick={() => router.push(`/dashboard/users/add-mentor?invite=${row.id}`)}>
                Edit details
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => submit(resendInvite, { id: row.id })}>
              Resend invite
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => submit(revokeInvite, { id: row.id })}
            >
              Revoke invite
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ConfirmDialog
          open={activateOpen}
          onOpenChange={setActivateOpen}
          title="Activate now"
          description={
            <>
              Activate <span className="text-foreground font-semibold">{row.email}</span> now? Their
              account is created immediately with the invited role, so they appear as active without
              waiting to sign in. They can still sign in anytime with this email.
            </>
          }
          confirmLabel="Activate"
          onConfirm={onActivate}
        />
      </div>
    );
  }

  // Provisioned user: manage, view-as, suspend/reactivate, remove — one menu.
  const suspended = row.status === "suspended";
  // Can't act as an owner/platform admin (server enforces this too).
  const impersonable = !row.roleKeys.some((k) => k === "owner" || k === "platform_admin");
  const showImpersonate = caps.canImpersonate && !isSelf && impersonable && row.status === "active";
  const showSuspend = caps.canSuspend && !isSelf;
  const showManage = caps.canAssignRoles;
  const showDelete = caps.canDelete && !isSelf;

  if (!showImpersonate && !showSuspend && !showManage && !showDelete)
    return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        {trigger}
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {showManage && (
            <DropdownMenuItem onClick={() => setManageOpen(true)}>Manage roles &amp; profile</DropdownMenuItem>
          )}
          {showImpersonate && (
            <DropdownMenuItem onClick={() => enterImpersonation(row.id)}>View as user</DropdownMenuItem>
          )}
          {showSuspend && (
            <DropdownMenuItem
              onClick={() => submit(setUserStatus, { id: row.id, status: suspended ? "active" : "suspended" })}
            >
              {suspended ? "Reactivate" : "Suspend"}
            </DropdownMenuItem>
          )}
          {showDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                Remove member
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showManage && (
        <ManageMemberDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          user={{ id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, roleKeys: row.roleKeys, officeEmail: row.officeEmail, collegeAdmin: row.collegeAdmin }}
          callerRank={callerRank}
          isOwner={isOwner}
          canOffice={caps.canOffice}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title="Remove member"
        description={<>Remove <span className="text-foreground font-semibold">{row.fullName || row.email}</span>? They&apos;ll lose access (reversible by an owner).</>}
        confirmLabel="Remove"
        onConfirm={onDelete}
      />
    </div>
  );
}
