/**
 * The one gate for the local dev sign-in shortcut (`/dev/auth`).
 *
 * WHAT THIS IS NOT
 *   It does NOT weaken the real auth path. There is no branch anywhere in
 *   middleware, getAuthContext(), or any RLS policy that trusts a flag. The
 *   shortcut is an ADDITIVE route that mints a genuine Supabase session for a
 *   chosen user, exactly as platform-admin impersonation already does
 *   (app/impersonation/actions.ts). So a "bypassed" session is a real session:
 *   the JWT, auth_context(), RLS and the nav all resolve normally.
 *
 *   That matters for more than tidiness. Faking getAuthContext() — the obvious
 *   reading of "bypass auth" — would leave every database query running as
 *   `anon`, so RLS would return nothing and every page would render empty. The
 *   app would look broken and the test would prove nothing. Minting a real
 *   session is the only bypass that actually exercises the thing you want to
 *   test.
 *
 * FAIL-CLOSED, THREE INDEPENDENT CONDITIONS
 *   All three must hold, and any doubt means off:
 *     1. BYPASS_AUTH === "true"          — explicit opt-in, exact string.
 *     2. NODE_ENV !== "production"       — `next dev` only; a local
 *                                          `next build && next start` is also
 *                                          production and stays off.
 *     3. no VERCEL env var               — set on every Vercel deployment,
 *                                          preview included. This is the one
 *                                          that makes shipping it inert.
 *
 *   `BYPASS_AUTH` has no NEXT_PUBLIC_ prefix, so it is never bundled into
 *   client code and cannot be read or set from the browser. Do not add one, and
 *   do not set this variable in Vercel — condition 3 would ignore it anyway.
 */

/** True only on a local `next dev` server with BYPASS_AUTH=true. */
export function devAuthEnabled(): boolean {
  return (
    process.env.BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL
  );
}

/**
 * Guard for every dev-auth entry point. Each server action and page calls this
 * itself rather than relying on one upstream check, so adding a new entry point
 * cannot accidentally inherit an unguarded path.
 */
export function assertDevAuth(): void {
  if (!devAuthEnabled()) {
    throw new Error("Dev sign-in is disabled.");
  }
}

/**
 * Emails the shortcut is allowed to create accounts for. Confining test users to
 * unroutable/reserved domains means a slip cannot mint an account on somebody's
 * real address, and makes the test rows obvious in the users table later.
 * `.test`, `.invalid`, `.example` and `.localhost` are reserved by RFC 2606/6761
 * and can never be registered; `example.com/net/org` likewise.
 */
const ALLOWED_TEST_DOMAINS = [
  ".test", ".invalid", ".example", ".localhost", ".local",
  "example.com", "example.net", "example.org",
];

export function isAllowedTestEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return ALLOWED_TEST_DOMAINS.some((d) => (d.startsWith(".") ? domain.endsWith(d) : domain === d));
}

export const TEST_EMAIL_HINT =
  "Use a reserved test domain — e.g. staff@alpha.test, admin@alpha.test, student@example.com.";

/**
 * Roles the /dev/auth seeder can grant. `none` is the important one: an account
 * with no role at all is what a self-registering college staff member starts as,
 * and it is the state that is otherwise fiddly to produce by hand.
 *
 * Lives here rather than in the actions file because a "use server" module may
 * export only async functions, and this is data the client panel also renders.
 */
export const SEED_ROLES = [
  { key: "none", label: "No role (can self-register)", needsCollege: false },
  { key: "student", label: "Student", needsCollege: true },
  { key: "college_admin", label: "College Admin", needsCollege: true },
  { key: "college_staff", label: "College Staff (already approved)", needsCollege: true },
  { key: "platform_admin", label: "Platform Admin", needsCollege: false },
  { key: "coordinator", label: "Coordinator", needsCollege: false },
  { key: "owner", label: "Owner", needsCollege: false },
] as const;

/** Roles whose grant carries a scope_college_id. */
export const SCOPED_SEED_ROLES = new Set(["college_admin", "college_staff", "student"]);
