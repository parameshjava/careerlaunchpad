import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseSessionPayload } from "@/lib/session-write";
import { updateClassSeries } from "@/lib/session-schedule";

type Params = { params: Promise<{ id: string; seriesId: string }> };

// GET — the series' current spec, for pre-filling the edit form.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id, seriesId } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || !can(ctx, "finance.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("batch_session_series")
    .select("id, batch_id, subject_id, title, description, delivery_mode, by_weekday, time_of_day, duration_min, timezone, starts_on, until, zoom_meeting_id")
    .eq("id", seriesId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || (data as { batch_id: string }).batch_id !== id)
    return NextResponse.json({ error: "Series not found" }, { status: 404 });

  const s = data as {
    subject_id: string; title: string; description: string | null; delivery_mode: string;
    by_weekday: number[]; time_of_day: string; duration_min: number; timezone: string;
    starts_on: string; until: string | null; zoom_meeting_id: string | null;
  };
  return NextResponse.json({
    series: {
      seriesId,
      subjectId: s.subject_id,
      title: s.title,
      description: s.description,
      deliveryMode: s.delivery_mode,
      byWeekday: s.by_weekday,
      timeOfDay: (s.time_of_day ?? "").slice(0, 5), // "HH:MM:SS" → "HH:MM"
      durationMin: s.duration_min,
      timezone: s.timezone,
      startsOn: s.starts_on,
      until: s.until,
      hasZoom: Boolean(s.zoom_meeting_id),
    },
  });
}

// PATCH /api/admin/batches/[id]/series/[seriesId] — edit a whole recurring
// series. Regenerates FUTURE, non-overridden occurrences from the new spec;
// past and individually-edited occurrences are left untouched.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, seriesId } = await params;
  let ctx;
  try {
    ctx = await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();

  // The series must belong to this batch; its subject is fixed (not editable here).
  const { data: series } = await supabase
    .from("batch_session_series")
    .select("id, batch_id, subject_id")
    .eq("id", seriesId)
    .maybeSingle();
  if (!series || (series as { batch_id: string }).batch_id !== id)
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  const subjectId = (series as { subject_id: string }).subject_id;

  // Parse against the shared session validator (subject is taken from the series).
  const parsed = parseSessionPayload({ ...body, subjectId });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  if (!parsed.value.recurrence)
    return NextResponse.json({ error: "A series edit needs a weekly repeat." }, { status: 422 });

  const [{ data: batch }, { data: subj }] = await Promise.all([
    supabase.from("batch").select("name").eq("id", id).maybeSingle(),
    supabase.from("batch_subject").select("subject_name").eq("batch_id", id).eq("subject_id", subjectId).maybeSingle(),
  ]);

  try {
    const result = await updateClassSeries(supabase, {
      seriesId,
      batchName: (batch as { name: string } | null)?.name ?? "Batch",
      subjectName: (subj as { subject_name: string | null } | null)?.subject_name ?? "Subject",
      payload: parsed.value,
      userId: ctx.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
