import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { AccountMenu } from "@/components/brand/AccountMenu";

// Universal self-profile surface (the avatar → Profile target). Reachable from
// every surface, so it lives at /account with its own light shell (brand bar +
// account menu, no console sidebar) rather than under a role-specific tree.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  return (
    <div className="bg-muted/30 text-foreground flex min-h-dvh flex-col">
      <SiteHeader right={<AccountMenu email={ctx.email} name={ctx.name} avatarUrl={ctx.avatarUrl} />} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
