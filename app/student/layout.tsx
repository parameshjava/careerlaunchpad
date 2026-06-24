import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { ConsoleShell } from "@/components/app-shell/ConsoleShell";
import { buildNav } from "@/lib/nav";

// Shell for the signed-in student surfaces: shared brand bar + account menu, and
// the role-aware left sidebar (My profile / My insights). Same shape as the
// console — only the menu items differ (built per role in lib/nav.ts).
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");

  return (
    <div className="bg-muted/30 text-foreground flex h-dvh flex-col overflow-hidden">
      <SiteHeader
        right={<AccountMenu email={ctx.email} name={ctx.name} avatarUrl={ctx.avatarUrl} />}
      />
      <ConsoleShell nav={buildNav(ctx)}>{children}</ConsoleShell>
    </div>
  );
}
