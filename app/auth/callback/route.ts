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

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  // Route by role. Unprovisioned (no invite) → /auth/no-access (homePath handles it).
  const ctx = await getAuthContext();
  return NextResponse.redirect(`${origin}${ctx?.homePath ?? "/auth/no-access"}`);
}
