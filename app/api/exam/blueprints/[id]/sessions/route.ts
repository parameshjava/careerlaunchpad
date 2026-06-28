/**
 * Sessions of a blueprint (docs/EXAM_MODULE_SPEC.md §9.3). A session is one
 * conduct event; creating it generates the fixed paper for that sitting.
 *
 *   GET  -> { sessions: [...] }
 *   POST  body { label, mode?, opens_at?, closes_at? } -> { ok, session_id, paper_id }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchBlueprint, fetchSessions } from "@/lib/exam-query";
import { writePaper } from "@/lib/exam-generate";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.assign");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  try {
    const sessions = await fetchSessions(supabase, id);
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    // Creating a sitting generates its paper from the (admin-only) bank, so this
    // is central-only — College Admins manage the roster, not paper generation.
    ctx = await requirePermission("exam.paper.generate");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: { label?: string; mode?: string; opens_at?: string; closes_at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const label = (body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label: required" }, { status: 422 });
  const mode = body.mode === "offline" ? "offline" : "online";

  const supabase = await createClient();

  const blueprint = await fetchBlueprint(supabase, id);
  if (!blueprint) return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
  if (blueprint.status !== "published")
    return NextResponse.json({ error: "Publish the blueprint before creating a sitting" }, { status: 409 });

  // The session's college mirrors the exam's; read it for the denormalized column.
  const { data: exam } = await supabase.from("exam").select("college_id").eq("id", id).single();

  const { data: session, error: sErr } = await supabase
    .from("exam_session")
    .insert({
      exam_id: id,
      college_id: exam!.college_id,
      label,
      mode,
      opens_at: body.opens_at || null,
      closes_at: body.closes_at || null,
      status: "scheduled",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  // Generate the fixed paper for this sitting. On failure remove the session
  // (cascade clears any partial paper) and report.
  try {
    const seed = Math.floor(Math.random() * 2_000_000_000);
    const paperId = await writePaper(supabase, session.id, blueprint, seed);
    return NextResponse.json({ ok: true, session_id: session.id, paper_id: paperId });
  } catch (e) {
    await supabase.from("exam_session").delete().eq("id", session.id);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 409 });
  }
}
