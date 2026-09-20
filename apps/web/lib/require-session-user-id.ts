import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from './auth'

// Same convention app/layout.tsx/app/sitemap.ts use.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Shared by every BFF route that owns real per-user data
 * (app/api/preferences/route.ts, app/api/saved-locations/route.ts) --
 * `auth.api.getSession` reads the request's own cookies (`headers()`
 * forwards them), and a missing session is a 401 here, before the call
 * ever reaches apps/api's own 401 for an empty `X-Internal-User-Id`.
 * Both checks exist: this one gives a real Better Auth session error
 * rather than a bare relayed apps/api error, and apps/api's own check
 * is what actually protects the data if a route handler ever forgot to
 * call this.
 *
 * Sprint 44 ("Security hardening"): the explicit `Origin` check below is
 * defense-in-depth alongside the session cookie's own `SameSite=Lax`
 * policy (lib/auth.ts's Better Auth default) -- ADR-005's "state-
 * changing web routes enforce origin and CSRF validation" names both,
 * not just the cookie policy. Verified live with a real cross-site
 * `<form>` POST (the classic CSRF vector, not subject to CORS the way
 * `fetch` is) that `SameSite=Lax` already blocks on its own -- this
 * check catches the same attack a second, more direct way, and would
 * still catch it if a future browser or cookie-policy change ever
 * weakened that guarantee. A request with no `Origin` header at all
 * (not every legitimate caller sends one, e.g. a same-site top-level
 * form navigation) is left to the session check below rather than
 * rejected here.
 */
export async function requireSessionUserId(): Promise<string | NextResponse> {
  const requestHeaders = await headers()

  const origin = requestHeaders.get('origin')
  if (origin && origin !== SITE_URL) {
    return NextResponse.json({ error: 'origin mismatch' }, { status: 403 })
  }

  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 })
  }
  return session.user.id
}
