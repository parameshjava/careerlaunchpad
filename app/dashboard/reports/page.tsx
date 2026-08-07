import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/app-shell/page-container";
import { CollegeNavPicker } from "@/components/analytics/college-nav-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExamReport } from "@/components/reports/exam-report";
import { AssessmentReport } from "@/components/reports/assessment-report";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Performance reports" };

/**
 * Performance reports — how a college's students are doing across EVERY exam and
 * every chapter assessment over a period, instead of opening each paper and
 * comparing by hand.
 *
 * Two tabs because the two instruments are not comparable and must not be pooled:
 * an exam is a one-shot sitting with no pass mark; a chapter assessment is
 * retakeable and has one. Each tab reads its own endpoint (179 / 180) but they
 * share one period control (components/reports/report-range.tsx), so switching
 * tabs never moves the window under you.
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
  searchParams: Promise<{ college?: string }>;
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
  const { college: collegeParam } = await searchParams;
  const collegeId = isGlobal ? (collegeParam ?? null) : ctx.collegeScopes[0];

  const supabase = await createClient();
  const selected = collegeId
    ? (await supabase.from("college").select("id, name, place, state").eq("id", collegeId).maybeSingle()).data
    : null;

  const showCollege = isGlobal && !collegeId;

  return (
    <PageContainer variant="full" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance reports</h1>
        <p className="text-muted-foreground text-sm">
          {selected?.name
            ? `How ${selected.name}'s students are performing across every exam and assessment.`
            : "How students are performing across every exam and assessment, over a period you choose."}
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

      {/* Radix unmounts the inactive tab, so only the visible report fetches. */}
      <Tabs defaultValue="exams" className="gap-6">
        <TabsList className="max-w-full">
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
        </TabsList>
        <TabsContent value="exams">
          <ExamReport college={collegeId} showCollege={showCollege} />
        </TabsContent>
        <TabsContent value="assessments">
          <AssessmentReport college={collegeId} showCollege={showCollege} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
