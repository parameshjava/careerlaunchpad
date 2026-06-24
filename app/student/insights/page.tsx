import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { StudentComparisonView } from "@/components/analytics/StudentComparisonView";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchStudentComparison } from "@/lib/analytics-query";

export const metadata: Metadata = { title: "My Insights" };

// The student self-view (preview-requirements): the same charts as the college
// dashboard, but framed as "where do I stand?" — the student's own profile
// compared with their college (skills/goals popularity with their picks
// highlighted, and their self-assessment vs the college average). When the
// student hasn't picked a college yet there's nothing to benchmark against, so
// we fall back to the plain self-only view and nudge them to add one.
export default async function StudentInsightsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const cmp = await fetchStudentComparison(supabase, ctx.userId);
  const hasCollege = !!cmp.collegeName;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Insights</h1>
          <p className="text-muted-foreground text-sm">
            {hasCollege
              ? `How your skills, goals and self-assessment compare with ${cmp.collegeName}.`
              : "Your skills, career goals and skill self-assessment."}
          </p>
        </div>
        <Button asChild>
          <Link href="/student/register">Update my profile</Link>
        </Button>
      </div>

      {hasCollege ? (
        <StudentComparisonView
          self={cmp.self}
          college={cmp.college}
          collegeName={cmp.collegeName}
          collegeStudents={cmp.collegeStudents}
        />
      ) : (
        <>
          <div className="bg-muted/40 text-muted-foreground rounded-lg border px-4 py-3 text-sm">
            Add your college in{" "}
            <Link href="/student/register" className="text-foreground font-medium underline">
              your profile
            </Link>{" "}
            to see how you compare with peers.
          </div>
          <AnalyticsView data={cmp.self} mode="self" />
        </>
      )}
    </div>
  );
}
