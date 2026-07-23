import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelClassSession, updateClassSession } from "@/lib/session-schedule";

type Params = { params: Promise<{ id: string; sessionId: string }> };

// Look up the session (scoped to the batch) + its display names for invites.
async function context(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
  sessionId: string
) {
  const { data: session } = await supabase
    .from("batch_session")
    .select("id, batch_id, subject_id, series_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || (session as { batch_id: string }).batch_id !== batchId) return null;
  const s = session as { subject_id: string; series_id: string | null };
  const [{ data: batch }, { data: subj }] = await Promise.all([
    supabase.from("batch").select("name").eq("id", batchId).maybeSingle(),
    supabase.from("batch_subject").select("subject_name").eq("batch_id", batchId).eq("subject_id", s.subject_id).maybeSingle(),
  ]);
  return {
    seriesId: s.series_id,
    batchName: (batch as { name: string } | null)?.name ?? "Batch",
    subjectName: (subj as { subject_name: string | null } | null)?.subject_name ?? "Subject",
  };
}

// PATCH — edit one occurrence (marks it overridden; re-sends the invite).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, sessionId } = await params;
  try {
    await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const startsAt = typeof body.startsAt === "string" ? body.startsAt : undefined;
  const endsAt = typeof body.endsAt === "string" ? body.endsAt : undefined;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))
    return NextResponse.json({ error: "The class must end after it starts." }, { status: 422 });

  const supabase = await createClient();
  const ctx = await context(supabase, id, sessionId);
  if (!ctx) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  try {
    const { meetingWarning } = await updateClassSession(supabase, {
      sessionId,
      batchName: ctx.batchName,
      subjectName: ctx.subjectName,
      patch: {
        title: typeof body.title === "string" ? body.title : undefined,
        description: "description" in body ? ((body.description as string) ?? null) : undefined,
        startsAt,
        endsAt,
        meetingUrl: "meetingUrl" in body ? ((body.meetingUrl as string) ?? null) : undefined,
      },
    });
    return NextResponse.json({ ok: true, meetingWarning });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE — cancel this occurrence, or the whole future series with ?scope=series.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, sessionId } = await params;
  try {
    await requirePermission("finance.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const ctx = await context(supabase, id, sessionId);
  if (!ctx) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const scope = new URL(req.url).searchParams.get("scope");
  try {
    if (scope === "series" && ctx.seriesId) {
      const { data: future } = await supabase
        .from("batch_session")
        .select("id")
        .eq("series_id", ctx.seriesId)
        .neq("status", "cancelled")
        .gte("starts_at", new Date().toISOString());
      for (const row of (future ?? []) as { id: string }[]) {
        await cancelClassSession(supabase, { sessionId: row.id, batchName: ctx.batchName, subjectName: ctx.subjectName });
      }
    } else {
      await cancelClassSession(supabase, { sessionId, batchName: ctx.batchName, subjectName: ctx.subjectName });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
