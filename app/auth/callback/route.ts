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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Route by role. Unprovisioned (no invite) → /auth/no-access via homePath.
      const ctx = await getAuthContext();
      return NextResponse.redirect(`${origin}${ctx?.homePath ?? "/auth/no-access"}`);
    }
    // The exchange failed — but an OAuth `code` is single-use, so a duplicate or
    // prefetched second hit of this callback will ALWAYS fail even though the
    // first hit already created the session. If we do have a valid session, the
    // sign-in actually succeeded: send the user on instead of to the error page.
    const ctx = await getAuthContext();
    if (ctx) return NextResponse.redirect(`${origin}${ctx.homePath}`);
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  // No code (e.g. provider returned an error, or the user is already signed in
  // and bounced straight back). If a session exists, route them; else show error.
  const ctx = await getAuthContext();
  if (ctx) return NextResponse.redirect(`${origin}${ctx.homePath}`);
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
