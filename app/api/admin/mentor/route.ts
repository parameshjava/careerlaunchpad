/**
 * POST /api/admin/mentor   body: { email, profile }
 * Add a mentor WITH their full profile: creates a mentor invite carrying the
 * staged profile (see migration 040) and emails them the login link. They show
 * as Pending until first sign-in, at which point handle_new_user() materialises
 * their mentor_profile from the staged JSON. Auth: user.invite.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/mailer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const INVITE_TTL_DAYS = 14;

// Whitelisted profile keys (mirror mentor_profile columns). Strings + arrays are
// stored as-is; handle_new_user() casts numbers/uuids on merge.
const STR_KEYS = [
  "full_name", "phone", "linkedin_url", "bio", "college_id", "graduation_year",
  "degree", "branch", "current_company", "current_title", "industry_id",
  "years_experience", "mentor_mode_id", "contribution_type_id", "availability",
] as const;
const ARR_KEYS = ["mentoring_area_ids", "skills", "career_goal_ids"] as const;

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requirePermission("user.invite");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const profile = (body?.profile ?? {}) as Record<string, unknown>;
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 422 });
  }

  const staged: Record<string, unknown> = {};
  for (const k of STR_KEYS) {
    const v = String(profile[k] ?? "").trim();
    if (v) staged[k] = v;
  }
  for (const k of ARR_KEYS) {
    const v = profile[k];
    staged[k] = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  }

  const supabase = await createClient();
  const { data: role, error: roleErr } = await supabase
    .from("role").select("id, name").eq("key", "mentor").single();
  if (roleErr || !role) return NextResponse.json({ error: "Mentor role missing" }, { status: 500 });

  const { error } = await supabase.from("invite").insert({
    email,
    role_id: role.id,
    invited_by: ctx.userId,
    expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString(),
    staged_profile: staged,
  });
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "There's already a pending invite for this email." : error.message },
      { status },
    );
  }

  await sendInviteEmail({
    to: email,
    roleName: role.name,
    invitedBy: ctx.email,
    loginUrl: `${SITE_URL}/auth/login`,
  });

  return NextResponse.json({ ok: true, email });
}
