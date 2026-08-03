/**
 * OAuth callback. The provider redirects here with `?code=...`; we exchange it
 * for a session, then route the user by role.
 *
 * On the user's FIRST sign-in this is when their `auth.users` row is created,
 * which fires `handle_new_user()` (migration 005) — provisioning the account if
 * a matching pending invite exists. So by the time we read `getAuthContext()`,
 * an invited user is already provisioned; an un-invited one is not.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { safeNextPath } from "@/lib/next-path";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where the user was originally headed (set by the middleware, forwarded by the
  // login page). Re-validated here because this URL comes back from the provider.
  const next = safeNextPath(searchParams.get("next"));

  // Honour `next` only for a provisioned account: an unprovisioned user has to go
  // through /auth/no-access first, and would only bounce off the destination.
  const destination = (ctx: Awaited<ReturnType<typeof getAuthContext>>) =>
    `${origin}${next && ctx?.provisioned ? next : (ctx?.homePath ?? "/auth/no-access")}`;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Consume any pending invites addressed to this user's email — including
      // ones created AFTER their account already existed (migration 095), which
      // the first-sign-in trigger can't catch. Idempotent.
      await supabase.rpc("consume_pending_invites");
      // Route by role, unless a validated `next` says otherwise. Unprovisioned
      // (no invite) → /auth/no-access via homePath.
      const ctx = await getAuthContext();
      return NextResponse.redirect(destination(ctx));
    }
    // The exchange failed — but an OAuth `code` is single-use, so a duplicate or
    // prefetched second hit of this callback will ALWAYS fail even though the
    // first hit already created the session. If we do have a valid session, the
    // sign-in actually succeeded: send the user on instead of to the error page.
    const ctx = await getAuthContext();
    if (ctx) return NextResponse.redirect(destination(ctx));
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  // No code (e.g. provider returned an error, or the user is already signed in
  // and bounced straight back). If a session exists, route them; else show error.
  const ctx = await getAuthContext();
  if (ctx) return NextResponse.redirect(destination(ctx));
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
