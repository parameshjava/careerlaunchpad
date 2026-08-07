import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { ConsoleShell } from "@/components/app-shell/ConsoleShell";
import { buildNav } from "@/lib/nav";

/**
 * Shell for the College Staff registration surface: shared brand bar + account
 * menu and the role-aware sidebar.
 *
 * The gate is deliberately loose — anyone signed in and provisioned gets in,
 * because this is where an UNAPPROVED registrant lives. They hold no role at
 * all until a college admin approves (#107 §3.2), so a role check here would
 * lock out exactly the people the page exists for. Nothing sensitive is served:
 * RLS limits every read to the caller's own registration.
 */
export default async function CollegeStaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <div className="bg-muted/30 text-foreground flex h-dvh flex-col overflow-hidden">
      <SiteHeader
        right={<AccountMenu email={ctx.email} name={ctx.name} avatarUrl={ctx.avatarUrl} profileHref={ctx.profilePath} />}
      />
      <ConsoleShell nav={buildNav(ctx)}>{children}</ConsoleShell>
    </div>
  );
}
