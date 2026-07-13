"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

// Impersonation cookies (both httpOnly — the banner reads the marker server-side):
//  - ORIGIN holds the ADMIN's own tokens so Exit can restore them.
//  - MARKER holds display + audit ids and signals "currently impersonating".
const ORIGIN_COOKIE = "cl-imp-origin";
const MARKER_COOKIE = "cl-impersonating";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8h — well under normal refresh-token life.

// A platform admin may only view "downward". Never act as an owner/platform_admin.
const BLOCKED_TARGET_ROLES = new Set(["owner", "platform_admin"]);

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/**
 * Owner / platform_admin becomes `targetUserId` for real: mints the target's
 * Supabase session (generateLink → verifyOtp) so the JWT, auth_context(), RLS,
 * and every query authentically resolve to the target. Redirects to their home.
 */
export async function enterImpersonation(targetUserId: string) {
  const ctx = await getAuthContext();
  const isAdmin =
    !!ctx && (ctx.permissions.has("*") || ctx.roles.includes("platform_admin") || ctx.roles.includes("owner"));
  if (!ctx || !isAdmin) throw new Error("Forbidden");

  const jar = await cookies();
  if (jar.get(ORIGIN_COOKIE)) throw new Error("Exit the current view-as first.");
  if (targetUserId === ctx.userId) throw new Error("You cannot view as yourself.");

  const admin = createAdminClient();

  // Target must exist, be active, hold no admin role, and have an email.
  const { data: target } = await admin
    .from("app_user")
    .select("id, email, status, user_role(role:role_id(key))")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target) throw new Error("User not found.");
  if (target.status !== "active") throw new Error("That account is not active.");
  const email = target.email as string | null;
  if (!email) throw new Error("That user has no email to sign in with.");
  const targetRoles = ((target.user_role ?? []) as { role: { key?: string } | { key?: string }[] | null }[])
    .flatMap((ur) => (Array.isArray(ur.role) ? ur.role : [ur.role]))
    .map((r) => r?.key)
    .filter((k): k is string => !!k);
  if (targetRoles.some((r) => BLOCKED_TARGET_ROLES.has(r))) {
    throw new Error("You cannot view as an owner or platform admin.");
  }

  // Stash the admin's own session so Exit can restore it.
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session.");
  jar.set(
    ORIGIN_COOKIE,
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
    cookieOpts(),
  );

  // Mint the target's session. generateLink only GENERATES (no email is sent);
  // verifyOtp on the cookie client swaps the browser to the target identity.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const props = link?.properties as { hashed_token?: string; verification_type?: string } | undefined;
  const tokenHash = props?.hashed_token;
  if (linkErr || !tokenHash) {
    jar.delete(ORIGIN_COOKIE);
    throw new Error(linkErr?.message ?? "Could not start the view-as session.");
  }
  const { error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: (props?.verification_type ?? "email") as EmailOtpType,
  });
  if (otpErr) {
    jar.delete(ORIGIN_COOKIE);
    throw new Error(otpErr.message);
  }

  jar.set(
    MARKER_COOKIE,
    JSON.stringify({ targetLabel: email, adminId: ctx.userId, targetId: targetUserId }),
    cookieOpts(),
  );
  await admin.from("impersonation_log").insert({ admin_id: ctx.userId, target_id: targetUserId, action: "enter" });

  // The session is now the target's, so a fresh context yields their home path.
  const targetCtx = await getAuthContext();
  redirect(targetCtx?.homePath ?? "/student");
}

/** Restore the admin's own session and end the impersonation. */
export async function exitImpersonation() {
  const jar = await cookies();
  const rawMarker = jar.get(MARKER_COOKIE)?.value;
  const rawOrigin = jar.get(ORIGIN_COOKIE)?.value;
  jar.delete(MARKER_COOKIE);
  jar.delete(ORIGIN_COOKIE);

  let marker: { adminId?: string; targetId?: string } = {};
  try { marker = rawMarker ? JSON.parse(rawMarker) : {}; } catch {}

  let restored = false;
  if (rawOrigin) {
    try {
      const tokens = JSON.parse(rawOrigin) as { access_token: string; refresh_token: string };
      const supabase = await createClient();
      const { error } = await supabase.auth.setSession(tokens);
      restored = !error;
    } catch {
      restored = false;
    }
  }

  if (marker.adminId && marker.targetId) {
    await createAdminClient()
      .from("impersonation_log")
      .insert({ admin_id: marker.adminId, target_id: marker.targetId, action: "exit" });
  }

  redirect(restored ? "/dashboard" : "/auth/login");
}
