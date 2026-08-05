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
import { sendStudentImportedEmail } from "@/lib/mailer";
import { loadRefData, loadDegreeBranchMapping, parseWorkbook, normalizeRows } from "@/lib/intake-excel";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  try {
    await requirePermission("student.intake.import");
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
  const [refData, mapping] = await Promise.all([loadRefData(supabase), loadDegreeBranchMapping(supabase)]);

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

  // `mapping` is what makes a mismatched (degree, branch) pair a per-row error
  // rather than a silently-stored bad record (#99).
  const normalized = normalizeRows(parsed.rows, refData, mapping);
  // Rows with BLOCKING errors are NOT imported — importing them would create a
  // student record + invite with the bad cell silently dropped (and a green
  // "created" badge). They are reported back as 'error' so the admin can fix and
  // re-upload (re-upload upserts, so fixing is cheap). Advisory warnings don't
  // block; they ride along on the imported row's report entry.
  const importable = normalized.filter((n) => n.errors.length === 0);
  const rejected = normalized.filter((n) => n.errors.length > 0);
  const warningsByRow = new Map<number, string[]>();
  normalized.forEach((n) => { if (n.warnings.length) warningsByRow.set(n.row, n.warnings); });

  type ReportRow = { row: number; email: string | null; result: string; invite: string; warnings?: string[] };
  let result = {
    batch_id: null as string | null, created: 0, updated: 0, invited: 0, invite_skipped: 0,
    rows: [] as ReportRow[], new_invite_emails: [] as string[],
  };

  if (importable.length) {
    // Upsert + auto-invite atomically in the DB (permission + scope checked there).
    const { data: report, error: rpcErr } = await supabase.rpc("import_student_intake", {
      p_college_id: collegeId,
      p_rows: importable.map((n) => n.data),
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 403 });
    result = report as typeof result;

    // Welcome the newly-registered students and point them to access their profile.
    await Promise.all(
      (result.new_invite_emails ?? []).map((to) =>
        sendStudentImportedEmail({ to, loginUrl: `${SITE_URL}/auth/login` }),
      ),
    );
  }

  // Merge advisory warnings into the imported rows, then append the rejected
  // rows (as errors) and present the whole thing in original sheet order.
  const importedRows: ReportRow[] = (result.rows ?? []).map((r) => {
    const warnings = warningsByRow.get(r.row);
    return warnings ? { ...r, warnings } : r;
  });
  const rejectedRows: ReportRow[] = rejected.map((n) => ({
    row: n.row,
    email: (n.data.email as string | undefined) || null,
    result: "error",
    invite: "none",
    warnings: n.errors,
  }));
  const rows = [...importedRows, ...rejectedRows].sort((a, b) => a.row - b.row);

  return NextResponse.json({
    batch_id: result.batch_id,
    total: parsed.rows.length,
    created: result.created,
    updated: result.updated,
    invited: result.invited,
    invite_skipped: result.invite_skipped,
    rejected: rejectedRows.length,
    rows,
  });
}
