/**
 * Admin-side College Staff invites.
 *
 *   POST  body { email, college_id, profile, subjects } -> invite + email
 *   PATCH body { inviteId, email, profile, subjects }   -> edit a PENDING invite
 *
 * WHY THIS IS NOT createInvite(). app/dashboard/users/actions.ts#createInvite
 * checks only `user.invite` and then trusts the role key in the request body, so
 * giving a College Admin that permission — the obvious way to let them invite
 * staff — would also let them invite an OWNER. Instead they hold
 * `college.staff.invite`, and the work is done by invite_college_staff()
 * (migration 175 §10b), a SECURITY DEFINER RPC that hard-codes
 * role = college_staff and forces the scope to a college the caller is
 * authorized for. The role and scope are never caller-supplied.
 *
 * An invited staff member is AUTO-APPROVED: _provision_from_invites materialises
 * their profile with status='approved' at first sign-in (#107 rule 3). That is
 * sound precisely because this is the only door into the invite.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, can } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/mailer";
import { ALL_FIELDS, validatePartial, validateSubjects } from "@/lib/college-staff-registration";
import { knownSubjectIds } from "@/lib/college-staff-query";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const INVITE_TTL_DAYS = 14;

/**
 * Build the staged profile from a raw payload: run it through the SAME validator
 * the self-serve form uses, then keep only whitelisted keys. An admin-entered
 * profile is materialised straight into the table at provisioning, so it has to
 * clear the same bar — otherwise the invite path is a way to write values the
 * form would have rejected.
 */
async function buildStaged(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: Record<string, unknown>,
  subjects: unknown,
): Promise<{ staged: Record<string, unknown>; errors: string[] }> {
  const picked = Object.fromEntries(
    Object.entries(profile ?? {}).filter(([k]) => ALL_FIELDS.includes(k)),
  );
  const { clean, errors } = await validatePartial(supabase, picked);

  const known = await knownSubjectIds(supabase);
  const { rows, errors: subjErrors } = validateSubjects(subjects, known);
  errors.push(...subjErrors);

  // _provision_from_invites reads scalars out of the jsonb with ->>, so drop
  // nulls rather than storing them: an absent key falls back to the column
  // default, a JSON null would be cast to a SQL null and clobber it.
  const staged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (v !== null && v !== undefined && v !== "") staged[k] = v;
  }
  if (rows.length) staged.subjects = rows;

  return { staged, errors };
}

/** The caller may invite into `collegeId` — globally, or scoped to it. */
async function canInviteInto(collegeId: string) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.provisioned || ctx.status === "suspended") return null;
  // App-level gate only; invite_college_staff() re-checks the SCOPE in the DB,
  // which is what actually stops a college A admin inviting into college B.
  if (!can(ctx, "college.staff.invite")) return null;
  if (!collegeId) return null;
  return ctx;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const collegeId = String(body?.college_id ?? "");
  const profile = (body?.profile ?? {}) as Record<string, unknown>;

  const ctx = await canInviteInto(collegeId);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 422 });
  }

  const supabase = await createClient();
  const { staged, errors } = await buildStaged(supabase, profile, body?.subjects);
  if (errors.length) return NextResponse.json({ errors }, { status: 422 });

  const { error } = await supabase.rpc("invite_college_staff", {
    p_email: email,
    p_college: collegeId,
    p_profile: staged,
    p_ttl_days: INVITE_TTL_DAYS,
  });
  if (error) {
    // The RPC raises for a duplicate invite, an existing account, and an
    // unauthorized college — all of which are the caller's problem, not a bug.
    const conflict = /already/i.test(error.message);
    const forbidden = /Forbidden/i.test(error.message);
    return NextResponse.json(
      { error: error.message },
      { status: forbidden ? 403 : conflict ? 409 : 500 },
    );
  }

  await sendInviteEmail({
    to: email,
    roleName: "College Staff",
    invitedBy: ctx.email,
    loginUrl: `${SITE_URL}/auth/login`,
  });

  return NextResponse.json({ ok: true, email });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const inviteId = String(body?.inviteId ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  const profile = (body?.profile ?? {}) as Record<string, unknown>;

  if (!inviteId) return NextResponse.json({ error: "inviteId is required" }, { status: 422 });
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invite")
    .select("id, status, scope_college_id, role:role_id(key)")
    .eq("id", inviteId)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const roleKey = Array.isArray(inv.role) ? inv.role[0]?.key : (inv.role as { key?: string } | null)?.key;
  if (roleKey !== "college_staff") {
    return NextResponse.json({ error: "Not a college staff invite." }, { status: 400 });
  }
  if (inv.status !== "pending") {
    return NextResponse.json({ error: "This invite is no longer pending and can't be edited." }, { status: 409 });
  }

  // Re-check against the invite's OWN college, not one the caller supplied —
  // otherwise a college A admin could edit a college B invite by id.
  const ctx = await canInviteInto(String(inv.scope_college_id ?? ""));
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { staged, errors } = await buildStaged(supabase, profile, body?.subjects);
  if (errors.length) return NextResponse.json({ errors }, { status: 422 });

  // The `invite` table's UPDATE policy is user.invite / invite.resend (009),
  // which a college admin does not hold — so this write goes through the same
  // scoped RPC path rather than a direct update they cannot perform.
  const { error } = await supabase.rpc("update_college_staff_invite", {
    p_invite: inviteId,
    p_email: email,
    p_profile: staged,
  });
  if (error) {
    const conflict = /already/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, email });
}
