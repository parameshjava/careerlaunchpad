import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { InviteDialog } from "./invite-dialog";
import { PlatformUsersTable, type MemberRow, type Caps } from "./platform-users-table";

// Privilege ladder (mirrors role.rank) for the caller's assign reach.
const ROLE_RANK: Record<string, number> = { owner: 3, platform_admin: 2, coordinator: 1, support: 1 };

type Role = { key?: string; name?: string };
const one = <T,>(r: T | T[] | null | undefined): T | null => (Array.isArray(r) ? r[0] ?? null : r ?? null);

export default async function UsersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  const canInvite = can(ctx, "user.invite");
  const canResend = can(ctx, "invite.resend") || canInvite;
  const canViewUsers = can(ctx, "user.view");
  if (!canViewUsers && !canInvite && !canResend) redirect("/dashboard");

  const caps: Caps = {
    canAssignRoles: can(ctx, "role.assign"),
    canSuspend: can(ctx, "user.suspend"),
    canDelete: can(ctx, "user.manage"),
    canOffice: can(ctx, "user.manage"),
    canResend,
  };
  const isOwner = ctx.permissions.has("*") || ctx.roles.includes("owner");
  const callerRank = Math.max(0, ...ctx.roles.map((r) => ROLE_RANK[r] ?? 0));

  const supabase = await createClient();
  const [{ data: employers }, { data: invites }, { data: users, error: usersError }] = await Promise.all([
    supabase.from("employer").select("id, name").order("name"),
    supabase
      .from("invite")
      .select("id, email, status, created_at, role:role_id(key,name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("app_user")
      .select("id, email, status, full_name, phone, user_role(role:role_id(key,name)), notification_email(email,kind,active), mentor_profile!user_id(full_name,phone)")
      .neq("status", "deleted")
      .order("created_at", { ascending: false }),
  ]);

  // Provisioned PLATFORM users (hide pure students — a student who also holds a
  // platform role still shows). One row each; office email from notification_email.
  const userRows: MemberRow[] = (users ?? [])
    .map((u) => {
      const roleRows = (u.user_role ?? []) as { role: Role | Role[] }[];
      const roles = roleRows.map((ur) => one(ur.role)).filter((r): r is Role => !!r);
      const roleKeys = roles.map((r) => r.key).filter((k): k is string => !!k);
      const officeRow = ((u.notification_email ?? []) as { email: string; kind: string; active: boolean }[])
        .find((n) => n.kind === "office" && n.active);
      // A mentor's own profile carries their name/phone; fall back to it when the
      // app_user columns aren't set (readable to user.manage via RLS).
      const mp = one(u.mentor_profile as { full_name?: string | null; phone?: string | null }[] | { full_name?: string | null; phone?: string | null } | null);
      return {
        kind: "user" as const,
        id: u.id as string,
        fullName: (u.full_name as string | null) || mp?.full_name || null,
        email: u.email as string,
        phone: (u.phone as string | null) || mp?.phone || null,
        officeEmail: officeRow?.email ?? null,
        roleKeys,
        roleLabel: roles.map((r) => r.name).filter(Boolean).join(", "),
        status: (u.status as "active" | "suspended") ?? "active",
      };
    })
    .filter((r) => r.roleKeys.length === 0 || r.roleKeys.some((k) => k !== "student"));

  // Pending, non-student invites → "Pending" rows.
  const inviteRows: MemberRow[] = (invites ?? [])
    .map((inv) => {
      const role = one(inv.role as Role | Role[]);
      return { role, inv };
    })
    .filter(({ role }) => role?.key !== "student")
    .map(({ role, inv }) => ({
      kind: "invite" as const,
      id: inv.id as string,
      fullName: null,
      email: inv.email as string,
      phone: null,
      officeEmail: null,
      roleKeys: role?.key ? [role.key] : [],
      roleLabel: role?.name ?? "",
      status: "pending" as const,
    }));

  const rows = [...userRows, ...inviteRows];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Platform users</h1>
          <p className="text-muted-foreground text-sm">
            Owners, admins, coordinators, support, mentors and employers — plus pending invites.
            Students are managed under the <b>Students</b> section.
          </p>
        </div>
        {canInvite && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/users/add-mentor">Add mentor</Link>
            </Button>
            <InviteDialog employers={employers ?? []} canInviteOwner={isOwner} />
          </div>
        )}
      </div>

      {usersError && (
        <p className="text-destructive text-sm">Couldn’t load users: {usersError.message}</p>
      )}

      <div className="bg-card rounded-xl border p-2 shadow-sm">
        <PlatformUsersTable
          rows={rows}
          caps={caps}
          callerRank={callerRank}
          isOwner={isOwner}
          currentUserId={ctx.userId}
        />
      </div>
    </div>
  );
}
