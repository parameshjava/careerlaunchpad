import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchEnrollableStudents } from "@/lib/enrollment-query";

// GET /api/admin/students/search?q=&collegeId=&year= — typeahead search over
// registered students for the enrol screen. Gated on finance.manage.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  try {
    const students = await searchEnrollableStudents(supabase, {
      q: sp.get("q") ?? undefined,
      collegeId: sp.get("collegeId") ?? undefined,
      year: sp.get("year") ?? undefined,
      limit: 25,
    });
    return NextResponse.json({ students });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
