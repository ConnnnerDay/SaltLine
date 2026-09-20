import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { internalApiFetch } from '@/lib/internal-api-client'

// Live per-request proxy -- never cached.
export const dynamic = 'force-dynamic'

export type LocationSearchResult = {
  id: string
  name: string
  state: string
  lat: number
  lng: number
}

/**
 * BFF proxy for sprint 31's text location search: the browser never
 * calls apps/api directly (ADR-004), so this Route Handler is the one
 * place a Client Component's fetch can land. It forwards `?q=` to
 * apps/api's `GET /v1/locations/search` through the signed internal
 * path (lib/internal-api-client.ts) and returns the result as plain
 * JSON.
 *
 * Session-gated since sprint 29 ("account-required routing" --
 * docs/product-definition.md's "core browsing requires a verified
 * account"): app/locations/page.tsx (this route's only caller) already
 * redirects an anonymous visitor to /login before it can render the
 * search form that would call this, but that's a page-level redirect,
 * not a guarantee on this endpoint itself -- this route needs its own
 * check so a direct `fetch('/api/locations/search?q=...')` can't
 * bypass it. `apps/api`'s own `GET /v1/locations/search` stays
 * unauthenticated at the signature level (nothing there names a
 * `user_id` requirement) since it has nothing per-user to leak; the
 * "core browsing requires an account" boundary lives here, at the one
 * place a browser can actually reach it.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 })
  }

  try {
    const results = await internalApiFetch<LocationSearchResult[]>(
      `/v1/locations/search?q=${encodeURIComponent(q)}`,
      { userId: session.user.id },
    )
    return NextResponse.json(results)
  } catch {
    return NextResponse.json(
      { error: 'location search is temporarily unavailable' },
      { status: 502 },
    )
  }
}
