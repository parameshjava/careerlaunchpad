import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCompetitiveExamsWithSyllabus } from "@/lib/competitive-exam-query";

// Option data for the course editor: the competitive exams a course can
// prepare for, each with its resolved syllabus (subjects + chapters) so the
// editor can preview the inherited syllabus. Gated on finance.manage.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const competitiveExams = await fetchCompetitiveExamsWithSyllabus(supabase);
    return NextResponse.json({ competitiveExams });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
