import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resendInvite, revokeInvite, setUserStatus } from "./actions";
import { InviteForm } from "./invite-form";
import { ManageRolesDialog } from "./manage-roles-dialog";

// Privilege ladder (mirrors role.rank) for computing the caller's assign reach.
const ROLE_RANK: Record<string, number> = { owner: 3, platform_admin: 2, coordinator: 1, support: 1 };
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Role = { key?: string; name?: string };
function roleName(r: Role | Role[] | null | undefined): string {
  const v = Array.isArray(r) ? r[0] : r;
  return v?.name ?? "—";
}

export default async function UsersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  const canInvite = can(ctx, "user.invite");
  const canResend = can(ctx, "invite.resend");
  const canViewUsers = can(ctx, "user.view");
  const canSuspend = can(ctx, "user.suspend");
  const canAssignRoles = can(ctx, "role.assign");
  const isOwner = ctx.permissions.has("*") || ctx.roles.includes("owner");
  const callerRank = Math.max(0, ...ctx.roles.map((r) => ROLE_RANK[r] ?? 0));
  if (!canViewUsers && !canInvite && !canResend) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: employers }, { data: invites }, { data: users }] = await Promise.all([
    supabase.from("employer").select("id, name").order("name"),
    supabase
      .from("invite")
      .select("id, email, status, created_at, expires_at, role:role_id(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("app_user")
      .select("id, email, status, created_at, user_role(role:role_id(key,name))")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Users &amp; invites</h1>
        <p className="text-muted-foreground text-sm">
          Add people to CareerLaunchpad. They sign in with social login using the invited email.
        </p>
      </div>

      {canInvite && (
        // overflow-visible so the college typeahead dropdown isn't clipped by
        // the card (shadcn Card is overflow-hidden by default).
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Invite a user</CardTitle>
            <CardDescription>
              Students &amp; College Admins are scoped to a college; Employers to an organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm employers={employers ?? []} canInviteOwner={isOwner} />
          </CardContent>
        </Card>
      )}

      {(canResend || canInvite) && (
        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
            <CardDescription>Pending invites are consumed on first matching sign-in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invites ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{roleName(inv.role as Role | Role[])}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "pending" ? "default" : inv.status === "consumed" ? "secondary" : "outline"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canResend && inv.status !== "consumed" && (
                        <div className="flex justify-end gap-2">
                          <form action={resendInvite}>
                            <input type="hidden" name="id" value={inv.id} />
                            <Button type="submit" variant="outline" size="sm">Resend</Button>
                          </form>
                          {inv.status !== "revoked" && (
                            <form action={revokeInvite}>
                              <input type="hidden" name="id" value={inv.id} />
                              <Button type="submit" variant="ghost" size="sm">Revoke</Button>
                            </form>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(invites ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground text-center">No invites yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {canViewUsers && (
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Everyone provisioned on the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users ?? []).map((u) => {
                  const roleRows = (u.user_role ?? []) as { role: Role | Role[] }[];
                  const roles = roleRows.map((ur) => roleName(ur.role)).join(", ") || "—";
                  const roleKeys = roleRows
                    .map((ur) => (Array.isArray(ur.role) ? ur.role[0]?.key : ur.role?.key))
                    .filter((k): k is string => !!k);
                  const suspended = u.status === "suspended";
                  return (
                    <TableRow key={u.id}>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{roles}</TableCell>
                      <TableCell>
                        <Badge variant={suspended ? "outline" : "secondary"}>{u.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canAssignRoles && (
                            <ManageRolesDialog
                              user={{ id: u.id, email: u.email, roleKeys }}
                              callerRank={callerRank}
                              isOwner={isOwner}
                            />
                          )}
                          {canSuspend && u.id !== ctx.userId && (
                            <form action={setUserStatus}>
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
                              <Button type="submit" variant="outline" size="sm">
                                {suspended ? "Reactivate" : "Suspend"}
                              </Button>
                            </form>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(users ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground text-center">No users yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
