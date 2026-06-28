/**
 * A single exam session (docs/EXAM_MODULE_SPEC.md §9.3).
 *   GET -> { session, roster }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { fetchRoster, fetchSession } from "@/lib/exam-query";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("exam.assign");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  try {
    const session = await fetchSession(supabase, id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const roster = await fetchRoster(supabase, id);
    return NextResponse.json({ session, roster });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
