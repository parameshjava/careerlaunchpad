/**
 * Finalize mentor registration: full validation across the (few) required
 * fields, then flip registration_status -> 'submitted'. This marks the form
 * complete and ready for review — it does NOT approve the mentor; the vetting
 * `status` stays 'pending_review' until a reviewer acts (set_mentor_status).
 * On failure returns the missing fields so the form can jump back.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_FIELDS } from "@/lib/mentor-registration";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("mentor_profile")
    .select("full_name, mentoring_area_ids, mentor_mode_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ ok: false, error: "No mentor profile" }, { status: 404 });

  const p = profile as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter(({ field }) => {
    const v = p[field];
    if (Array.isArray(v)) return v.length === 0;
    return v == null || v === "";
  });
  if (missing.length) return NextResponse.json({ ok: false, missing }, { status: 422 });

  const { error: upErr } = await supabase
    .from("mentor_profile")
    .update({
      registration_status: "submitted",
      registration_submitted_at: new Date().toISOString(),
      last_completed_step: 3,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, registration_status: "submitted" });
}
