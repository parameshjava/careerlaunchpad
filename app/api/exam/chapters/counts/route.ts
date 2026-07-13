/**
 * Per-chapter active-question counts (by difficulty) for a subject — powers the
 * "VH n · H n · M n · E n" hint on the Subjects & Chapters page.
 *
 *   GET ?subject_id -> { counts: { [chapterId]: { easy, medium, hard, very_hard } } }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchChapterCounts } from "@/lib/exam-query";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("exam.subject.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const subjectId = req.nextUrl.searchParams.get("subject_id");
  if (!subjectId) return NextResponse.json({ error: "subject_id: required" }, { status: 400 });

  const supabase = await createClient();
  try {
    const counts = await fetchChapterCounts(supabase, subjectId);
    return NextResponse.json({ counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
