/**
 * Reference-data for the registration form: every option set (dropdowns/chips)
 * served from the public-read `ref_*` tables, so the form never hard-codes them
 * (CLAUDE.md "API design first"). career_goal/mentor_preference include `id`
 * because those map to FK columns; the rest are matched by `slug`.
 *
 * The option-set reads are cached (lib/ref-cache.ts) — identical for every user
 * and rarely changing — so this endpoint hits the DB once per hour, not on every
 * form load. The auth gate below still runs per-request.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REF_TABLES } from "@/lib/registration";
import { getRefData, getPreferenceData } from "@/lib/ref-cache";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const [refData, preference] = await Promise.all([
      getRefData(REF_TABLES, "registration"),
      getPreferenceData(),
    ]);
    return NextResponse.json({ ...refData, ...preference });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
