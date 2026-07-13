import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the SECRET key — it BYPASSES RLS. Never
 * import this into a client component and never expose SUPABASE_SECRET_KEY to
 * the browser (no NEXT_PUBLIC_ prefix). Used solely by privileged server actions
 * (user impersonation): looking up a target user and minting their session via
 * the admin auth API. Everything else must use the RLS-bound clients in
 * `lib/supabase/server.ts`.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never run in the browser");
  }
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
