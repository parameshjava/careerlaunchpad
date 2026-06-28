/**
 * Distinct, sorted list of states present in the college table — powers the
 * manage screen's state filter and the add/edit form's datalist, so neither
 * hard-codes a state list (CLAUDE.md: fetch option data from the API). PostgREST
 * has no DISTINCT, so we read the single `state` column and dedupe here; the
 * column is short and this loads once, which is fine for an admin screen.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("college")
    .select("state")
    .not("state", "is", null)
    .order("state");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const states = [...new Set((data ?? []).map((r) => (r.state as string).trim()).filter(Boolean))];
  return NextResponse.json({ states });
}
