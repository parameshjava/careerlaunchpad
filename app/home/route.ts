/**
 * Brand-logo destination. Resolves per-user server-side: a signed-in user goes
 * to their role dashboard (getAuthContext().homePath — student→/student,
 * console roles→/dashboard, employer→/employer, mentor→/mentor), everyone else
 * to the marketing home. This lets the logo be a single static link on every
 * surface (marketing Navbar + app SiteHeader) without making the marketing
 * pages dynamic — the redirect, not the page, reads the session.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  return NextResponse.redirect(new URL(ctx ? ctx.homePath : "/", request.url));
}
