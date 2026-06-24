/**
 * GET /api/admin/intake/template?college_id=<uuid>
 * Streams an .xlsx intake template bound to the chosen college, with in-cell
 * dropdowns for enumerated fields. Auth: student.intake.import. See spec §5.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { loadRefData, buildTemplateWorkbook } from "@/lib/intake-excel";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("student.intake.import");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const collegeId = req.nextUrl.searchParams.get("college_id");
  if (!collegeId) return NextResponse.json({ error: "college_id is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: college, error } = await supabase
    .from("college").select("id, name, place").eq("id", collegeId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!college) return NextResponse.json({ error: "College not found" }, { status: 404 });

  const refData = await loadRefData(supabase);
  const wb = await buildTemplateWorkbook(college, refData);
  const buffer = await wb.xlsx.writeBuffer();

  const safe = college.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="intake_${safe}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
