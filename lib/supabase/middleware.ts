import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and supabase.auth.getUser().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.
  //
  // We use getUser() (not getClaims()) on purpose: it validates the token with
  // the auth server AND refreshes/rotates an expired session, writing the new
  // cookies onto supabaseResponse via setAll above. Local-only verification
  // (getClaims) can leave an expired-but-refreshable session looking signed-out,
  // which bounces a user who actually has a valid session back to /auth/login.
  const { data: { user } } = await supabase.auth.getUser()

  // Only the application surfaces require auth — the marketing site (/) and the
  // /auth/* pages stay public. (The matcher in middleware.ts already scopes this,
  // but we re-check defensively.)
  const PROTECTED_PREFIXES = ['/dashboard', '/student', '/employer']
  const path = request.nextUrl.pathname
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`)
  )

  if (!user && needsAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
