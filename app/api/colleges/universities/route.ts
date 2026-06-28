/**
 * The list of universities — i.e. colleges that are self-associated
 * (university_id = id), exposed via the `university` view (migration 032). Feeds
 * the "Affiliating university" dropdown and the university filter in the manage
 * UI, so the form fetches its options from the API rather than hard-coding them
 * (CLAUDE.md "fetch reference/option data from the API").
 *
 *   GET /api/colleges/universities?q=  ->  { universities: { id, name, state }[] }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/college";

// Universities are few (tens, not thousands), so a single unpaginated list is
// fine — the client filters/searches within it.
const MAX = 2000;

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = sanitizeSearch(req.nextUrl.searchParams.get("q") ?? "");

  const supabase = await createClient();
  let query = supabase
    .from("university")
    .select("id, name, state")
    .eq("status", "active")
    .order("name")
    .limit(MAX);

  if (q) query = query.or(`name.ilike.%${q}%,place.ilike.%${q}%,district.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ universities: data ?? [] });
}
