import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { ConsoleShell } from "@/components/app-shell/ConsoleShell";
import { buildNav } from "@/lib/nav";

// Shell for the signed-in mentor surfaces: shared brand bar + account menu and
// the role-aware sidebar. `mentor` is an additive role, so the sidebar may also
// carry the user's student/console items — only mentors (or higher) get in.
export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  // Owner ('*') can preview; otherwise the mentor role is required here.
  if (!ctx.roles.includes("mentor") && !ctx.permissions.has("*")) redirect(ctx.homePath);

  return (
    <div className="bg-muted/30 text-foreground flex h-dvh flex-col overflow-hidden">
      <SiteHeader
        right={<AccountMenu email={ctx.email} name={ctx.name} avatarUrl={ctx.avatarUrl} />}
      />
      <ConsoleShell nav={buildNav(ctx)}>{children}</ConsoleShell>
    </div>
  );
}
