/**
 * Live monitoring feed for a sitting (issue #78). Returns, per student per
 * section, the count of questions attempted / marked-for-review / answered
 * correctly — computed live from exam_attempt_question (no grading needed). The
 * admin board polls this every minute (and on the manual Refresh button).
 *
 *   GET -> { generatedAt, sections: [...], students: [...] }
 *
 * RLS bounds every read to the caller's college; we additionally gate the route
 * on a reviewer permission so a stray call from a non-reviewer 403s cleanly.
 */
import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchSessionLiveProgress } from "@/lib/exam-query";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  const allowed = can(ctx, "exam.assign") || can(ctx, "exam.results.view_all");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = await createClient();
  try {
    const progress = await fetchSessionLiveProgress(supabase, id);
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), ...progress },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
