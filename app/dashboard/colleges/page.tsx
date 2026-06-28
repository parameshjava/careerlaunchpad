/**
 * Colleges management screen — owners and CareerLaunchpad admins (anyone with
 * `college.manage`) can add, edit and archive colleges. This server component is
 * the routing/UI guard; the real authorization is RLS on the college table,
 * which the API routes go through. All data flows through /api/colleges/*.
 */
import { redirect } from "next/navigation";
import { getAuthContext, can } from "@/lib/auth";
import { CollegesManager } from "@/components/colleges/CollegesManager";

export default async function CollegesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!can(ctx, "college.manage")) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Colleges</h1>
        <p className="text-muted-foreground text-sm">
          Add, edit and archive the colleges students and admins are mapped to.
          Archiving keeps existing records intact but hides the college from new
          sign-ups.
        </p>
      </div>
      <CollegesManager />
    </div>
  );
}
