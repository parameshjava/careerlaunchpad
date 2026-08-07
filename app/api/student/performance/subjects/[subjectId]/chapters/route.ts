// Per-chapter scores within a subject — the drill-down (migrations 147, 154).
//   GET ?from&to&batch -> { chapters: [{ chapter_id, chapter_name, best_pct,
//        first_pct, attempts_used, attempts_remaining, pass_pct, passed }] }
// Chapters with no submitted attempt come back with best_pct null — they are the
// coverage gap and the UI must render them as "not assessed", not as 0%.
// `?student=` lets a college staff member / admin read ONE of their own
// students (#111). perf_target() (migration 176) authorizes it in the DB and
// raises for anyone else, so this route only has to pass it through.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateStudentAnalytics } from "@/lib/student-analytics-gate";
import { fetchChapterScores, readScope } from "@/lib/student-performance-query";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> },
) {
  const scope = readScope(req.nextUrl.searchParams);
  if (!(await gateStudentAnalytics(scope.student)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { subjectId } = await params;
  const supabase = await createClient();
  try {
    const chapters = await fetchChapterScores(supabase, subjectId, scope);
    return NextResponse.json({ chapters });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
