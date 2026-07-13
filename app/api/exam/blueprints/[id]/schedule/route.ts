/**
 * Schedule the exam's sitting (spec 2026-07-13, step 4). Sets the exam duration
 * and the sitting's open/close window. The exam auto-opens at `opens_at` (D2 —
 * openness is time-based, enforced in start_exam_attempt). Central-only (D4).
 * Locked once the window has already opened (D6).
 *
 *   POST body { duration_minutes, opens_at, closes_at? } -> { ok }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.paper.generate");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: { duration_minutes?: number; opens_at?: string; closes_at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const duration = Number(body.duration_minutes);
  if (!Number.isFinite(duration) || duration < 1)
    return NextResponse.json({ error: "duration_minutes: required" }, { status: 422 });
  if (!body.opens_at) return NextResponse.json({ error: "opens_at: required" }, { status: 422 });

  const supabase = await createClient();

  // The sitting is created at publish; scheduling requires it to exist.
  const { data: session } = await supabase
    .from("exam_session")
    .select("id, opens_at")
    .eq("exam_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session)
    return NextResponse.json({ error: "Publish the exam before scheduling it." }, { status: 409 });
  if (session.opens_at && new Date(session.opens_at) <= new Date())
    return NextResponse.json(
      { error: "This exam has started and can no longer be rescheduled." },
      { status: 409 },
    );

  const { error: eErr } = await supabase
    .from("exam")
    .update({ duration_minutes: duration })
    .eq("id", id);
  if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });

  const { error: sErr } = await supabase
    .from("exam_session")
    .update({ opens_at: body.opens_at, closes_at: body.closes_at || null })
    .eq("id", session.id);
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
