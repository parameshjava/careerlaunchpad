import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/app-shell/page-container";
import { CollegeNavPicker } from "@/components/analytics/college-nav-picker";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Students Performance" };

/**
 * Students Performance — how a college's students are doing across EVERY exam and
 * every chapter assessment over a period, instead of opening each paper and
 * comparing by hand.
 *
 * This page is only the shell: the guard, the college lookup, and the heading.
 * Everything interactive lives in ReportsWorkspace, which owns the one period
 * both reports share and the sticky bar that keeps it on screen.
 *
 * Exams and assessments stay separate views because the two instruments are not
 * comparable and must not be pooled: an exam is a one-shot sitting with no pass
 * mark, a chapter assessment is retakeable and has one. Each reads its own
 * endpoint (migrations 179 / 180).
 *
 * Gated on being able to read student records — the same set as the Students grid
 * — because that is what this page shows. The real boundary is
 * exam_report_college() / assessment_report_college() inside each RPC: a
 * college-scoped grant is pinned to its own college and cannot widen by passing
 * another id, so the `?college=` picker below can only ever narrow a global
 * holder's view.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ college?: string; view?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");
  const mayView =
    ctx.permissions.has("*") ||
    can(ctx, "exam.results.view_all") ||
    can(ctx, "college.students.view") ||
    can(ctx, "user.manage");
  if (!mayView) redirect(ctx.homePath);

  // A scoped grant is pinned by the RPC anyway; hiding the picker just avoids
  // offering a control that cannot change the answer.
  const isGlobal = ctx.permissions.has("*") || ctx.collegeScopes.length === 0;
  const canSeeAnalytics =
    ctx.permissions.has("*") || can(ctx, "analytics.platform.view") || can(ctx, "college.analytics.view");
  const { college: collegeParam, view } = await searchParams;
  const collegeId = isGlobal ? (collegeParam ?? null) : ctx.collegeScopes[0];

  const supabase = await createClient();
  const selected = collegeId
    ? (await supabase.from("college").select("id, name, place, state").eq("id", collegeId).maybeSingle()).data
    : null;

  return (
    <PageContainer variant="full">
      <div className="pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Students Performance</h1>
        <p className="text-muted-foreground text-sm">
          {selected?.name
            ? `How ${selected.name}'s students are performing across every exam and assessment.`
            : "How students are performing across every exam and assessment, over a period you choose."}
        </p>
        {/* The reciprocal of the pointer on College analytics — the two datasets are
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

      <ReportsWorkspace
        userId={ctx.userId}
        college={collegeId}
        showCollege={isGlobal && !collegeId}
        initialView={view}
        collegePicker={
          isGlobal ? (
            <div className="min-w-0">
              <CollegeNavPicker selected={selected ?? null} />
            </div>
          ) : undefined
        }
      />
    </PageContainer>
  );
}
