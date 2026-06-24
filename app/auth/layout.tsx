import { SiteHeader } from "@/components/brand/SiteHeader";

// Wraps the auth PAGES (login / no-access / auth-code-error) with the shared
// top navbar. Route handlers (callback, signout) are not pages, so they're
// unaffected. Brand-only header here (no CTA) since the user is mid-sign-in.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader right={null} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
