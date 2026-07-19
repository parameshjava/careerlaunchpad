/**
 * Sessions of a blueprint (list only). The sitting and its paper are created
 * automatically when the blueprint is published (one sitting per exam — see
 * api/exam/blueprints/[id]/publish), so there is no manual create here.
 *
 *   GET  -> { sessions: [...] }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchSessions } from "@/lib/exam-query";

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
