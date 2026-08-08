import Link from "next/link";
import { cookies } from "next/headers";
import { devAuthEnabled } from "@/lib/dev-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * A permanent strip while BYPASS_AUTH is on, mounted once in the root layout.
 *
 * Two jobs, both about not fooling yourself. It tells you *which* account you
 * are, because with one-click switching it is genuinely easy to spend ten
 * minutes wondering why a page is empty when you are signed in as the wrong
 * person. And it makes the bypass impossible to forget, so a screenshot or a bug
 * report from this session is never mistaken for normal behaviour.
 *
 * Returns null unless devAuthEnabled() — which is false on every deployment and
 * in any production build — so this cannot render outside local dev.
 */
export async function DevAuthBanner() {
  if (!devAuthEnabled()) return null;

  let email: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    // A missing/invalid session is the normal signed-out case, not an error.
  }

  // BOTTOM, not top, for the same reason ImpersonationBanner is at the bottom:
  // SiteHeader is a normal flex child rather than fixed, so a fixed top strip
  // covers the navbar on every app surface. And when both banners are up, this
  // one sits ABOVE the impersonation strip so its Exit button stays reachable.
  const impersonating = !!(await cookies()).get("cl-impersonating");

  return (
    <div
      className={`fixed inset-x-0 z-[110] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-rose-600 px-3 py-1 text-center text-xs font-semibold text-white ${
        impersonating ? "bottom-9" : "bottom-0"
      }`}
    >
      <span>AUTH BYPASS ON</span>
      <span className="font-normal opacity-90">
        {email ? <>signed in as <b className="break-all">{email}</b></> : "not signed in"}
      </span>
      <Link href="/dev/auth" className="underline underline-offset-2">
        switch user
      </Link>
    </div>
  );
}
