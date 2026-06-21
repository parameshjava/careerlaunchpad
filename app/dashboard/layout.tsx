import Link from "next/link";
import Image from "next/image";

// Application shell for the (token-themed) admin surfaces. Uses shadcn theme
// tokens — independent of the marketing landing styles.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
