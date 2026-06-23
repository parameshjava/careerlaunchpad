import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchStudentAnalytics } from "@/lib/analytics-query";

export const metadata: Metadata = { title: "My Insights" };

// The student self-view (preview-requirements): the same charts as the college
// dashboard but over the student's OWN profile only — no drilldown. They can
// jump to the registration form to update their data.
export default async function StudentInsightsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  const supabase = await createClient();
  const analytics = await fetchStudentAnalytics(supabase, ctx.userId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Insights</h1>
          <p className="text-muted-foreground text-sm">
            Your skills, career goals and skill self-assessment.
          </p>
        </div>
        <Button asChild>
          <Link href="/student/register">Update my profile</Link>
        </Button>
      </div>

      <AnalyticsView data={analytics} mode="self" />
    </div>
  );
}
