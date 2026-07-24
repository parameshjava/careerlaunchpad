/**
 * Finalize a *target* mentor's registration from the console (mentor.review):
 * validates the required fields and flips registration_status -> 'submitted'.
 * Does NOT touch the vetting `status` (approval stays a separate review action).
 * On failure returns the missing fields so the wizard can jump back.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { REQUIRED_FIELDS } from "@/lib/mentor-registration";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePermission("mentor.review");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { userId } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("mentor_profile")
    .select("full_name, mentoring_area_ids, mentor_mode_id")
    .eq("user_id", userId)
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
    .eq("user_id", userId);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, registration_status: "submitted" });
}
