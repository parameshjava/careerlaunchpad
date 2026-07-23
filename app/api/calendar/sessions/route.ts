import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCalendarSessions, parseWindow } from "@/lib/calendar-query";

// GET /api/calendar/sessions?from=&to= — the signed-in user's class sessions.
// RLS scopes rows to batches the caller is enrolled in (students) or teaches
// (mentors); host start_url is never selected. Colour-code by subjectId.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const win = parseWindow(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!win.ok) return NextResponse.json({ error: win.error }, { status: 400 });

  const supabase = await createClient();
  try {
    const sessions = await fetchCalendarSessions(supabase, win);
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
