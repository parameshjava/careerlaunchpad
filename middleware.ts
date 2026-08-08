import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Runs only on the application surfaces — refreshes the Supabase session and
// redirects unauthenticated users to /auth/login. The marketing site and
// /auth/* pages are intentionally NOT matched, so they stay public and fast.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/student/:path*",
    "/employer/:path*",
    // College Staff registration + status. Included because an UNAPPROVED
    // registrant lives here for as long as review takes, so a stale session
    // would otherwise strand them on a page their own layout then bounces.
    "/college-staff/:path*",
  ],
};
