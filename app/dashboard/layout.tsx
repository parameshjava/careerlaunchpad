import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Application shell for the (token-themed) console surfaces. Server component:
// gated by the RBAC context, so only signed-in + provisioned users get in.
// Uses shadcn theme tokens — independent of the marketing landing styles.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const canManageUsers = can(ctx, "user.view") || can(ctx, "user.invite");

  return (
    <div className="bg-muted/30 text-foreground min-h-screen">
      <header className="bg-background sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-mark.png" alt="" width={28} height={28} />
            <span className="font-semibold">
              CareerLaunchpad{" "}
              <span className="text-muted-foreground font-normal">Console</span>
            </span>
          </Link>
          <nav className="text-muted-foreground ml-6 hidden items-center gap-4 text-sm sm:flex">
            <Link href="/dashboard" className="text-foreground font-medium">
              Students
            </Link>
            <span>Mentors</span>
            <span>Placements</span>
            <span>Reports</span>
            {canManageUsers && (
              <Link href="/dashboard/users" className="hover:text-foreground">
                Users
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm sm:inline">{ctx.email}</span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm">Sign out</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
