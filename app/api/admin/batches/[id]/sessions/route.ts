import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCalendarSessions, parseWindow } from "@/lib/calendar-query";
import { parseSessionPayload } from "@/lib/session-write";
import { createClassSchedule } from "@/lib/session-schedule";

const DAY = 86_400_000;

// GET /api/admin/batches/[id]/sessions?from=&to= — the batch's class sessions.
// Defaults the window to [now-30d, now+120d] when not supplied.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const now = Date.now();
  const from = url.searchParams.get("from") ?? new Date(now - 30 * DAY).toISOString();
  const to = url.searchParams.get("to") ?? new Date(now + 120 * DAY).toISOString();
  const win = parseWindow(from, to);
  if (!win.ok) return NextResponse.json({ error: win.error }, { status: 400 });

  const supabase = await createClient();
  try {
    const sessions = await fetchCalendarSessions(supabase, win, { batchId: id });
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/batches/[id]/sessions — schedule a one-off class or a
// recurring series for one of the batch's subjects.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSessionPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const payload = parsed.value;

  const supabase = await createClient();

  // The subject must belong to this batch (also gives us its display name).
  const { data: subj, error: subjErr } = await supabase
    .from("batch_subject")
    .select("subject_name")
    .eq("batch_id", id)
    .eq("subject_id", payload.subjectId)
    .maybeSingle();
  if (subjErr) return NextResponse.json({ error: subjErr.message }, { status: 500 });
  if (!subj)
    return NextResponse.json(
      { error: "That subject isn't part of this batch. Add it under Subjects & mentors first." },
      { status: 422 }
    );

  const { data: batch } = await supabase.from("batch").select("name").eq("id", id).maybeSingle();

  try {
    const result = await createClassSchedule(supabase, {
      batchId: id,
      batchName: (batch as { name: string } | null)?.name ?? "Batch",
      subjectName: (subj as { subject_name: string | null }).subject_name ?? "Subject",
      payload,
      userId: ctx.userId,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
