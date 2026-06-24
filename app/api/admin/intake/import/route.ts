/**
 * POST /api/admin/intake/import  (multipart: file + college_id)
 * Parses the filled template, upserts rows into student_intake and auto-issues
 * an individual student invite per row (via the import_student_intake() SQL
 * function, which enforces the import permission + college scope), then emails
 * the newly-created invites. Returns a per-row report. Auth: student.intake.import.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/mailer";
import { loadRefData, parseWorkbook, normalizeRows } from "@/lib/intake-excel";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  let ctxEmail: string | null = null;
  try {
    const ctx = await requirePermission("student.intake.import");
    ctxEmail = ctx.email;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const collegeId = String(form.get("college_id") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!collegeId) return NextResponse.json({ error: "college_id is required" }, { status: 400 });

  const supabase = await createClient();
  const refData = await loadRefData(supabase);

  let parsed;
  try {
    parsed = await parseWorkbook(await file.arrayBuffer(), refData);
  } catch {
    return NextResponse.json({ error: "Could not read the .xlsx file" }, { status: 400 });
  }
  if (parsed.collegeId && parsed.collegeId !== collegeId) {
    return NextResponse.json(
      { error: "This template was generated for a different college. Re-download for the selected college." },
      { status: 400 },
    );
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "No data rows found in the sheet" }, { status: 400 });
  }

  const normalized = normalizeRows(parsed.rows, refData);
  const warningsByRow = new Map<number, string[]>();
  normalized.forEach((n) => { if (n.errors.length) warningsByRow.set(n.row, n.errors); });

  // Upsert + auto-invite atomically in the DB (permission + scope checked there).
  const { data: report, error: rpcErr } = await supabase.rpc("import_student_intake", {
    p_college_id: collegeId,
    p_rows: normalized.map((n) => n.data),
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 403 });

  const result = report as {
    batch_id: string; created: number; updated: number; invited: number; invite_skipped: number;
    rows: { row: number; email: string | null; result: string; invite: string }[];
    new_invite_emails: string[];
  };

  // Send invite emails for the rows that received a new invite.
  await Promise.all(
    (result.new_invite_emails ?? []).map((to) =>
      sendInviteEmail({ to, roleName: "Student", invitedBy: ctxEmail, loginUrl: `${SITE_URL}/auth/login` }),
    ),
  );

  // Merge normalization warnings into the per-row report.
  const rows = result.rows.map((r) => {
    const warnings = warningsByRow.get(r.row);
    return warnings ? { ...r, warnings } : r;
  });

  return NextResponse.json({
    batch_id: result.batch_id,
    total: parsed.rows.length,
    created: result.created,
    updated: result.updated,
    invited: result.invited,
    invite_skipped: result.invite_skipped,
    rows,
  });
}
