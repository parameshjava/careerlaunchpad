import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InteractiveAnalytics } from "@/components/analytics/InteractiveAnalytics";
import { CollegePicker } from "@/components/analytics/CollegePicker";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCollegeAnalytics } from "@/lib/analytics-query";
import { fetchStudents } from "@/lib/students-query";

export const metadata: Metadata = { title: "College Insights" };

// College-scoped analytics dashboard (preview-requirements). Owner / platform
// admins pick any college; a College Admin is locked to their own. Charts +
// a student drilldown table are scoped to the chosen college. RLS is the real
// guard — this layer only routes and locks the selector.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ college?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/auth/login");
  if (!ctx.provisioned || ctx.status === "suspended") redirect("/auth/no-access");

  // Who can pick any college vs who is locked to their own.
  const canSelectAny =
    ctx.permissions.has("*") ||
    can(ctx, "user.manage") ||
    can(ctx, "analytics.platform.view");
  const scopedCollegeId = ctx.collegeScopes[0] ?? null;
  const isCollegeAdmin = !canSelectAny && can(ctx, "college.analytics.view") && !!scopedCollegeId;

  // No analytics access at all → send them to their own home surface.
  if (!canSelectAny && !isCollegeAdmin) redirect(ctx.homePath);

  const { college: collegeParam } = await searchParams;
  const collegeId = canSelectAny ? (collegeParam ?? null) : scopedCollegeId;

  const supabase = await createClient();

  // Nothing selected yet (owner/admin landing) → prompt to choose a college.
  if (!collegeId) {
    return (
      <div className="space-y-6">
        <Header />
        <CollegePicker selected={null} />
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            Search and select a college above to view its insights.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [analytics, students] = await Promise.all([
    fetchCollegeAnalytics(supabase, collegeId),
    fetchStudents(supabase, collegeId),
  ]);

  const stats = [
    { label: "Students", value: analytics.totals.students, hint: "imported + registered" },
    { label: "Registered", value: analytics.totals.registered, hint: "signed in" },
    { label: "Awaiting sign-up", value: analytics.totals.imported, hint: "imported / invited" },
    { label: "Self-assessed", value: analytics.totals.withAssessment, hint: "completed step 4" },
  ];

  return (
    <div className="space-y-6">
      <Header collegeName={analytics.college?.name ?? null} />

      <CollegePicker selected={analytics.college} disabled={isCollegeAdmin} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
              <p className="text-muted-foreground text-xs">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <InteractiveAnalytics analytics={analytics} students={students} />
    </div>
  );
}

function Header({ collegeName }: { collegeName?: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">College Insights</h1>
      <p className="text-muted-foreground text-sm">
        {collegeName
          ? `Skills, goals and skill-assessment for ${collegeName}.`
          : "Skills, goals and skill-assessment, by college."}
      </p>
    </div>
  );
}
