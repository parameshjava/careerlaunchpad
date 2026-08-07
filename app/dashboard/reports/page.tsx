import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/app-shell/page-container";
import { CollegeNavPicker } from "@/components/analytics/college-nav-picker";
import { ExamReport } from "@/components/reports/exam-report";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exam reports" };

/**
 * Exam reports — how a college's students are performing across EVERY exam over a
 * period, instead of opening each paper and comparing by hand.
 *
 * Gated on exam.results.view_all, which college_admin, college_staff,
 * coordinator and platform_admin all hold. The real boundary is
 * exam_report_college() inside each RPC (migration 179): a college-scoped grant
 * is pinned to its own college and cannot widen by passing another id, so the
 * `?college=` picker below can only ever narrow a global holder's view.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ college?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  if (!(ctx.permissions.has("*") || can(ctx, "exam.results.view_all"))) redirect(ctx.homePath);

  // A scoped grant is pinned by the RPC anyway; hiding the picker just avoids
  // offering a control that cannot change the answer.
  const isGlobal = ctx.permissions.has("*") || ctx.collegeScopes.length === 0;
  const canSeeAnalytics =
    ctx.permissions.has("*") || can(ctx, "analytics.platform.view") || can(ctx, "college.analytics.view");
  const { college: collegeParam } = await searchParams;
  const collegeId = isGlobal ? (collegeParam ?? null) : ctx.collegeScopes[0];

  const supabase = await createClient();
  const selected = collegeId
    ? (await supabase.from("college").select("id, name, place, state").eq("id", collegeId).maybeSingle()).data
    : null;

  return (
    <PageContainer variant="full" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exam reports</h1>
        <p className="text-muted-foreground text-sm">
          {selected?.name
            ? `How ${selected.name}'s students are performing across every exam.`
            : "How students are performing across every exam, over a period you choose."}
        </p>
        {/* The reciprocal of the pointer on College Insights — the two datasets are
            adjacent in the sidebar and easily mistaken for each other. */}
        {canSeeAnalytics && (
          <p className="text-muted-foreground mt-2 text-sm">
            Skills, career goals and the self-assessment students filled in at registration
            are in{" "}
            <Link href="/dashboard/analytics" className="text-foreground font-medium underline">
              College analytics
            </Link>
            .
          </p>
        )}
      </div>

      {isGlobal && (
        <div>
          <CollegeNavPicker selected={selected ?? null} />
          {!collegeId && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Showing every college. Pick one to narrow the report.
            </p>
          )}
        </div>
      )}

      <ExamReport college={collegeId} showCollege={isGlobal && !collegeId} />
    </PageContainer>
  );
}
