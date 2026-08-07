/**
 * The whole college chapter-ASSESSMENT report in one response — tiles, monthly
 * trend, per subject, weakest chapters, and the student × subject matrix.
 *
 *   GET ?from&to&college -> { summary, trend, subjects, chapters, students }
 *
 * One round-trip for the same reason as the exam report: every view is keyed to
 * the same window, so separate endpoints would let two charts disagree about it.
 *
 * Gated at the route on the student-records permissions, and bounded by
 * assessment_report_college() inside each RPC (migration 180), which pins a
 * college-scoped caller to their own college and RAISES for anyone else.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, can } from "@/lib/auth";
import { readReportScope } from "@/lib/exam-report-query";
import {
  fetchAssessmentSummary,
  fetchAssessmentTrend,
  fetchAssessmentSubjects,
  fetchAssessmentChapters,
  fetchAssessmentStudents,
} from "@/lib/assessment-report-query";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Mirrors canViewStudents in lib/nav.ts — this is student performance, so the
  // question is "may you look at student records", not "may you see exam results".
  const mayView =
    ctx.permissions.has("*") ||
    can(ctx, "user.manage") ||
    can(ctx, "student.profile.view") ||
    can(ctx, "student.profile.search") ||
    can(ctx, "college.students.view");
  if (!mayView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = readReportScope(req.nextUrl.searchParams);
  const supabase = await createClient();
  try {
    const [summary, trend, subjects, chapters, students] = await Promise.all([
      fetchAssessmentSummary(supabase, scope),
      fetchAssessmentTrend(supabase, scope),
      fetchAssessmentSubjects(supabase, scope),
      fetchAssessmentChapters(supabase, scope),
      fetchAssessmentStudents(supabase, scope),
    ]);
    return NextResponse.json({ summary, trend, subjects, chapters, students });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
