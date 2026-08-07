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
 * The gate is SIGNED-IN ONLY, deliberately — not "provisioned", and not a role
 * check. This is where a brand-new self-registrant lives, and they have no
 * app_user row at all yet (the row is created by register_as_college_staff once
 * they pick a college), so `provisioned` is false for exactly the people this
 * surface exists for.
 *
 * Requiring it produced an infinite bounce: /auth/no-access offers the College
 * Staff card, the card links here, here redirects back to /auth/no-access.
 * Self-registration was unreachable. Caught end-to-end via /dev/auth, which is
 * the first thing that could sign in as an unprovisioned user on demand.
 *
 * Nothing sensitive is served on a loose gate: every read on this surface is
 * RLS-bound to the caller's own registration, and an unapproved staff member
 * holds no scoped permission, so there is nothing else for them to reach.
 */
export default async function CollegeStaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  // A suspended ACCOUNT is out; an unprovisioned one is the normal case here
  // (status is null until the app_user row exists).
  if (ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <div className="bg-muted/30 text-foreground flex h-dvh flex-col overflow-hidden">
      <SiteHeader
        right={<AccountMenu email={ctx.email} name={ctx.name} avatarUrl={ctx.avatarUrl} profileHref={ctx.profilePath} />}
      />
      <ConsoleShell nav={buildNav(ctx)}>{children}</ConsoleShell>
    </div>
  );
}
