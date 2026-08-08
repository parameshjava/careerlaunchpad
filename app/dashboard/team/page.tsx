import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMentors } from "@/lib/mentors-query";
import { fetchCollegeStaff, fetchStaffInvites } from "@/lib/college-staff-list";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/app-shell/page-container";
import { InviteDialog } from "@/app/dashboard/users/invite-dialog";
import { type MemberRow, type Caps } from "@/app/dashboard/users/platform-users-table";
import { TeamConsole, type TeamTab } from "./team-console";
import { TeamStaffPanel } from "@/app/dashboard/college-staff/team-staff-panel";

export const metadata: Metadata = { title: "Team" };

// Privilege ladder (mirrors role.rank) for the caller's assign reach.
const ROLE_RANK: Record<string, number> = { owner: 3, platform_admin: 2, coordinator: 1, support: 1 };

// Actor partition. Admins = the top of the ladder (owner / platform_admin).
// Staff = operational roles below it, plus college-scoped admins. Mentor is
// orthogonal (its own tab from mentor_profile), so it never lands a user here.
const isAdmin = (keys: string[]) => keys.includes("owner") || keys.includes("platform_admin");
const isStaff = (keys: string[]) =>
  !isAdmin(keys) && (keys.includes("coordinator") || keys.includes("support") || keys.includes("college_admin"));

type Role = { key?: string; name?: string };
const one = <T,>(r: T | T[] | null | undefined): T | null => (Array.isArray(r) ? r[0] ?? null : r ?? null);

const TABS: TeamTab[] = ["admins", "staff", "mentors", "collegeStaff", "invites"];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const canInvite = can(ctx, "user.invite");
  const canResend = can(ctx, "invite.resend") || canInvite;
  const canViewUsers = can(ctx, "user.view");
  const canReviewMentors = ctx.permissions.has("*") || can(ctx, "mentor.review");
  const canSeeMentors = canReviewMentors || can(ctx, "user.manage");
  // The College-staff tab is for the PLATFORM side of #107. A college admin
  // can't reach this page at all (they hold none of the gates above) and has
  // /dashboard/college-staff instead, so this tab is only ever the global view.
  const canSeeCollegeStaff = ctx.permissions.has("*") || can(ctx, "college.staff.view");
  if (!canViewUsers && !canInvite && !canResend && !canSeeMentors) redirect("/dashboard");

  const caps: Caps = {
    canAssignRoles: can(ctx, "role.assign"),
    canSuspend: can(ctx, "user.suspend"),
    canDelete: can(ctx, "user.manage"),
    canOffice: can(ctx, "user.manage"),
    canResend,
    canInvite,
    canImpersonate:
      ctx.permissions.has("*") || ctx.roles.includes("owner") || ctx.roles.includes("platform_admin"),
  };
  const isOwner = ctx.permissions.has("*") || ctx.roles.includes("owner");
  const callerRank = Math.max(0, ...ctx.roles.map((r) => ROLE_RANK[r] ?? 0));
  const isMentor = ctx.roles.includes("mentor");

  const supabase = await createClient();
  const [
    { data: employers },
    { data: invites },
    { data: users, error: usersError },
    mentors,
    staffRows,
    staffInvites,
  ] = await Promise.all([
      supabase.from("employer").select("id, name").order("name"),
      supabase
        .from("invite")
        .select("id, email, status, created_at, scope_college_id, role:role_id(key,name), college:scope_college_id(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("app_user")
        .select("id, email, status, full_name, phone, user_role(scope_college_id, role:role_id(key,name), college:scope_college_id(name)), notification_email(email,kind,active), mentor_profile!user_id(full_name,phone)")
        .neq("status", "deleted")
        .order("created_at", { ascending: false }),
      canSeeMentors ? fetchMentors(supabase) : Promise.resolve([]),
      canSeeCollegeStaff ? fetchCollegeStaff(supabase) : Promise.resolve([]),
      canSeeCollegeStaff ? fetchStaffInvites(supabase) : Promise.resolve([]),
    ]);

  // One MemberRow per provisioned user. Office email comes from notification_email;
  // name/phone fall back to the user's mentor profile when the account columns are unset.
  const userRows: MemberRow[] = (users ?? []).map((u) => {
    const roleRows = (u.user_role ?? []) as {
      role: Role | Role[];
      scope_college_id?: string | null;
      college?: { name?: string } | { name?: string }[] | null;
    }[];
    const roles = roleRows.map((ur) => one(ur.role)).filter((r): r is Role => !!r);
    const roleKeys = roles.map((r) => r.key).filter((k): k is string => !!k);
    const collegeNames = Array.from(
      new Set(roleRows.map((ur) => one(ur.college)?.name).filter((n): n is string => !!n)),
    );
    const collegeAdmin = roleRows
      .filter((ur) => one(ur.role)?.key === "college_admin" && ur.scope_college_id)
      .map((ur) => ({ id: ur.scope_college_id as string, name: one(ur.college)?.name ?? "College" }));
    const officeRow = ((u.notification_email ?? []) as { email: string; kind: string; active: boolean }[])
      .find((n) => n.kind === "office" && n.active);
    const mp = one(
      u.mentor_profile as
        | { full_name?: string | null; phone?: string | null }[]
        | { full_name?: string | null; phone?: string | null }
        | null,
    );
    return {
      kind: "user" as const,
      id: u.id as string,
      fullName: (u.full_name as string | null) || mp?.full_name || null,
      email: u.email as string,
      phone: (u.phone as string | null) || mp?.phone || null,
      officeEmail: officeRow?.email ?? null,
      roleKeys,
      roleLabel: roles.map((r) => r.name).filter(Boolean).join(", "),
      collegeNames,
      collegeAdmin,
      status: (u.status as "active" | "suspended") ?? "active",
    };
  });

  const admins = userRows.filter((r) => isAdmin(r.roleKeys));
  const staff = userRows.filter((r) => isStaff(r.roleKeys));

  // Pending, non-student invites → the Invites tab.
  const inviteRows: MemberRow[] = (invites ?? [])
    .map((inv) => ({
      role: one(inv.role as Role | Role[]),
      college: one((inv as { college?: { name?: string } | { name?: string }[] | null }).college),
      inv,
    }))
    .filter(({ role }) => role?.key !== "student")
    .map(({ role, college, inv }) => ({
      kind: "invite" as const,
      id: inv.id as string,
      fullName: null,
      email: inv.email as string,
      phone: null,
      officeEmail: null,
      roleKeys: role?.key ? [role.key] : [],
      roleLabel: role?.name ?? "",
      collegeNames: college?.name ? [college.name] : [],
      collegeAdmin: [],
      status: "pending" as const,
    }));

  const { tab } = await searchParams;
  const defaultTab: TeamTab = TABS.includes(tab as TeamTab) ? (tab as TeamTab) : "admins";

  return (
    <PageContainer variant="full" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Everyone who runs the platform — admins, staff and mentors — plus pending invites.
            Students are managed under <b>Students</b>; organizations under <b>Organizations</b>.
          </p>
        </div>
        {canInvite && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
            <Button asChild variant="outline">
              <Link href="/dashboard/users/add-mentor">Add mentor</Link>
            </Button>
            <InviteDialog employers={employers ?? []} canInviteOwner={isOwner} />
          </div>
        )}
      </div>

      {usersError && (
        <p className="text-destructive text-sm">Couldn’t load team members: {usersError.message}</p>
      )}

      <TeamConsole
        admins={admins}
        staff={staff}
        invites={inviteRows}
        mentors={mentors}
        collegeStaff={canSeeCollegeStaff ? { rows: staffRows, invites: staffInvites } : null}
        collegeStaffPanel={
          canSeeCollegeStaff ? <TeamStaffPanel rows={staffRows} invites={staffInvites} /> : null
        }
        caps={caps}
        callerRank={callerRank}
        isOwner={isOwner}
        currentUserId={ctx.userId}
        canReviewMentors={canReviewMentors}
        isMentor={isMentor}
        defaultTab={defaultTab}
      />
    </PageContainer>
  );
}
