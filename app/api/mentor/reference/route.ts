/**
 * Reference-data for the mentor registration form: every option set served from
 * the public-read `ref_*` tables, so the form never hard-codes them (CLAUDE.md
 * "API design first"). career_goal/industry/mentoring_area/mentor_mode/
 * contribution_type include `id` because those map to FK columns; degree/branch/
 * skill are matched by `slug`.
 *
 * The option-set reads are cached (lib/ref-cache.ts) — identical for every user
 * and rarely changing — so this endpoint hits the DB once per hour, not on every
 * form load. The auth gate below still runs per-request.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REF_TABLES } from "@/lib/mentor-registration";
import { getRefData } from "@/lib/ref-cache";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    return NextResponse.json(await getRefData(REF_TABLES, "mentor"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
