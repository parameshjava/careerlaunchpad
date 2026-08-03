/**
 * Validation for the `?next=` post-login destination.
 *
 * The middleware records where an unauthenticated visitor was heading, the login
 * page forwards it through the OAuth round trip, and the callback sends them
 * there afterwards. That value comes off a URL, so it is attacker-controlled and
 * must never be able to point off-site — an open redirect on a login flow is a
 * credible phishing primitive.
 *
 * Only a same-origin absolute path is accepted. Everything else (absolute URLs,
 * protocol-relative `//evil.com`, backslash variants Windows/browsers may
 * normalise, and paths back into /auth/*, which would loop) returns null and the
 * caller falls back to the user's home surface.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  // A single leading slash and nothing that could re-target the host.
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  // Control characters (including encoded newlines) have no business in a path.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  // Bouncing back into the auth flow would loop through sign-in again.
  if (value === "/auth" || value.startsWith("/auth/")) return null;
  return value;
}
