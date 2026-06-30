/**
 * College management list + create (CLAUDE.md "API design first"). Reads are open
 * to any signed-in user (the table is public-read for dropdowns); writes require
 * the `college.manage` permission — held by owner ('*') and platform_admin — and
 * RLS (college_owner_manage) enforces it again at the database.
 *
 *   GET  /api/colleges?q=&state=&ownership=&status=&page=&pageSize=&sort=&dir=
 *        -> { colleges: College[], total, page, pageSize }
 *        sort ∈ SORTABLE (default name), dir ∈ asc|desc (default asc).
 *   POST /api/colleges  body: CollegeInput  -> { ok, id }  (409 on duplicate)
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, requirePermission } from "@/lib/auth";
import {
  COLLEGE_SELECT,
  SELF_UNIVERSITY,
  parseCollegeInput,
  sanitizeSearch,
  type CollegeStatus,
} from "@/lib/college";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Columns the client may sort by (whitelist — never trust a raw column name in
// .order()). University is a foreign embed, so it isn't sortable here.
const SORTABLE = new Set([
  "college_code", "name", "place", "district", "state",
  "pincode", "established_in", "ownership_type", "status",
]);

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const q = sanitizeSearch(sp.get("q") ?? "");
  const state = (sp.get("state") ?? "").trim();
  const ownership = (sp.get("ownership") ?? "").trim();
  const university = (sp.get("university") ?? "").trim();
  // Default to active so the manage screen isn't dominated by archived rows;
  // pass status=all to include both, or status=archived for just archived.
  const status = (sp.get("status") ?? "active").trim() as CollegeStatus | "all";

  const sortReq = (sp.get("sort") ?? "name").trim();
  const sort = SORTABLE.has(sortReq) ? sortReq : "name";
  const ascending = (sp.get("dir") ?? "asc").trim().toLowerCase() !== "desc";

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;

  const supabase = await createClient();
  let query = supabase
    .from("college")
    .select(COLLEGE_SELECT, { count: "exact" })
    .order(sort, { ascending, nullsFirst: false })
    .range(from, from + pageSize - 1);
  // Stable tiebreak so paging is deterministic when the sort column has ties.
  if (sort !== "name") query = query.order("name", { ascending: true });
  query = query.order("id", { ascending: true });

  if (status !== "all") query = query.eq("status", status);
  if (state) query = query.eq("state", state);
  if (ownership) query = query.eq("ownership_type", ownership);
  // university=<id> → show that university's affiliates (and the university row
  // itself, which is its own affiliate via self-association).
  if (university) query = query.eq("university_id", university);
  if (q) query = query.or(`name.ilike.%${q}%,place.ilike.%${q}%,district.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ colleges: data ?? [], total: count ?? 0, page, pageSize });
}

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requirePermission("college.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCollegeInput(body, { partial: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });

  // The SELF_UNIVERSITY sentinel can't be stored as-is — the row's own id isn't
  // known until after insert, so insert with NULL then self-associate.
  const selfUniversity = parsed.values.university_id === SELF_UNIVERSITY;
  const insertValues = { ...parsed.values, created_by: ctx.userId };
  if (selfUniversity) insertValues.university_id = null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college")
    .insert(insertValues)
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on (name, place, pincode).
    const status = error.code === "23505" ? 409 : 500;
    const message =
      status === 409
        ? "A college with this name, place and pincode already exists."
        : error.message;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  if (selfUniversity) {
    await supabase.from("college").update({ university_id: data.id }).eq("id", data.id);
  }
  return NextResponse.json({ ok: true, id: data.id });
}
