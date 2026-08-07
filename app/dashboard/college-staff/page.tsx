import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/app-shell/page-container";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCollegeStaff, fetchStaffInvites } from "@/lib/college-staff-list";
import { CollegeNavPicker } from "@/components/analytics/college-nav-picker";
import { StaffConsole, type StaffTab } from "./staff-console";

export const metadata: Metadata = { title: "College staff" };

const TABS: StaffTab[] = ["pending", "approved", "invited", "suspended", "rejected"];

/**
 * The College Staff roster — where a College Admin manages their own college's
 * staff, and a Platform Admin manages any college's.
 *
 * It is its own page rather than a Team tab because /dashboard/team is gated on
 * user.view / user.invite / user.manage / mentor.review (team/page.tsx:39-44)
 * and a college_admin holds NONE of them — they cannot reach Team at all. Team
 * gets the same table as an extra tab for platform admins.
 *
 * Scoping is RLS: fetchCollegeStaff returns only what the caller may see. The
 * `?college=` filter can only narrow that further, so a college admin passing
 * another college's id still gets their own (empty) result, not a leak.
 */
export default async function CollegeStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; college?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const canView = can(ctx, "college.staff.view");
  const canReview = can(ctx, "college.staff.review");
  const canInvite = can(ctx, "college.staff.invite");
  if (!canView && !canReview && !canInvite) redirect(ctx.homePath);

  // An unscoped holder (owner / platform admin) spans colleges and gets the
  // picker; a college admin's grant already pins them to one.
  const isGlobal = ctx.permissions.has("*") || ctx.collegeScopes.length === 0;

  const { tab, college: collegeParam } = await searchParams;
  const collegeId = isGlobal ? collegeParam : ctx.collegeScopes[0];
  const defaultTab: StaffTab = TABS.includes(tab as StaffTab) ? (tab as StaffTab) : "pending";

  const supabase = await createClient();
  const [rows, invites, selectedCollege] = await Promise.all([
    fetchCollegeStaff(supabase, collegeId),
    fetchStaffInvites(supabase, collegeId),
    collegeId
      ? supabase.from("college").select("id, name, place, state").eq("id", collegeId).maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  // The invite wizard needs a college; a platform admin must pick one first.
  const inviteHref = collegeId
    ? `/dashboard/college-staff/new?college=${collegeId}`
    : "/dashboard/college-staff/new";

  return (
    <PageContainer variant="full" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">College staff</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Faculty and staff who can follow{" "}
            {isGlobal ? "a college's" : "your college's"} students, batches and results.
            Invite someone and they&rsquo;re approved automatically; if they register themselves,
            they wait here for your approval.
          </p>
        </div>
        {canInvite && (
          <Button asChild className="shrink-0">
            <Link href={inviteHref}>+ Invite staff</Link>
          </Button>
        )}
      </div>

      {/* Unlike College Insights, an unfiltered view here is useful — the whole
          platform's pending staff queue in one list — so no college is a valid
          state, not a prompt. Picking one narrows it. */}
      {isGlobal && (
        <div>
          <CollegeNavPicker selected={selectedCollege ?? null} />
          {!collegeId && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Showing every college. Pick one to narrow the list.
            </p>
          )}
        </div>
      )}

      <StaffConsole
        rows={rows}
        invites={invites}
        canReview={canReview}
        canInvite={canInvite}
        showCollege={isGlobal && !collegeId}
        defaultTab={defaultTab}
      />
    </PageContainer>
  );
}
