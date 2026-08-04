/**
 * Request-level audit capture for student registration (issue #83).
 *
 * The client IP and user agent live in HTTP headers, so a database trigger can
 * never see them — they have to be read in the route handler and handed to
 * `record_registration_activity()` (migration 160). Everything else about the
 * audit (who acted, when, revision count) is stamped in the database precisely so
 * it CANNOT be forgotten at a call site; these two values are the exception.
 *
 * TRUST NOTE — read before reusing `clientIp` for anything security-bearing:
 * `x-forwarded-for` is a request header, so a client can send whatever it likes.
 * It is trustworthy here only because Vercel's edge OVERWRITES it with the real
 * peer address before our function runs. Behind any other proxy — or none — this
 * value is attacker-controlled. It is fine for an audit hint; do not gate access
 * on it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort client IP. XFF is a comma-separated chain (`client, proxy1, …`) so
 * the leftmost entry is the original client; `x-real-ip` is the single-value
 * fallback some platforms set instead. Returns null when neither is present
 * (local `npm run dev`, for instance) — the audit records the event without an
 * address rather than inventing one.
 */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    // Strip an IPv4 port if the proxy appended one ("1.2.3.4:5678"). A bare IPv6
    // address also contains colons, so only split when there's exactly one.
    if (first) {
      const bare = first.split(":").length === 2 ? first.split(":")[0] : first;
      if (bare) return bare;
    }
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

/** The browser's user agent, truncated — the DB column is capped at 400 chars too. */
export function userAgent(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 400) || null;
}

/**
 * Record a registration save or submit. `submit` bumps the revision counter and
 * appends a timeline row; `save` only refreshes the last-seen IP so an abandoned
 * registration is still attributable.
 *
 * Deliberately never throws: an audit failure must not fail a student's
 * registration. Errors are logged for operators and swallowed for the caller.
 */
export async function recordRegistrationActivity(
  supabase: SupabaseClient,
  req: Request,
  studentUserId: string,
  kind: "save" | "submit",
): Promise<void> {
  const { error } = await supabase.rpc("record_registration_activity", {
    p_student: studentUserId,
    p_kind: kind,
    p_ip: clientIp(req),
    p_user_agent: userAgent(req),
  });
  if (error) {
    console.error(`[audit] registration ${kind} for ${studentUserId}: ${error.message}`);
  }
}
