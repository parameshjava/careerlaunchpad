import { NextResponse } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchSubjectsWithChapters } from "@/lib/course-query";

// Option data for the competitive-exam editor: all subjects with their chapters
// (for authoring the exam's syllabus). Gated on finance.manage.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  try {
    const subjects = await fetchSubjectsWithChapters(supabase);
    return NextResponse.json({ subjects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
