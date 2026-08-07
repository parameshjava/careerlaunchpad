/**
 * The whole college exam report in one response — tiles, monthly trend, every
 * sitting, subject strength, the score distribution, and the student × exam
 * matrix.
 *
 *   GET ?from&to&college -> { summary, trend, exams, subjects, distribution, students }
 *
 * ONE round-trip on purpose: the page renders all six together and every one of
 * them is keyed to the same date range, so six endpoints would mean six chances
 * for the charts to disagree about which window they are showing.
 *
 * Authorization is exam_report_college() inside each RPC (migration 179), which
 * pins a college-scoped caller to their own college and RAISES for anyone without
 * exam.results.view_all — so a bad caller gets an error rather than an empty
 * report that reads as "no exams yet".
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, can } from "@/lib/auth";
import {
  readReportScope,
  fetchReportSummary,
  fetchReportTrend,
  fetchReportExams,
  fetchReportSubjects,
  fetchReportDistribution,
  fetchReportStudents,
} from "@/lib/exam-report-query";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Route-level filter only; the RPCs are the boundary.
  if (!(ctx.permissions.has("*") || can(ctx, "exam.results.view_all"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = readReportScope(req.nextUrl.searchParams);
  const supabase = await createClient();

  try {
    const [summary, trend, exams, subjects, distribution, students] = await Promise.all([
      fetchReportSummary(supabase, scope),
      fetchReportTrend(supabase, scope),
      fetchReportExams(supabase, scope),
      fetchReportSubjects(supabase, scope),
      fetchReportDistribution(supabase, scope),
      fetchReportStudents(supabase, scope),
    ]);
    return NextResponse.json({ summary, trend, exams, subjects, distribution, students });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
