import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { ConsoleShell } from "@/components/app-shell/ConsoleShell";
import { buildNav } from "@/lib/nav";

// Application shell for the (token-themed) console surfaces. Server component:
// gated by the RBAC context, so only signed-in + provisioned users get in. The
// shared brand bar stays the same on every surface; navigation lives in the
// role-aware left sidebar (ConsoleShell), not the top bar.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <div className="bg-muted/30 text-foreground flex h-dvh flex-col overflow-hidden">
      <SiteHeader
        right={<AccountMenu email={ctx.email} name={ctx.name} avatarUrl={ctx.avatarUrl} />}
      />
      <ConsoleShell nav={buildNav(ctx)}>{children}</ConsoleShell>
    </div>
  );
}
