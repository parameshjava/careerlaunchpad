/**
 * Reference-data for the mentor registration form: every option set served from
 * the public-read `ref_*` tables, so the form never hard-codes them (CLAUDE.md
 * "API design first"). career_goal/industry/mentoring_area/mentor_mode/
 * contribution_type include `id` because those map to FK columns; degree/branch/
 * skill are matched by `slug`.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REF_TABLES } from "@/lib/mentor-registration";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const entries = await Promise.all(
    Object.entries(REF_TABLES).map(async ([key, table]) => {
      const { data, error } = await supabase
        .from(table)
        .select("id, slug, label, category, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw new Error(`${table}: ${error.message}`);
      return [key, data ?? []] as const;
    }),
  ).catch((e: Error) => e);

  if (entries instanceof Error) {
    return NextResponse.json({ error: entries.message }, { status: 500 });
  }
  return NextResponse.json(Object.fromEntries(entries));
}
