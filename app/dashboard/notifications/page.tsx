import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toggleEmailActive } from "./actions";
import { OfficeEmailForm } from "./office-email-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Office @careerlaunchpad.ai addresses are for internal people only — owners,
// CareerLaunchpad admins, and mentors. College admins receive notifications on
// their own (personal) email and students never appear here. See the spec §4.
const OFFICE_ELIGIBLE = new Set(["owner", "platform_admin", "mentor"]);

type Role = { key?: string; name?: string };
type Addr = { id: string; email: string; kind: "personal" | "office"; active: boolean };
type Row = { role: Role | Role[] };

const roleOf = (r: Role | Role[]) => (Array.isArray(r) ? r[0] : r);

/** Enable/disable button for a single address (no delete). */
function ToggleActive({ addr }: { addr: Addr }) {
  return (
    <form action={toggleEmailActive}>
      <input type="hidden" name="id" value={addr.id} />
      <input type="hidden" name="active" value={(!addr.active).toString()} />
      <Button type="submit" size="sm" variant="ghost">
        {addr.active ? "Disable" : "Enable"}
      </Button>
    </form>
  );
}

export default async function NotificationEmailsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!can(ctx, "user.manage")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("app_user")
    .select(
      "id, email, status, user_role(role:role_id(key,name)), notification_email(id, email, kind, active)",
    )
    .order("created_at", { ascending: false });

  // Keep only people eligible for an office address (owner / admin / mentor).
  const people = (users ?? [])
    .map((u) => {
      const roles = ((u.user_role ?? []) as Row[]).map((r) => roleOf(r.role)).filter(Boolean) as Role[];
      const addrs = (u.notification_email ?? []) as Addr[];
      return {
        id: u.id as string,
        email: (u.email as string) ?? "—",
        suspended: u.status === "suspended",
        roleKeys: roles.map((r) => r.key).filter(Boolean) as string[],
        roleNames: [...new Set(roles.map((r) => r.name).filter(Boolean))] as string[],
        personal: addrs.filter((a) => a.kind === "personal"),
        office: addrs.find((a) => a.kind === "office") ?? null,
      };
    })
    .filter((p) => p.roleKeys.some((k) => OFFICE_ELIGIBLE.has(k)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification emails</h1>
        <p className="text-muted-foreground text-sm">
          Set the office <span className="font-medium">@careerlaunchpad.ai</span> address for
          each owner, admin, and mentor. Notifications go to every <em>active</em> address;
          disable an address to stop sending to it without losing it.
        </p>
      </div>

      <div className="grid gap-4">
        {people.map((p) => (
          <Card key={p.id}>
            <CardHeader className="gap-2">
              <CardTitle className="text-base break-all">{p.email}</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {p.roleNames.map((n) => (
                  <Badge key={n} variant="secondary">{n}</Badge>
                ))}
                {p.suspended && <Badge variant="outline">suspended</Badge>}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {/* Personal — the login email, seeded automatically. Toggle only. */}
              <div className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Personal
                </span>
                {p.personal.length === 0 && <span className="text-muted-foreground text-sm">—</span>}
                {p.personal.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm break-all ${a.active ? "" : "text-muted-foreground line-through"}`}>
                      {a.email}
                    </span>
                    {!a.active && <Badge variant="outline">off</Badge>}
                    <ToggleActive addr={a} />
                  </div>
                ))}
              </div>

              {/* Office — owner-editable @careerlaunchpad.ai address. */}
              <div className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Office
                </span>
                <OfficeEmailForm userId={p.id} defaultEmail={p.office?.email ?? ""} />
                {p.office && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!p.office.active && <Badge variant="outline">off</Badge>}
                    <ToggleActive addr={p.office} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {people.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No owners, admins, or mentors yet. Invite them from the Users screen.
          </p>
        )}
      </div>
    </div>
  );
}
