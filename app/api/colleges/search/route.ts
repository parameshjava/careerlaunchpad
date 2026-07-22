/** Typeahead search for the invite form's college picker (the college table has
 * ~10k rows, so we never ship them all to the client). Auth required. */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Match EACH whitespace-separated word independently (word-AND), and each word
  // against name OR place OR district OR college_code. This finds a college even
  // when the user searches by what they see in the list (e.g. "seetharama degree
  // college seetharamapuram 134" — name + place + code) or when the words aren't
  // contiguous in the stored name. `.or()` uses PostgREST filter syntax where the
  // ilike wildcard is `*`; terms are sanitised so they can't break that syntax.
  let query = supabase
    .from("college")
    // Include the detail columns so pickers can show the full college (no
    // separate college.manage-gated fetch needed).
    .select(
      "id, name, place, state, district, pincode, address, established_in, ownership_type, status",
    )
    .order("name")
    .limit(30);
  for (const raw of q.split(/\s+/)) {
    const term = raw.replace(/[(),*%]/g, "").trim();
    if (!term) continue;
    query = query.or(
      `name.ilike.*${term}*,place.ilike.*${term}*,district.ilike.*${term}*,college_code.ilike.*${term}*`,
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
