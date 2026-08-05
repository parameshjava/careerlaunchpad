/**
 * GET /api/admin/reference/audit?limit=50 -> { entries: [...] }
 *
 * Recent catalogue edits, newest first (issue #99 §7.5). Reference data feeds
 * student-facing forms, mentor matching and every branch-keyed report, so "who
 * changed this, and to what" has to be answerable — the screen shows this list
 * inline rather than making someone open the database.
 * Auth: refdata.manage (RLS on ref_data_audit enforces it again).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refdataGate } from "@/lib/refdata-admin";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const denied = await refdataGate();
  if (denied) return NextResponse.json(denied, { status: 403 });

  const requested = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_LIMIT));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_data_audit")
    .select("id, table_name, row_key, action, before, after, created_at, actor:actor_id(email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Supabase types a to-one embed as a possible array; normalize to one row.
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  return NextResponse.json({
    entries: (data ?? []).map((e) => {
      const { actor, ...rest } = e as unknown as Record<string, unknown>;
      return { ...rest, actor_email: one<{ email: string | null }>(actor as never)?.email ?? null };
    }),
  });
}
